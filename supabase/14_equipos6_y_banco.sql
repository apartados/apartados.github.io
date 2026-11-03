-- =========================================================
-- Apartados 2.0 · Migración 14
-- 1) Equipos de 6 personas (bloqueo al llenarse)
-- 2) Datos bancarios editables por el organizador
-- 3) Miembros de un equipo en orden cronológico (master)
-- =========================================================

-- ---------------------------------------------------------
-- 1. Cupo de 6 por equipo
-- ---------------------------------------------------------
update public.equipos set cupo = 6 where cupo = 0 or cupo is null;

-- ---------------------------------------------------------
-- 2. Configuración del evento / datos bancarios
-- ---------------------------------------------------------
create table if not exists public.configuracion (
  id                      int primary key default 1 check (id = 1),
  banco                   text,
  titular                 text,
  documento               text,
  cuenta                  text,
  tipo_cuenta             text,
  pago_movil_banco        text,
  pago_movil_telefono     text,
  pago_movil_documento    text,
  instrucciones           text,
  actualizado_at          timestamptz not null default now()
);

insert into public.configuracion (id) values (1) on conflict (id) do nothing;

alter table public.configuracion enable row level security;

drop policy if exists "config_select" on public.configuracion;
create policy "config_select"
  on public.configuracion for select to authenticated
  using (true);

drop policy if exists "config_update_admin" on public.configuracion;
create policy "config_update_admin"
  on public.configuracion for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, update on public.configuracion to authenticated;

-- ---------------------------------------------------------
-- 3. Miembros de un equipo en orden de inscripción (master)
--    Sirve para decidir a quién dejar en un equipo lleno.
-- ---------------------------------------------------------
create or replace function public.equipo_miembros(p_equipo uuid)
returns table (
  id uuid, nombre text, email text, avatar_path text,
  created_at timestamptz, posicion bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id, p.nombre, p.email, p.avatar_path, p.created_at,
    row_number() over (order by p.created_at asc) as posicion
  from public.profiles p
  where public.is_master() and p.equipo_id = p_equipo
  order by p.created_at asc;
$$;

grant execute on function public.equipo_miembros(uuid) to authenticated;
