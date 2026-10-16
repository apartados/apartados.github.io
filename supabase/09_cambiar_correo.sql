-- =========================================================
-- Apartados 2.0 · Migración 09
-- El master puede cambiar su propio correo desde el panel.
-- (El cambio de contraseña ya lo hace Supabase Auth.)
-- =========================================================

create or replace function public.cambiar_mi_correo(p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_new text := lower(trim(p_email));
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if not public.is_master() then
    raise exception 'Solo el master puede cambiar su correo desde el panel.';
  end if;
  if v_new = '' or v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_new and id <> v_uid) then
    raise exception 'Ese correo ya está registrado.';
  end if;

  -- Se aplica de inmediato (no hay confirmación por correo configurada)
  update auth.users
     set email                       = v_new,
         email_change                = '',
         email_change_token_new      = '',
         email_change_token_current  = '',
         email_change_confirm_status = 0
   where id = v_uid;

  update auth.identities
     set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_new)),
         updated_at    = now()
   where user_id = v_uid and provider = 'email';

  update public.profiles set email = v_new where id = v_uid;

  return v_new;
end;
$$;

grant execute on function public.cambiar_mi_correo(text) to authenticated;
