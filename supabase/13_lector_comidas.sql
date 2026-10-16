-- =========================================================
-- Apartados 2.0 · Migración 13
-- Rol "lector" (solo cámara para registrar comidas) y
-- control de comidas para master/admin/staff.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Nuevo rol: participante | lector | staff | admin | master
-- ---------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles
  add constraint profiles_rol_check check (rol in ('participante', 'lector', 'staff', 'admin', 'master'));

-- ---------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------
create or replace function public.puede_escanear()
returns boolean
language sql security definer stable set search_path = public
as $$ select coalesce(public.current_rol() in ('lector', 'staff', 'admin', 'master'), false); $$;

-- ---------------------------------------------------------
-- 3. Registrar una comida escaneando el QR
--    (lee el token del QR y marca la asistencia)
-- ---------------------------------------------------------
create or replace function public.registrar_comida(p_token uuid, p_comida uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_perfil   uuid;
  v_nombre   text;
  v_comida   text;
  v_ya       boolean;
  v_ultima   timestamptz;
  v_restante int;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if not public.puede_escanear() then
    raise exception 'Tu usuario no puede registrar comidas.';
  end if;

  select id, nombre into v_perfil, v_nombre
  from public.profiles where qr_token = p_token;

  if v_perfil is null then
    return json_build_object('ok', false, 'motivo', 'no_encontrado');
  end if;

  select nombre into v_comida from public.comidas where id = p_comida;
  if v_comida is null then
    raise exception 'La comida seleccionada no existe.';
  end if;

  -- 1) ¿ya registró ESTA comida?
  select exists(
    select 1 from public.asistencias_comida
    where profile_id = v_perfil and comida_id = p_comida
  ) into v_ya;

  if v_ya then
    return json_build_object(
      'ok', true, 'ya_registrado', true,
      'nombre', v_nombre, 'comida', v_comida
    );
  end if;

  -- 2) Bloqueo de 30 minutos tras el último escaneo (evita repeticiones indebidas)
  select max(created_at) into v_ultima
  from public.asistencias_comida
  where profile_id = v_perfil;

  if v_ultima is not null and now() - v_ultima < interval '30 minutes' then
    v_restante := ceil(extract(epoch from (interval '30 minutes' - (now() - v_ultima))) / 60)::int;
    return json_build_object(
      'ok', true, 'bloqueado', true,
      'nombre', v_nombre, 'comida', v_comida, 'minutos', v_restante
    );
  end if;

  insert into public.asistencias_comida (profile_id, comida_id, registrado_por)
  values (v_perfil, p_comida, v_uid);

  return json_build_object(
    'ok', true, 'ya_registrado', false,
    'nombre', v_nombre, 'comida', v_comida
  );
end;
$$;

grant execute on function public.registrar_comida(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- 4. Resúmenes para el panel (master/admin/staff)
-- ---------------------------------------------------------
create or replace function public.comidas_resumen()
returns table (id uuid, nombre text, dia date, orden int, participantes int, comieron int)
language sql
security definer stable set search_path = public
as $$
  select
    c.id, c.nombre, c.dia, c.orden,
    (select count(*)::int from public.profiles p where p.rol = 'participante'),
    (select count(*)::int from public.asistencias_comida a where a.comida_id = c.id)
  from public.comidas c
  where public.puede_escanear()
  order by c.dia, c.orden, c.nombre;
$$;

create or replace function public.comida_asistentes(p_comida uuid)
returns table (profile_id uuid, nombre text, equipo text, equipo_color text, asistio boolean, hora timestamptz)
language sql
security definer stable set search_path = public
as $$
  select
    p.id, p.nombre, e.nombre, e.color,
    (a.id is not null) as asistio,
    a.created_at
  from public.profiles p
  left join public.equipos e on e.id = p.equipo_id
  left join public.asistencias_comida a
         on a.profile_id = p.id and a.comida_id = p_comida
  where public.puede_organizar() and p.rol = 'participante'
  order by p.nombre;
$$;

grant execute on function public.comidas_resumen() to authenticated;
grant execute on function public.comida_asistentes(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5. RLS: el staff/master/admin ven las asistencias; el lector solo registra
-- ---------------------------------------------------------
drop policy if exists "asistencias_select" on public.asistencias_comida;
create policy "asistencias_select"
  on public.asistencias_comida for select to authenticated
  using (profile_id = auth.uid() or public.puede_organizar());

drop policy if exists "asistencias_insert" on public.asistencias_comida;
create policy "asistencias_insert"
  on public.asistencias_comida for insert to authenticated
  with check (public.is_admin());

-- Las comidas las gestiona admin/master
drop policy if exists "comidas_admin" on public.comidas;
create policy "comidas_admin"
  on public.comidas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 6. Resumen del evento: conteo de lectores
-- ---------------------------------------------------------
create or replace function public.resumen_evento()
returns json
language sql security definer stable set search_path = public
as $$
  select case when public.puede_organizar() then json_build_object(
    'participantes',      (select count(*) from public.profiles where rol = 'participante'),
    'masters',            (select count(*) from public.profiles where rol = 'master'),
    'admins',             (select count(*) from public.profiles where rol = 'admin'),
    'staff',              (select count(*) from public.profiles where rol = 'staff'),
    'lectores',           (select count(*) from public.profiles where rol = 'lector'),
    'sin_equipo',         (select count(*) from public.profiles where rol = 'participante' and equipo_id is null),
    'solicitudes_equipo', (select count(*) from public.profiles where equipo_pendiente_id is not null),
    'sin_habitacion',     (select count(*) from public.profiles where rol = 'participante' and habitacion_id is null),
    'equipos',            (select count(*) from public.equipos),
    'habitaciones',       (select count(*) from public.habitaciones),
    'comidas',            (select count(*) from public.comidas),
    'pagos_por_verificar',    case when public.is_admin()
                              then (select count(*) from public.pagos where estado = 'en_revision') end,
    'pagos_verificados',      case when public.is_admin()
                              then (select count(*) from public.pagos where estado = 'aprobado') end,
    'recaudado',              case when public.is_admin()
                              then (select coalesce(sum(monto), 0) from public.pagos where estado = 'aprobado') end,
    'por_verificar_monto',    case when public.is_admin()
                              then (select coalesce(sum(monto), 0) from public.pagos where estado = 'en_revision') end
  ) end;
$$;

grant execute on function public.resumen_evento() to authenticated;
