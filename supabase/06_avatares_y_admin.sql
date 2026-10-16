-- =========================================================
-- Apartados 2.0 · Migración 06
-- Foto de perfil (cualquier rol) + utilidades para el panel
-- de organizadores (admin/master).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Foto de perfil
-- ---------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares', 'avatares', true, 3145728,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public             = true,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares_insert" on storage.objects;
create policy "avatares_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatares_select" on storage.objects;
create policy "avatares_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "avatares_update" on storage.objects;
create policy "avatares_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "avatares_delete" on storage.objects;
create policy "avatares_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- El propio usuario fija su foto (el resto de sus datos lo gestiona el staff)
create or replace function public.actualizar_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if p_path is not null and p_path not like v_usuario::text || '/%' then
    raise exception 'Ruta de imagen no válida.';
  end if;
  update public.profiles set avatar_path = p_path where id = v_usuario;
  return p_path;
end;
$$;

grant execute on function public.actualizar_avatar(text) to authenticated;

-- ---------------------------------------------------------
-- 2. Solo el master puede cambiar roles
-- ---------------------------------------------------------
create or replace function public.profiles_guard_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol and not public.is_master() then
    new.rol := old.rol;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_rol on public.profiles;
create trigger profiles_guard_rol
  before update on public.profiles
  for each row execute function public.profiles_guard_rol();

-- ---------------------------------------------------------
-- 3. Listado de participantes para organizadores
--    (incluye equipo y habitación resueltos)
-- ---------------------------------------------------------
create or replace function public.participantes_lista()
returns table (
  id uuid, nombre text, email text, telefono text, edad int, iglesia text,
  talla text, emergencia text, notas text, rol text, avatar_path text,
  equipo_id uuid, equipo_nombre text, equipo_color text,
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
    p.habitacion_id, h.nombre, p.created_at
  from public.profiles p
  left join public.equipos e on e.id = p.equipo_id
  left join public.habitaciones h on h.id = p.habitacion_id
  where public.is_admin()
  order by p.created_at;
$$;

grant execute on function public.participantes_lista() to authenticated;

-- ---------------------------------------------------------
-- 4. Resumen para el panel de organizadores
-- ---------------------------------------------------------
create or replace function public.resumen_evento()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'participantes',       (select count(*) from public.profiles),
    'sin_equipo',          (select count(*) from public.profiles where equipo_id is null),
    'sin_habitacion',      (select count(*) from public.profiles where habitacion_id is null),
    'equipos',             (select count(*) from public.equipos),
    'habitaciones',        (select count(*) from public.habitaciones),
    'pagos_por_verificar', (select count(*) from public.pagos where estado = 'en_revision'),
    'pagos_verificados',   (select count(*) from public.pagos where estado = 'aprobado')
  ) end;
$$;

grant execute on function public.resumen_evento() to authenticated;
