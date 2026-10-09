-- Not applied to production. Identifier 20261009220000 is unused in
-- supabase_migrations.schema_migrations and in GitHub.
-- dream-api writes conversations with the service role. The current app does
-- not read or write dream_user_settings. service_role grants are unchanged.

revoke insert, update, delete on table public.dream_conversations from authenticated;
revoke update on table public.dream_user_settings from authenticated;
