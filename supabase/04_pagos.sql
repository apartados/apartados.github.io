-- =========================================================
-- Apartados 2.0 · Migración 04
-- Portal de pagos: el participante sube el comprobante del
-- pago (que se cobra en 2 partes). El organizador los revisa.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Tabla de pagos
-- ---------------------------------------------------------
create table if not exists public.pagos (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  parte            int  not null check (parte in (1, 2)),
  tipo_pago        text not null check (tipo_pago in ('pago_movil', 'transferencia')),
  banco_origen     text not null,
  referencia       text not null,
  monto            numeric(12, 2),
  moneda           text not null default 'VES',
  comprobante_path text,
  estado           text not null default 'en_revision'
                   check (estado in ('en_revision', 'aprobado', 'rechazado')),
  nota             text,
  created_at       timestamptz not null default now(),
  revisado_por     uuid references public.profiles (id) on delete set null,
  revisado_at      timestamptz
);

create index if not exists pagos_profile_idx on public.pagos (profile_id);
create index if not exists pagos_estado_idx  on public.pagos (estado);

-- solo puede haber un pago aprobado por cada parte
create unique index if not exists pagos_aprobado_unico
  on public.pagos (profile_id, parte) where estado = 'aprobado';

-- ---------------------------------------------------------
-- 2. Bucket privado para los comprobantes
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes', 'comprobantes', false, 5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------
grant select, insert, update, delete on public.pagos to authenticated;

-- ---------------------------------------------------------
-- 4. RLS de la tabla de pagos
-- ---------------------------------------------------------
alter table public.pagos enable row level security;

-- El participante solo inserta pagos a su propio nombre y siempre en revisión
drop policy if exists "pagos_insert_propio" on public.pagos;
create policy "pagos_insert_propio"
  on public.pagos for insert to authenticated
  with check (profile_id = auth.uid() and estado = 'en_revision');

-- Cada quien ve sus pagos; el staff ve todos
drop policy if exists "pagos_select" on public.pagos;
create policy "pagos_select"
  on public.pagos for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- El staff aprueba / rechaza
drop policy if exists "pagos_update_staff" on public.pagos;
create policy "pagos_update_staff"
  on public.pagos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- El staff puede borrar
drop policy if exists "pagos_delete_staff" on public.pagos;
create policy "pagos_delete_staff"
  on public.pagos for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------
-- 5. RLS del bucket: cada quien sube a su carpeta {auth.uid()}/...
-- ---------------------------------------------------------
drop policy if exists "comprobantes_insert" on storage.objects;
create policy "comprobantes_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "comprobantes_select" on storage.objects;
create policy "comprobantes_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "comprobantes_update" on storage.objects;
create policy "comprobantes_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "comprobantes_delete" on storage.objects;
create policy "comprobantes_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
