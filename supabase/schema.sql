-- =========================================================
-- Apartados 2.0 · Esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. Registros al retiro
-- ---------------------------------------------------------
create table if not exists public.registros (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  nombre      text not null,
  edad        int  not null check (edad between 14 and 30),
  telefono    text not null,
  email       text not null,
  iglesia     text,
  talla       text check (talla in ('S', 'M', 'L', 'XL', 'XXL')),
  emergencia  text,
  notas       text,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'confirmado', 'cancelado')),
  user_id     uuid references auth.users (id) on delete set null
);

create index if not exists registros_created_at_idx on public.registros (created_at desc);
create index if not exists registros_estado_idx on public.registros (estado);
create index if not exists registros_email_idx on public.registros (lower(email));

-- ---------------------------------------------------------
-- 2. Perfiles y roles de usuario (base para el panel futuro)
--    Roles: joven (por defecto), lider, admin
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text,
  email       text,
  telefono    text,
  rol         text not null default 'joven'
              check (rol in ('joven', 'lider', 'admin')),
  created_at  timestamptz not null default now()
);

-- Al crear un usuario en Auth se crea su perfil automáticamente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'nombre',
    new.email
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
-- 3. Helpers de rol (security definer para evitar recursión en RLS)
-- ---------------------------------------------------------
create or replace function public.current_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_rol() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_rol() in ('admin', 'lider'), false);
$$;

-- ---------------------------------------------------------
-- 4. Permisos base (RLS sigue siendo la única puerta)
-- ---------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.registros to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- ---------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------
alter table public.registros enable row level security;
alter table public.profiles  enable row level security;

-- REGISTROS: el formulario público solo puede insertar nuevas inscripciones
drop policy if exists "registros_insert_publico" on public.registros;
create policy "registros_insert_publico"
  on public.registros for insert
  to anon, authenticated
  with check (estado = 'pendiente');

-- REGISTROS: solo el staff puede leer
drop policy if exists "registros_select_staff" on public.registros;
create policy "registros_select_staff"
  on public.registros for select
  to authenticated
  using (public.is_staff());

-- REGISTROS: solo el staff puede actualizar (confirmar, cancelar, etc.)
drop policy if exists "registros_update_staff" on public.registros;
create policy "registros_update_staff"
  on public.registros for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- REGISTROS: solo el admin puede borrar
drop policy if exists "registros_delete_admin" on public.registros;
create policy "registros_delete_admin"
  on public.registros for delete
  to authenticated
  using (public.is_admin());

-- PERFILES: cada usuario ve el suyo, el admin ve todos
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- PERFILES: solo el admin gestiona perfiles y roles
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------
-- 6. Notas de uso
-- ---------------------------------------------------------
-- Para nombrar al primer administrador (primero crea el usuario en
-- Authentication > Users, luego ejecuta):
--
--   update public.profiles set rol = 'admin' where email = 'tu-correo@ejemplo.com';
