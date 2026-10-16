-- =========================================================
-- Apartados 2.0 · Migración 12
-- Verificación por QR: permite resolver un token y mostrar
-- el nombre (y datos útiles) al escanear.
-- =========================================================

create or replace function public.verificar_qr(p_token uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  r json;
begin
  if p_token is null then
    return json_build_object('encontrado', false);
  end if;

  select json_build_object(
    'encontrado',   true,
    'nombre',       p.nombre,
    'rol',          p.rol,
    'equipo',       e.nombre,
    'equipo_color', e.color,
    'habitacion',   h.nombre,
    'avatar_path',  p.avatar_path
  )
  into r
  from public.profiles p
  left join public.equipos      e on e.id = p.equipo_id
  left join public.habitaciones h on h.id = p.habitacion_id
  where p.qr_token = p_token;

  return coalesce(r, json_build_object('encontrado', false));
end;
$$;

grant execute on function public.verificar_qr(uuid) to anon, authenticated;
