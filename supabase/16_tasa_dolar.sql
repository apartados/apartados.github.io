-- =========================================================
-- Apartados 2.0 · Migración 16
-- Tasa del dólar y montos por parte (20$ / 15$).
-- El monto en bolívares se calcula automáticamente.
-- =========================================================

alter table public.configuracion
  add column if not exists tasa_dolar            numeric(12, 2),
  add column if not exists monto_parte1_usd      numeric(12, 2) not null default 20,
  add column if not exists monto_parte2_usd      numeric(12, 2) not null default 15,
  add column if not exists tasa_actualizada_at   timestamptz;

-- Guardar la tasa usada en cada pago (para verificar)
alter table public.pagos
  add column if not exists tasa_dolar numeric(12, 2);
