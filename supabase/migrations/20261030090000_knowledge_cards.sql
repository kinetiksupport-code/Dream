-- Fichas de Dream (Bloque 2 ter, punto 2). SIN APLICAR hasta el OK de Carlos.
--
-- Reglas, ejemplos resueltos y errores frecuentes revisados por una persona,
-- para que la regla no salga de la memoria del modelo. SOLO se usan las fichas
-- en estado «revisada»; las 30 de arranque (supabase/seed/fichas-borrador.json)
-- entran como «borrador» y no se usan hasta que alguien las revise (duda 1:
-- propuesta, profesores de Fundación Loyola). Búsqueda de texto completo de
-- Postgres en español, sin IA.

begin;

-- Minúsculas y sin tildes (inmutable, para el índice): «fraccion» = «fracción».
create or replace function public.dream_fold(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select translate(lower(coalesce(p, '')), 'áéíóúàèìòùäëïöüâêîôû', 'aeiouaeiouaeiouaeiou')
$$;

create table if not exists public.dream_knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  tema text not null check (char_length(tema) between 3 and 120),
  curso text not null check (char_length(curso) between 2 and 60),
  asignatura text not null check (char_length(asignatura) between 2 and 60),
  regla text not null check (char_length(regla) between 10 and 900),
  ejemplo_resuelto text not null check (char_length(ejemplo_resuelto) between 10 and 900),
  errores_frecuentes text not null default '' check (char_length(errores_frecuentes) <= 600),
  comprobacion text not null default '' check (char_length(comprobacion) <= 400),
  estado text not null default 'borrador' check (estado in ('borrador', 'revisada')),
  revisado_por text check (revisado_por is null or char_length(revisado_por) <= 120),
  revisado_el timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  busqueda tsvector generated always as (
    setweight(to_tsvector('spanish', public.dream_fold(tema)), 'A') ||
    setweight(to_tsvector('spanish', public.dream_fold(asignatura || ' ' || curso)), 'B') ||
    setweight(to_tsvector('spanish', public.dream_fold(regla)), 'C') ||
    setweight(to_tsvector('spanish', public.dream_fold(ejemplo_resuelto || ' ' || errores_frecuentes)), 'D')
  ) stored,
  -- Una ficha revisada siempre dice quién y cuándo.
  check (estado = 'borrador' or (revisado_por is not null and revisado_el is not null))
);
create index if not exists dream_knowledge_cards_busqueda_idx on public.dream_knowledge_cards using gin (busqueda);

-- Solo lectura: los alumnos pueden leer las revisadas (no son datos personales).
alter table public.dream_knowledge_cards enable row level security;
revoke all on table public.dream_knowledge_cards from public, anon, authenticated;
grant select on table public.dream_knowledge_cards to authenticated;
drop policy if exists dream_knowledge_cards_read on public.dream_knowledge_cards;
create policy dream_knowledge_cards_read on public.dream_knowledge_cards for select to authenticated using (estado = 'revisada');

-- 1-3 fichas revisadas para una consulta (dream-api, service_role). Basta con
-- que coincida alguna palabra; manda la relevancia (el tema pesa más).
create or replace function public.dream_cards_search(p_query text, p_limit integer default 3)
returns table (slug text, tema text, asignatura text, regla text, ejemplo_resuelto text, errores_frecuentes text, comprobacion text)
language sql stable security definer set search_path = '' as $$
  with words as (
    select array_to_string(array_agg(distinct w), ' | ') as q
    from unnest(regexp_split_to_array(public.dream_fold(left(coalesce(p_query, ''), 300)), '[^a-z0-9ñ]+')) w
    where char_length(w) >= 3
  ), query as (
    select to_tsquery('spanish', q) as q from words where q <> ''
  )
  select c.slug, c.tema, c.asignatura, c.regla, c.ejemplo_resuelto, c.errores_frecuentes, c.comprobacion
  from public.dream_knowledge_cards c, query
  where c.estado = 'revisada' and c.busqueda @@ query.q
  order by ts_rank(c.busqueda, query.q) desc
  limit least(greatest(coalesce(p_limit, 3), 1), 3)
$$;

-- Aprobar o devolver a borrador (para la pantalla interna de revisión).
create or replace function public.dream_card_review(p_slug text, p_reviewer text, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_approve and coalesce(btrim(p_reviewer), '') = '' then raise exception 'reviewer_required'; end if;
  update public.dream_knowledge_cards
    set estado = case when p_approve then 'revisada' else 'borrador' end,
        revisado_por = case when p_approve then btrim(p_reviewer) else null end,
        revisado_el = case when p_approve then now() else null end,
        updated_at = now()
  where slug = p_slug;
  if not found then raise exception 'card_not_found'; end if;
end $$;

revoke all on function public.dream_fold(text) from public, anon, authenticated;
revoke all on function public.dream_cards_search(text, integer) from public, anon, authenticated;
revoke all on function public.dream_card_review(text, text, boolean) from public, anon, authenticated;
grant execute on function public.dream_cards_search(text, integer) to service_role;
grant execute on function public.dream_card_review(text, text, boolean) to service_role;

commit;
