-- Esquemas visuales (docs/ESQUEMAS.md, Bloque 1: «Esquema de estos apuntes»).
--
-- Cada esquema es el JSON ya validado por dream-api (schemes.mjs). Solo lo lee
-- y escribe dream-api con la clave de servicio, siempre filtrando por dueño:
-- RLS activado y sin políticas, y sin permisos para anon ni authenticated.
-- Se borra con la cuenta (cascada) y no guarda los apuntes, solo el esquema.

begin;

create table if not exists public.dream_schemes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.dream_conversations(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  subject text not null default '' check (char_length(subject) <= 60),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 65536),
  source text not null default 'notes' check (source in ('notes', 'topic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dream_schemes_owner_created_idx on public.dream_schemes (owner_id, created_at desc);

alter table public.dream_schemes enable row level security;
revoke all on table public.dream_schemes from public, anon, authenticated;
grant all on table public.dream_schemes to service_role;

comment on table public.dream_schemes is 'Esquemas visuales generados desde los apuntes del alumno. Solo dream-api (service_role).';

commit;
