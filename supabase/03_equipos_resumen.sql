-- =========================================================
-- Apartados 2.0 · Migración 03
-- Resumen público de equipos (nombre, color, cupo y ocupados)
-- sin exponer los datos personales de los demás participantes.
-- =========================================================

create or replace function public.equipos_resumen()
returns table (id uuid, nombre text, color text, cupo int, ocupados int, orden int)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    e.nombre,
    e.color,
    e.cupo,
    (select count(*)::int from public.profiles p where p.equipo_id = e.id) as ocupados,
    e.orden
  from public.equipos e
  order by e.orden, e.nombre;
$$;

grant execute on function public.equipos_resumen() to authenticated;
