-- Memoria entre conversaciones (Bloque 4) e importación de otra IA (Bloque 6).
-- SIN APLICAR hasta el OK de Carlos. Además, en el código va detrás de
-- FEATURE_FLAGS.memory (apagado) y de dream_profiles.memory_enabled, que es
-- FALSO hasta que el alumno dice «Sí» (decisión de Carlos del 22/10/2026).
--
-- El alumno lee y borra lo suyo (RLS); crear y cambiar, solo dream-api
-- (service_role). Borrar la cuenta lo borra todo (on delete cascade).
-- Caducidad: lo que lleva 12 meses sin usarse se borra (dream_memory_purge,
-- cada día con pg_cron si está instalado y, si no, desde dream-api).

begin;

create table if not exists public.dream_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dificultad', 'dominio', 'preferencia', 'objetivo', 'progreso')),
  content text not null check (char_length(content) between 1 and 160),
  subject text check (subject is null or char_length(subject) <= 40),
  source text not null default 'chat' check (source in ('chat', 'import')),
  source_conversation_id uuid references public.dream_conversations(id) on delete set null,
  pinned boolean not null default false,
  last_used_at timestamptz,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dream_memories_user_idx on public.dream_memories(user_id, pinned desc, last_used_at desc nulls last);

create table if not exists public.dream_conversation_summaries (
  conversation_id uuid primary key references public.dream_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null check (char_length(summary) <= 400),
  topics text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists dream_conversation_summaries_user_idx on public.dream_conversation_summaries(user_id, updated_at desc);

alter table public.dream_profiles
  add column if not exists memory_enabled boolean not null default false,
  add column if not exists memory_choice_at timestamptz,
  add column if not exists memory_imports_day date,
  add column if not exists memory_imports_count integer not null default 0 check (memory_imports_count >= 0);

-- El bloque de memoria se calcula al empezar la conversación y se guarda con
-- ella (prompt estable); memory_extracted_at evita extraer dos veces.
alter table public.dream_conversations
  add column if not exists memory_block text check (memory_block is null or char_length(memory_block) <= 2000),
  add column if not exists memory_extracted_at timestamptz;

alter table public.dream_memories enable row level security;
alter table public.dream_conversation_summaries enable row level security;
revoke all on table public.dream_memories, public.dream_conversation_summaries from public, anon, authenticated;
grant select, delete on table public.dream_memories, public.dream_conversation_summaries to authenticated;

drop policy if exists dream_memories_own_select on public.dream_memories;
drop policy if exists dream_memories_own_delete on public.dream_memories;
drop policy if exists dream_summaries_own_select on public.dream_conversation_summaries;
drop policy if exists dream_summaries_own_delete on public.dream_conversation_summaries;
create policy dream_memories_own_select on public.dream_memories for select to authenticated using (user_id = (select auth.uid()));
create policy dream_memories_own_delete on public.dream_memories for delete to authenticated using (user_id = (select auth.uid()));
create policy dream_summaries_own_select on public.dream_conversation_summaries for select to authenticated using (user_id = (select auth.uid()));
create policy dream_summaries_own_delete on public.dream_conversation_summaries for delete to authenticated using (user_id = (select auth.uid()));

-- Guarda lo que ha sacado el extractor (ya validado y filtrado en dream-api) y
-- deja como mucho 40 recuerdos: sobran los no fijados más antiguos y menos usados.
create or replace function public.dream_memory_apply(
  p_owner uuid, p_conversation uuid, p_summary text, p_topics text[], p_memories jsonb, p_forget uuid[], p_source text default 'chat'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_added integer := 0;
  v_removed integer := 0;
  m jsonb;
begin
  if p_owner is null or p_source not in ('chat', 'import') or jsonb_typeof(coalesce(p_memories, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_memories, '[]'::jsonb)) > 25 then
    raise exception 'invalid_memory';
  end if;
  if not exists (select 1 from public.dream_profiles where id = p_owner and memory_enabled) then
    return jsonb_build_object('ok', false, 'code', 'memory_disabled');
  end if;
  if p_conversation is not null and not exists (select 1 from public.dream_conversations where id = p_conversation and owner_id = p_owner) then
    raise exception 'invalid_memory';
  end if;
  delete from public.dream_memories where user_id = p_owner and id = any(coalesce(p_forget, '{}'));
  get diagnostics v_removed = row_count;
  for m in select * from jsonb_array_elements(coalesce(p_memories, '[]'::jsonb)) loop
    insert into public.dream_memories(user_id, kind, content, subject, source, source_conversation_id, expires_at)
    values (p_owner, m->>'kind', m->>'content', nullif(m->>'subject', ''), p_source, p_conversation, (m->>'expires_at')::date);
    v_added := v_added + 1;
  end loop;
  delete from public.dream_memories where id in (
    select id from public.dream_memories where user_id = p_owner and not pinned
    order by coalesce(last_used_at, created_at) desc offset greatest(0, 40 - (select count(*) from public.dream_memories where user_id = p_owner and pinned))
  );
  if p_conversation is not null then
    if coalesce(p_summary, '') <> '' then
      insert into public.dream_conversation_summaries(conversation_id, user_id, summary, topics)
      values (p_conversation, p_owner, left(p_summary, 400), coalesce(p_topics[1:8], '{}'))
      on conflict (conversation_id) do update set summary = excluded.summary, topics = excluded.topics, updated_at = now();
    end if;
    update public.dream_conversations set memory_extracted_at = now() where id = p_conversation and owner_id = p_owner;
  end if;
  return jsonb_build_object('ok', true, 'added', v_added, 'forgotten', v_removed);
end $$;

-- Borra lo que lleva 12 meses sin usarse (o sin usar desde que se creó).
create or replace function public.dream_memory_purge()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_s integer;
begin
  delete from public.dream_memories where coalesce(last_used_at, created_at) < now() - interval '12 months'
    or (expires_at is not null and expires_at < (now() at time zone 'Europe/Madrid')::date - 30);
  get diagnostics v_n = row_count;
  delete from public.dream_conversation_summaries where updated_at < now() - interval '12 months';
  get diagnostics v_s = row_count;
  return v_n + v_s;
end $$;

revoke all on function public.dream_memory_apply(uuid, uuid, text, text[], jsonb, uuid[], text) from public, anon, authenticated;
revoke all on function public.dream_memory_purge() from public, anon, authenticated;
grant execute on function public.dream_memory_apply(uuid, uuid, text, text[], jsonb, uuid[], text) to service_role;
grant execute on function public.dream_memory_purge() to service_role;

-- Cada día a las 04:17 (hora UTC) si pg_cron está instalado.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dream_memory_purge';
    perform cron.schedule('dream_memory_purge', '17 4 * * *', 'select public.dream_memory_purge()');
  end if;
end $$;

commit;
