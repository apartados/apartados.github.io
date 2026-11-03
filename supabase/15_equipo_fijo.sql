-- =========================================================
-- Apartados 2.0 · Migración 15
-- La elección de equipo queda fija: el participante solo
-- puede elegir UNA vez. Cambiar equipo es exclusivo del master.
-- =========================================================

create or replace function public.solicitar_equipo(p_equipo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario   uuid := auth.uid();
  v_cupo      int;
  v_ocupados  int;
  v_equipo    uuid;
  v_pendiente uuid;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select equipo_id, equipo_pendiente_id
    into v_equipo, v_pendiente
  from public.profiles
  where id = v_usuario;

  if not found then
    raise exception 'Tu perfil no existe.';
  end if;

  -- Ya confirmado: solo el master puede cambiarlo
  if v_equipo is not null then
    raise exception 'Ya estás en un equipo. Solo el organizador puede cambiarte de equipo.';
  end if;

  -- Ya tiene una solicitud en revisión
  if v_pendiente is not null then
    raise exception 'Ya enviaste una solicitud de equipo. Espera la aprobación del organizador.';
  end if;

  -- Bloqueo de fila para evitar sobrecupo con solicitudes simultáneas
  select cupo into v_cupo from public.equipos where id = p_equipo for update;
  if not found then
    raise exception 'El equipo no existe.';
  end if;

  select count(*) into v_ocupados
  from public.profiles
  where id <> v_usuario
    and (equipo_id = p_equipo or equipo_pendiente_id = p_equipo);

  if v_cupo > 0 and v_ocupados >= v_cupo then
    raise exception 'Ese equipo ya está completo.';
  end if;

  update public.profiles set equipo_pendiente_id = p_equipo where id = v_usuario;
end;
$$;

grant execute on function public.solicitar_equipo(uuid) to authenticated;

-- El participante ya no puede cancelar por su cuenta
drop function if exists public.cancelar_solicitud_equipo();
