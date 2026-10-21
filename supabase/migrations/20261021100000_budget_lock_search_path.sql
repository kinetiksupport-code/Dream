-- Auditoría: el aviso del asesor de Supabase (function_search_path_mutable).
-- take_budget_lock solo llama a funciones de pg_catalog; fijar el search_path
-- cierra el aviso sin cambiar su comportamiento.
create or replace function dream_private.take_budget_lock() returns boolean
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('lock_timeout', '200ms', true);
  perform pg_catalog.pg_advisory_xact_lock(174493828);
  return true;
exception when lock_not_available then
  return false;
end $$;
