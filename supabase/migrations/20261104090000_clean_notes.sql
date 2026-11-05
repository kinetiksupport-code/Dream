-- «Apuntes»: los apuntes del alumno pasados a limpio (docs/APUNTES-LIMPIOS.md).
--
-- Solo el resultado ya validado por dream-api (clean-notes.mjs), nunca los
-- apuntes originales. Solo lo lee y escribe dream-api con la clave de
-- servicio, filtrando por dueño: RLS activado sin políticas y sin permisos
-- para anon ni authenticated. Se borra con la cuenta (cascada).
-- cache_key = SHA-256(versión del prompt + texto de los apuntes): si el alumno
-- pide otra vez lo mismo, no se gasta IA.

begin;

create table if not exists public.dream_clean_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.dream_conversations(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 262144),
  total_pages smallint not null default 1 check (total_pages between 1 and 12),
  attachment_ids uuid[] not null default '{}' check (cardinality(attachment_ids) <= 20),
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, cache_key)
);

create index if not exists dream_clean_notes_owner_updated_idx on public.dream_clean_notes (owner_id, updated_at desc);

alter table public.dream_clean_notes enable row level security;
revoke all on table public.dream_clean_notes from public, anon, authenticated;
grant all on table public.dream_clean_notes to service_role;

comment on table public.dream_clean_notes is 'Apuntes del alumno pasados a limpio (sin los originales). Solo dream-api (service_role).';

-- Devolver el cupo de hoy cuando «Apuntes» falla, ya estaba hecho (caché) o es
-- una página siguiente (que no cuenta). Solo resta, nunca baja de 0, y solo
-- la puede llamar dream-api con la clave de servicio.
create or replace function public.dream_refund_admission(p_owner uuid, p_exam boolean default false)
returns void language sql security definer set search_path = '' as $$
  update dream_private.counters
     set requests = greatest(0, requests - 1),
         exams = greatest(0, exams - case when p_exam then 1 else 0 end)
   where scope = p_owner::text
     and bucket = date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC'
$$;
revoke all on function public.dream_refund_admission(uuid, boolean) from public, anon, authenticated;
grant execute on function public.dream_refund_admission(uuid, boolean) to service_role;

commit;
