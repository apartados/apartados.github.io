-- =========================================================
-- Apartados 2.0 · Migración 17
-- Fechas de pago por parte (visibles para todos).
-- =========================================================

alter table public.configuracion
  add column if not exists pago1_desde date,
  add column if not exists pago1_hasta date,
  add column if not exists pago2_desde date,
  add column if not exists pago2_hasta date;

update public.configuracion set
  pago1_desde = coalesce(pago1_desde, '2026-11-13'),
  pago1_hasta = coalesce(pago1_hasta, '2026-11-20'),
  pago2_desde = coalesce(pago2_desde, '2026-11-30'),
  pago2_hasta = coalesce(pago2_hasta, '2026-12-04')
where id = 1;
