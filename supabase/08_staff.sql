-- =========================================================
-- Apartados 2.0 · Migración 08
-- El master designa el staff (admin/master) desde un listado.
-- Protección: nunca dejar el sistema sin ningún master.
-- =========================================================

create or replace function public.profiles_guard_campos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo el master (o procesos sin sesión, ej. SQL Editor) cambia rol/equipo/habitación
  if auth.uid() is not null and not public.is_master() then
    new.rol           := old.rol;
    new.equipo_id     := old.equipo_id;
    new.habitacion_id := old.habitacion_id;
  end if;

  -- No permitir quedarse sin ningún master
  if new.rol is distinct from 'master' and old.rol = 'master' then
    if not exists (
      select 1 from public.profiles where rol = 'master' and id <> old.id
    ) then
      raise exception 'Debe existir al menos un master en el sistema.';
    end if;
  end if;

  return new;
end;
$$;

-- Resumen con conteo de staff
create or replace function public.resumen_evento()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'participantes',        (select count(*) from public.profiles),
    'masters',              (select count(*) from public.profiles where rol = 'master'),
    'admins',               (select count(*) from public.profiles where rol = 'admin'),
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
