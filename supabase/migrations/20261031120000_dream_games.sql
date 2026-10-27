-- Dreams interactivos (docs/ESQUEMAS.md, Bloque 7): juegos de práctica.
--
-- Cada juego es el CONTENIDO ya validado por dream-api (games.mjs); la lógica
-- es una plantilla de Dream que corre en un iframe aislado. Igual que
-- dream_schemes: solo dream-api con la clave de servicio, filtrando por dueño
-- (RLS sin políticas, sin permisos para anon ni authenticated). Se borra con la
-- cuenta. Guarda el mejor resultado y el último (aciertos/total), nada más.

begin;

create table if not exists public.dream_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.dream_conversations(id) on delete set null,
  kind text not null check (kind in ('classify', 'match')),
  title text not null check (char_length(title) between 1 and 120),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 32768),
  attachment_ids uuid[] not null default '{}',
  best_score smallint check (best_score between 0 and 50),
  last_score smallint check (last_score between 0 and 50),
  total smallint check (total between 1 and 50),
  plays integer not null default 0 check (plays >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dream_games_owner_created_idx on public.dream_games (owner_id, created_at desc);

alter table public.dream_games enable row level security;
revoke all on table public.dream_games from public, anon, authenticated;
grant all on table public.dream_games to service_role;

comment on table public.dream_games is 'Dreams interactivos (juegos de práctica) generados desde los apuntes del alumno. Solo dream-api (service_role).';

commit;
