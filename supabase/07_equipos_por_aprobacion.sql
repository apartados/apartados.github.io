-- =========================================================
-- Apartados 2.0 · Migración 07
-- Equipos por aprobación: el participante solicita un color y
-- el master lo aprueba. Equipos y habitaciones: solo el master.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Equipo solicitado (pendiente de aprobación)
-- ---------------------------------------------------------
alter table public.profiles add column if not exists equipo_pendiente_id uuid;

do $$ begin
  alter table public.profiles add constraint profiles_equipo_pendiente_fk
    foreign key (equipo_pendiente_id) references public.equipos (id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists profiles_equipo_pendiente_idx on public.profiles (equipo_pendiente_id);

-- ---------------------------------------------------------
-- 2. El participante SOLICITA un equipo (no lo toma directo)
-- ---------------------------------------------------------
drop function if exists public.unirse_equipo(uuid);

create or replace function public.solicitar_equipo(p_equipo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario  uuid := auth.uid();
  v_cupo     int;
  v_ocupados int;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  -- bloquea la fila del equipo para evitar sobrecupo
  select cupo into v_cupo from public.equipos where id = p_equipo for update;
  if not found then
    raise exception 'El equipo no existe.';
  end if;

  -- se cuentan los ya aprobados y las otras solicitudes pendientes
  select count(*) into v_ocupados
  from public.profiles
  where id <> v_usuario
    and (equipo_id = p_equipo or equipo_pendiente_id = p_equipo);

  if v_cupo > 0 and v_ocupados >= v_cupo then
    raise exception 'Ese equipo ya está completo.';
  end if;

  update public.profiles set equipo_pendiente_id = p_equipo where id = v_usuario;
end;
$$;

create or replace function public.cancelar_solicitud_equipo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  update public.profiles set equipo_pendiente_id = null where id = auth.uid();
end;
$$;

grant execute on function public.solicitar_equipo(uuid) to authenticated;
grant execute on function public.cancelar_solicitud_equipo() to authenticated;

-- ---------------------------------------------------------
-- 3. Protección: rol, equipo y habitación solo los toca el master
--    (los usuarios de la app; sin sesión se permite administrar)
-- ---------------------------------------------------------
create or replace function public.profiles_guard_campos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_master() then
    new.rol           := old.rol;
    new.equipo_id     := old.equipo_id;
    new.habitacion_id := old.habitacion_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_rol on public.profiles;
drop trigger if exists profiles_guard_campos on public.profiles;
create trigger profiles_guard_campos
  before update on public.profiles
  for each row execute function public.profiles_guard_campos();

drop function if exists public.profiles_guard_rol();

-- ---------------------------------------------------------
-- 4. Equipos y habitaciones: escritura solo master
-- ---------------------------------------------------------
drop policy if exists "equipos_admin" on public.equipos;
create policy "equipos_master"
  on public.equipos for all to authenticated
  using (public.is_master()) with check (public.is_master());

drop policy if exists "habitaciones_admin" on public.habitaciones;
create policy "habitaciones_master"
  on public.habitaciones for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- ---------------------------------------------------------
-- 5. Resumen de equipos con solicitudes pendientes
-- ---------------------------------------------------------
drop function if exists public.equipos_resumen();

create or replace function public.equipos_resumen()
returns table (id uuid, nombre text, color text, cupo int, ocupados int, pendientes int, orden int)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id, e.nombre, e.color, e.cupo,
    (select count(*)::int from public.profiles p where p.equipo_id = e.id),
    (select count(*)::int from public.profiles p where p.equipo_pendiente_id = e.id),
    e.orden
  from public.equipos e
  order by e.orden, e.nombre;
$$;

grant execute on function public.equipos_resumen() to authenticated;

-- ---------------------------------------------------------
-- 6. Listado de participantes con equipo aprobado y solicitado
-- ---------------------------------------------------------
drop function if exists public.participantes_lista();

create or replace function public.participantes_lista()
returns table (
  id uuid, nombre text, email text, telefono text, edad int, iglesia text,
  talla text, emergencia text, notas text, rol text, avatar_path text,
  equipo_id uuid, equipo_nombre text, equipo_color text,
  equipo_pendiente_id uuid, equipo_pendiente_nombre text, equipo_pendiente_color text,
  habitacion_id uuid, habitacion_nombre text, created_at timestamptz
)
language sql
security definer
stable
set search_path = public
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
  where public.is_admin()
  order by p.created_at;
$$;

grant execute on function public.participantes_lista() to authenticated;

-- ---------------------------------------------------------
-- 7. Resumen del evento con solicitudes por aprobar
-- ---------------------------------------------------------
create or replace function public.resumen_evento()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'participantes',        (select count(*) from public.profiles),
    'sin_equipo',           (select count(*) from public.profiles where equipo_id is null),
    'solicitudes_equipo',   (select count(*) from public.profiles where equipo_pendiente_id is not null),
    'sin_habitacion',       (select count(*) from public.profiles where habitacion_id is null),
    'equipos',              (select count(*) from public.equipos),
    'habitaciones',         (select count(*) from public.habitaciones),
    'pagos_por_verificar',  (select count(*) from public.pagos where estado = 'en_revision'),
    'pagos_verificados',    (select count(*) from public.pagos where estado = 'aprobado')
  ) end;
$$;

grant execute on function public.resumen_evento() to authenticated;
