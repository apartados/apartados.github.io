-- =========================================================
-- Apartados 2.0 · Migración 05
-- Quinto equipo (Morado), pensando en 50+ participantes.
-- =========================================================

insert into public.equipos (nombre, color, cupo, orden) values
  ('Equipo Morado', '#8b5cf6', 0, 5)
on conflict (nombre) do nothing;
