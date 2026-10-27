-- Esquemas, tanda 2: ilustraciones con FLUX (Workers AI).
--
-- 1. Bucket público «scheme-illustrations»: solo imágenes generadas sin texto
--    y sin datos personales, guardadas por hash del prompt (caché compartida).
--    Lectura pública (para mostrarlas y exportarlas); escritura solo dream-api.
-- 2. dream_illustration_log: cada imagen NUEVA (no las de caché) para el cupo
--    por alumno y el tope global diario. Sin prompts ni contenido, 30 días.
-- 3. dream_schemes.illustrations: prompt → ruta de la imagen de ese esquema.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scheme-illustrations', 'scheme-illustrations', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create table if not exists public.dream_illustration_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists dream_illustration_log_owner_idx on public.dream_illustration_log (owner_id, created_at desc);
create index if not exists dream_illustration_log_created_idx on public.dream_illustration_log (created_at desc);
alter table public.dream_illustration_log enable row level security;
revoke all on table public.dream_illustration_log from public, anon, authenticated;
grant all on table public.dream_illustration_log to service_role;

alter table public.dream_schemes add column if not exists illustrations jsonb not null default '{}'::jsonb;
alter table public.dream_schemes drop constraint if exists dream_schemes_illustrations_object;
alter table public.dream_schemes add constraint dream_schemes_illustrations_object check (jsonb_typeof(illustrations) = 'object');

-- Limpieza: el registro solo hace falta para los cupos.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('dream_illustration_log_purge') where exists (select 1 from cron.job where jobname = 'dream_illustration_log_purge');
    perform cron.schedule('dream_illustration_log_purge', '17 4 * * *', $c$delete from public.dream_illustration_log where created_at < now() - interval '30 days'$c$);
  end if;
end $$;

commit;
