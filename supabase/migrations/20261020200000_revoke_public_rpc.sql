-- Seguridad (auditoría del 20/10/2026, hallazgo SEC-01). APLICAR SOLO CON EL OK DE CARLOS.
--
-- En producción, dream_provider_pause, dream_release y dream_admission_cleanup
-- tenían EXECUTE para PUBLIC, anon y authenticated (proacl leído el 20/10/2026),
-- aunque 20261008192123_security_admission.sql lo revoca. Son SECURITY DEFINER y
-- PostgREST las expone en /rest/v1/rpc/, así que cualquiera con la clave pública
-- de la web podía, sin iniciar sesión:
--   - pausar Groq, Tavily o Cloudflare para todos (dream_provider_pause, hasta
--     2147483647 s);
--   - marcar como terminada una petición ajena (dream_release);
--   - borrar contadores caducados (dream_admission_cleanup).
-- dream-api las llama con la clave de servicio, que conserva el permiso.

revoke execute on function public.dream_provider_pause(text, integer) from public, anon, authenticated;
revoke execute on function public.dream_release(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dream_admission_cleanup() from public, anon, authenticated;
grant execute on function public.dream_provider_pause(text, integer) to service_role;
grant execute on function public.dream_release(uuid, uuid) to service_role;
grant execute on function public.dream_admission_cleanup() to service_role;

-- Que las funciones nuevas no nazcan ejecutables por cualquiera. PostgreSQL da
-- EXECUTE a PUBLIC por defecto, y eso solo se quita con el valor global (sin
-- IN SCHEMA); los permisos a anon y authenticated de Supabase son por esquema.
-- A partir de aquí, cada función que deba usar el navegador necesita su
-- GRANT explícito.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
