-- Rapidez con muchos alumnos (02/11/2026). NO aplicar sin el OK de Carlos.
--
-- 1. dream_admit, dream_reserve y dream_reconcile comparten UN cerrojo para
--    toda la web (take_budget_lock). Si otro alumno lo tenía durante más de
--    200 ms, la petición fallaba con 429 «dream_admission_busy» y la web
--    reintentaba al cabo de 1 s. Con muchos alumnos a la vez eso se convierte
--    en esperas y reintentos en cadena. Cada uso del cerrojo dura unos 5-8 ms
--    (pg_stat_statements del 01/11/2026), así que esperar hasta 2 s en vez de
--    fallar a los 200 ms no frena a nadie y evita el reintento. El cerrojo se
--    mantiene: protege los cupos globales y evita bloqueos cruzados entre las
--    tres funciones.
create or replace function dream_private.take_budget_lock()
returns boolean
language plpgsql
set search_path to ''
as $function$
begin
  perform pg_catalog.set_config('lock_timeout', '2s', true);
  perform pg_catalog.pg_advisory_xact_lock(174493828);
  return true;
exception when lock_not_available then
  return false;
end $function$;

-- 2. dream_admit cuenta en cada petición las reservas abiertas de TODA la web
--    («not finished and expires_at > now»). Sin índice recorre la tabla
--    entera, que crece con cada mensaje.
create index if not exists leases_open_idx
  on dream_private.leases (expires_at)
  where not finished;
create index if not exists leases_owner_open_idx
  on dream_private.leases (owner_id, expires_at)
  where not finished;

-- 3. Claves foráneas sin índice (asesor de rendimiento de Supabase). Borrar
--    una conversación, un examen o una cuenta tiene que buscar sus filas
--    hijas; sin índice las busca fila a fila en toda la tabla.
create index if not exists ai_usage_attempts_owner_idx on dream_private.ai_usage_attempts (owner_id);
create index if not exists mod_observations_ban_idx on dream_private.mod_observations (ban_id);
create index if not exists mod_observations_banned_user_idx on dream_private.mod_observations (banned_user);
create index if not exists upload_sessions_exam_idx on dream_private.upload_sessions (exam_id);
create index if not exists dream_exam_materials_exam_owner_idx on public.dream_exam_materials (exam_id, owner_id);
create index if not exists dream_exam_sessions_exam_owner_idx on public.dream_exam_sessions (exam_id, owner_id);
create index if not exists dream_exam_units_exam_owner_idx on public.dream_exam_units (exam_id, owner_id);
create index if not exists dream_games_conversation_idx on public.dream_games (conversation_id);
create index if not exists dream_memories_source_conversation_idx on public.dream_memories (source_conversation_id);
create index if not exists dream_schemes_conversation_idx on public.dream_schemes (conversation_id);
create index if not exists mod_appeals_sanction_idx on public.mod_appeals (sanction_id);
