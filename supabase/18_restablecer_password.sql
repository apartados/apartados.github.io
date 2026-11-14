-- =========================================================
-- Apartados 2.0 · Migración 18
-- El master puede ASIGNAR una nueva contraseña a un usuario.
--
-- Nota: la contraseña actual NO se puede "ver": se guarda
-- cifrada (hash bcrypt) y es irreversible. Por eso se ofrece
-- restablecerla (poner una nueva) en lugar de mostrarla.
-- =========================================================

create extension if not exists "pgcrypto";

create or replace function public.restablecer_password(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if not public.is_master() then
    raise exception 'Solo el organizador principal puede restablecer contraseñas.';
  end if;
  if p_id is null then
    raise exception 'Usuario no válido.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;
  if not exists (select 1 from auth.users where id = p_id) then
    raise exception 'La cuenta no existe.';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = p_id;
end;
$$;

grant execute on function public.restablecer_password(uuid, text) to authenticated;
