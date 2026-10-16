-- =========================================================
-- Apartados 2.0 · Migración 10
-- Nuevo rol "staff" (ayuda como admin, pero SIN ver cobranzas).
-- El master ve inscripciones y finanzas en solo lectura.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Nuevo rol: participante | staff | admin | master
-- ---------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles
  add constraint profiles_rol_check check (rol in ('participante', 'staff', 'admin', 'master'));

-- ---------------------------------------------------------
-- 2. Helpers
--    puede_organizar(): staff, admin o master (entran al panel)
--    is_admin():        admin o master (ven cobranzas y gestionan)
--    is_master():       solo master (roles, equipos, habitaciones)
-- ---------------------------------------------------------
create or replace function public.puede_organizar()
returns boolean
language sql security definer stable set search_path = public
as $$ select coalesce(public.current_rol() in ('staff', 'admin', 'master'), false); $$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$ select coalesce(public.current_rol() in ('admin', 'master'), false); $$;

-- ---------------------------------------------------------
-- 3. Listado de participantes: lo ven todos los organizadores
-- ---------------------------------------------------------
create or replace function public.participantes_lista()
returns table (
  id uuid, nombre text, email text, telefono text, edad int, iglesia text,
  talla text, emergencia text, notas text, rol text, avatar_path text,
  equipo_id uuid, equipo_nombre text, equipo_color text,
  equipo_pendiente_id uuid, equipo_pendiente_nombre text, equipo_pendiente_color text,
  habitacion_id uuid, habitacion_nombre text, created_at timestamptz
)
language sql security definer stable set search_path = public
as $$
  select
    p.id, p.nombre, p.email, p.telefono, p.edad, p.iglesia,
    p.talla, p.emergencia, p.notas, p.rol, p.avatar_path,
    p.equipo_id, e.nombre, e.color,
    p.equipo_pendiente_id, ep.nombre, ep.color,
    p.habitacion_id, h.nombre, p.created_at
  from public.profiles p
  left join public.equipos      e  on e.id  = p.equipo_id
  left join public.equipos      ep on ep.id = p.equipo_pendiente_id
  left join public.habitaciones h  on h.id  = p.habitacion_id
  where public.puede_organizar()
  order by p.created_at;
$$;

grant execute on function public.participantes_lista() to authenticated;

-- ---------------------------------------------------------
-- 4. Resumen: inscripciones para todo organizador,
--    cobranzas SOLO para admin/master (el master las ve igual)
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
    'sin_equipo',         (select count(*) from public.profiles where rol = 'participante' and equipo_id is null),
    'solicitudes_equipo', (select count(*) from public.profiles where equipo_pendiente_id is not null),
    'sin_habitacion',     (select count(*) from public.profiles where rol = 'participante' and habitacion_id is null),
    'equipos',            (select count(*) from public.equipos),
    'habitaciones',       (select count(*) from public.habitaciones),
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

-- ---------------------------------------------------------
-- 5. Las cobranzas siguen siendo solo para admin/master
--    (is_admin() ya excluye al staff). Se reafirman las políticas.
-- ---------------------------------------------------------
drop policy if exists "pagos_select" on public.pagos;
create policy "pagos_select"
  on public.pagos for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "pagos_insert_propio" on public.pagos;
create policy "pagos_insert_propio"
  on public.pagos for insert to authenticated
  with check (profile_id = auth.uid() and estado = 'en_revision');

-- PERFILES: el staff solo ve su propio perfil (el listado va por la función)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
