-- pg_cron para las purgas diarias/horarias (moderación: mod_purge; memoria:
-- dream_memory_purge, caducidad de 12 meses). Va antes de esas migraciones para
-- que programen sus tareas al aplicarse. Disponible en Supabase (1.6.x).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
