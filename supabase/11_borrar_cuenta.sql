-- =========================================================
-- Apartados 2.0 · Migración 11
-- El master puede borrar una cuenta (por ejemplo, alguien que
-- finalmente no asistirá). Borra el usuario y su perfil en cascada.
-- =========================================================

create or replace function public.borrar_cuenta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if not public.is_master() then
    raise exception 'Solo el master puede borrar cuentas.';
  end if;
  if p_id = auth.uid() then
    raise exception 'No puedes borrar tu propia cuenta.';
  end if;

  select rol into v_rol from public.profiles where id = p_id;
  if v_rol is null then
    raise exception 'La cuenta no existe.';
  end if;

  -- No dejar el sistema sin master
  if v_rol = 'master' and (select count(*) from public.profiles where rol = 'master') <= 1 then
    raise exception 'Debe existir al menos un master en el sistema.';
  end if;

  delete from auth.users where id = p_id;  -- el perfil y sus pagos caen en cascada
end;
$$;

grant execute on function public.borrar_cuenta(uuid) to authenticated;
