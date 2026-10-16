-- =========================================================
-- Apartados 2.0 · Migración 02
-- Cuentas de usuario, roles (participante/admin/master),
-- equipos por color, habitaciones y control de comidas.
-- Ejecutar en: Supabase Dashboard > SQL Editor (o vía Management API)
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Ampliar perfiles con los datos del participante + QR
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists edad          int,
  add column if not exists iglesia       text,
  add column if not exists talla         text,
  add column if not exists emergencia    text,
  add column if not exists notas         text,
  add column if not exists qr_token      uuid not null default gen_random_uuid(),
  add column if not exists equipo_id     uuid,
  add column if not exists habitacion_id uuid;

create unique index if not exists profiles_qr_token_key on public.profiles (qr_token);

-- ---------------------------------------------------------
-- 2. Nuevo esquema de roles: participante / admin / master
-- ---------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_rol_check;

update public.profiles set rol = 'participante' where rol in ('joven', 'lider');
update public.profiles set rol = 'master'       where rol = 'admin';

alter table public.profiles alter column rol set default 'participante';
alter table public.profiles
  add constraint profiles_rol_check check (rol in ('participante', 'admin', 'master'));

-- ---------------------------------------------------------
-- 3. Equipos (colores) y habitaciones
-- ---------------------------------------------------------
create table if not exists public.equipos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  color      text not null,
  cupo       int  not null default 0 check (cupo >= 0),
  orden      int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.habitaciones (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  cupo       int  not null default 0 check (cupo >= 0),
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.profiles add constraint profiles_equipo_fk
    foreign key (equipo_id) references public.equipos (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_habitacion_fk
    foreign key (habitacion_id) references public.habitaciones (id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists profiles_equipo_idx on public.profiles (equipo_id);
create index if not exists profiles_habitacion_idx on public.profiles (habitacion_id);

-- ---------------------------------------------------------
-- 4. Comidas y asistencias (control con QR)
-- ---------------------------------------------------------
create table if not exists public.comidas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  dia        date not null,
  orden      int  not null default 0,
  created_at timestamptz not null default now(),
  unique (dia, nombre)
);

create table if not exists public.asistencias_comida (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  comida_id     uuid not null references public.comidas (id) on delete cascade,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (profile_id, comida_id)
);

create index if not exists asistencias_comida_comida_idx on public.asistencias_comida (comida_id);

-- ---------------------------------------------------------
-- 5. Helpers de rol (master manda sobre admin)
-- ---------------------------------------------------------
create or replace function public.current_rol()
returns text language sql security definer stable set search_path = public
as $$ select rol from public.profiles where id = auth.uid(); $$;

create or replace function public.is_master()
returns boolean language sql security definer stable set search_path = public
as $$ select coalesce(public.current_rol() = 'master', false); $$;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public
as $$ select coalesce(public.current_rol() in ('admin', 'master'), false); $$;

-- compatibilidad con el helper anterior
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public
as $$ select public.is_admin(); $$;

-- ---------------------------------------------------------
-- 6. Unirse a un equipo respetando el cupo (sin carreras)
-- ---------------------------------------------------------
create or replace function public.unirse_equipo(p_equipo uuid)
returns uuid
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
  if not exists (select 1 from public.profiles where id = v_usuario) then
    raise exception 'Tu perfil no existe.';
  end if;

  -- bloquea la fila del equipo para evitar sobrecupo con inscripciones simultáneas
  select cupo into v_cupo from public.equipos where id = p_equipo for update;
  if not found then
    raise exception 'El equipo no existe.';
  end if;

  select count(*) into v_ocupados
  from public.profiles
  where equipo_id = p_equipo and id <> v_usuario;

  if v_cupo > 0 and v_ocupados >= v_cupo then
    raise exception 'Ese equipo ya está completo.';
  end if;

  update public.profiles set equipo_id = p_equipo where id = v_usuario;
  return p_equipo;
end;
$$;

-- ---------------------------------------------------------
-- 7. Trigger de creación de perfil (copia los datos del registro)
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, email, telefono, edad, iglesia, talla, emergencia, notas, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'telefono'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'edad'), '')::int,
    nullif(trim(new.raw_user_meta_data ->> 'iglesia'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'talla'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'emergencia'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'notas'), ''),
    'participante'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- 8. Permisos base
-- ---------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.equipos, public.habitaciones to authenticated;
grant select, insert, update, delete on public.comidas to authenticated;
grant select, insert, update, delete on public.asistencias_comida to authenticated;
grant execute on function public.unirse_equipo(uuid) to authenticated;

-- ---------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------
alter table public.equipos            enable row level security;
alter table public.habitaciones       enable row level security;
alter table public.comidas            enable row level security;
alter table public.asistencias_comida enable row level security;

-- PERFILES (se conservan las políticas del esquema 01, se reafirman)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert to authenticated
  with check (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- EQUIPOS: todos los participantes los ven para poder elegir
drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
  on public.equipos for select to authenticated using (true);

drop policy if exists "equipos_admin" on public.equipos;
create policy "equipos_admin"
  on public.equipos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- HABITACIONES
drop policy if exists "habitaciones_select" on public.habitaciones;
create policy "habitaciones_select"
  on public.habitaciones for select to authenticated using (true);

drop policy if exists "habitaciones_admin" on public.habitaciones;
create policy "habitaciones_admin"
  on public.habitaciones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- COMIDAS
drop policy if exists "comidas_select" on public.comidas;
create policy "comidas_select"
  on public.comidas for select to authenticated using (true);

drop policy if exists "comidas_admin" on public.comidas;
create policy "comidas_admin"
  on public.comidas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ASISTENCIAS A COMIDAS: cada quien ve las suyas, el staff marca y corrige
drop policy if exists "asistencias_select" on public.asistencias_comida;
create policy "asistencias_select"
  on public.asistencias_comida for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "asistencias_insert" on public.asistencias_comida;
create policy "asistencias_insert"
  on public.asistencias_comida for insert to authenticated
  with check (public.is_admin());

drop policy if exists "asistencias_delete" on public.asistencias_comida;
create policy "asistencias_delete"
  on public.asistencias_comida for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------
-- 10. La vieja tabla de registros deja de usarse
-- ---------------------------------------------------------
drop table if exists public.registros cascade;

-- ---------------------------------------------------------
-- 11. Equipos iniciales (editables desde el panel de admin)
-- ---------------------------------------------------------
insert into public.equipos (nombre, color, cupo, orden) values
  ('Equipo Rojo',   '#ff4d3d', 0, 1),
  ('Equipo Azul',   '#3d7bff', 0, 2),
  ('Equipo Verde',  '#39c26a', 0, 3),
  ('Equipo Dorado', '#ffb547', 0, 4)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------
-- Notas
-- ---------------------------------------------------------
-- Nombrar al primer master (crea el usuario en Authentication > Users primero):
--   update public.profiles set rol = 'master' where email = 'tu-correo@ejemplo.com';
-- cupo = 0 significa sin límite de integrantes.
