-- Índices para las claves foráneas sin índice que marca el asesor de
-- rendimiento de Supabase (unindexed_foreign_keys, 01/11/2026). Con pocas
-- filas no se nota; con muchos alumnos, borrar una conversación, un examen o
-- una cuenta obliga a recorrer la tabla entera sin ellos.
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
