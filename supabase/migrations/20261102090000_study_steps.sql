-- Ruta de estudio con Leer, Test, tarjetas y simulacro (prompt de la ruta,
-- Bloque 8). SIN APLICAR hasta el OK de Carlos.
--
-- Solo AÑADE tablas y columnas nuevas; no borra ni cambia nada existente.
-- Todo es privado del alumno: RLS por student_id, el alumno solo LEE lo suyo
-- y escribe únicamente dream-api (service_role). Borrar la cuenta lo borra
-- todo (on delete cascade a auth.users y a los exámenes y unidades).
--
-- Marcha atrás (si hiciera falta), en este orden:
--   drop function if exists public.dream_study_quota(uuid, text, uuid);
--   drop table if exists public.dream_card_reviews, public.dream_cards,
--     public.dream_error_bank, public.dream_unit_progress,
--     public.dream_unit_content, public.dream_exam_blueprints;
--   drop table if exists dream_private.study_limits;
--   alter table public.dream_exam_sessions drop column if exists kind,
--     drop column if exists blueprint_id, drop column if exists estimated_grade,
--     drop column if exists grading;

begin;

create schema if not exists dream_private;

-- ── Topes de la ruta (un solo sitio para cambiarlos) ──
create table if not exists dream_private.study_limits (
  id boolean primary key default true check (id),
  lessons_daily integer not null default 6 check (lessons_daily between 1 and 100),
  mocks_per_exam_daily integer not null default 2 check (mocks_per_exam_daily between 1 and 20),
  cards_per_exam integer not null default 500 check (cards_per_exam between 10 and 5000),
  cards_per_student integer not null default 2000 check (cards_per_student between 10 and 20000)
);
insert into dream_private.study_limits(id) values (true) on conflict do nothing;

-- ── La lección generada (lectura + banco de preguntas), una por unidad ──
create table if not exists public.dream_unit_content (
  unit_id uuid primary key,
  exam_id uuid not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  difficulty text not null default 'medio' check (difficulty in ('facil', 'medio', 'dificil')),
  reading jsonb,
  quiz jsonb,
  model text check (model is null or char_length(model) <= 80),
  tokens_in integer check (tokens_in is null or tokens_in >= 0),
  tokens_out integer check (tokens_out is null or tokens_out >= 0),
  -- Candado para no generar dos veces la misma (dos pestañas).
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (unit_id, exam_id, student_id) references public.dream_exam_units(id, exam_id, owner_id) on delete cascade,
  check (status <> 'ready' or (reading is not null and quiz is not null))
);
create index if not exists dream_unit_content_student_day on public.dream_unit_content(student_id, created_at);

-- ── Progreso de la lección ──
create table if not exists public.dream_unit_progress (
  unit_id uuid not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  reading_section integer not null default 0 check (reading_section between 0 and 20),
  reading_done_at timestamptz,
  quiz_session_id uuid references public.dream_exam_sessions(id) on delete set null,
  quiz_best_pct integer check (quiz_best_pct is null or quiz_best_pct between 0 and 100),
  mastered_at timestamptz,
  felt_difficulty text check (felt_difficulty is null or felt_difficulty in ('facil', 'bien', 'dificil')),
  updated_at timestamptz not null default now(),
  primary key (unit_id, student_id),
  foreign key (unit_id, exam_id, student_id) references public.dream_exam_units(id, exam_id, owner_id) on delete cascade
);

-- ── Tarjetas con repaso espaciado (FSRS, calculado en el servidor) ──
create table if not exists public.dream_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  unit_id uuid,
  front text not null check (char_length(front) between 1 and 300),
  back text not null check (char_length(back) between 1 and 300),
  origin text not null check (origin in ('ai', 'mistake', 'own', 'import')),
  due timestamptz not null default now(),
  stability double precision not null default 0 check (stability >= 0),
  difficulty double precision not null default 0 check (difficulty >= 0 and difficulty <= 10),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  state smallint not null default 0 check (state between 0 and 3), -- 0 nueva, 1 aprendiendo, 2 repaso, 3 reaprendiendo
  last_review timestamptz,
  suspended boolean not null default false,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (exam_id, student_id) references public.dream_exams(id, owner_id) on delete cascade,
  foreign key (unit_id, exam_id, student_id) references public.dream_exam_units(id, exam_id, owner_id) on delete cascade
);
create index if not exists dream_cards_student_due on public.dream_cards(student_id, due);
create index if not exists dream_cards_exam on public.dream_cards(exam_id);

-- Topes: 500 por examen y 2.000 por alumno.
create or replace function dream_private.cards_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l dream_private.study_limits;
begin
  select * into l from dream_private.study_limits where id;
  if (select count(*) from public.dream_cards where exam_id = new.exam_id and student_id = new.student_id) >= l.cards_per_exam then
    raise exception 'cards_per_exam' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dream_cards where student_id = new.student_id) >= l.cards_per_student then
    raise exception 'cards_per_student' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists dream_cards_cap on public.dream_cards;
create trigger dream_cards_cap before insert on public.dream_cards
  for each row execute function dream_private.cards_cap();

-- Cada repaso, una vez (review_id lo pone el dispositivo: sin duplicados al
-- sincronizar los repasos hechos sin conexión).
create table if not exists public.dream_card_reviews (
  review_id uuid primary key,
  card_id uuid not null references public.dream_cards(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null,
  elapsed_days double precision not null default 0 check (elapsed_days >= 0)
);
create index if not exists dream_card_reviews_card on public.dream_card_reviews(card_id, reviewed_at);

-- ── Banco de errores del examen ──
create table if not exists public.dream_error_bank (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  unit_id uuid,
  session_id uuid references public.dream_exam_sessions(id) on delete cascade,
  question_ref text not null check (char_length(question_ref) between 1 and 80),
  cause text not null check (cause in ('concepto', 'despiste', 'tiempo', 'expresion', 'enunciado')),
  cause_confirmed_by_student boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (exam_id, student_id) references public.dream_exams(id, owner_id) on delete cascade
);
create index if not exists dream_error_bank_exam on public.dream_error_bank(student_id, exam_id);

-- ── Plano del simulacro final (ingeniería inversa del examen) ──
create table if not exists public.dream_exam_blueprints (
  exam_id uuid primary key,
  student_id uuid not null references auth.users(id) on delete cascade,
  blueprint jsonb not null,
  inputs_hash text not null check (char_length(inputs_hash) between 8 and 128),
  model text check (model is null or char_length(model) <= 80),
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now(),
  foreign key (exam_id, student_id) references public.dream_exams(id, owner_id) on delete cascade
);

-- ── Simulacros: tipo, plano, nota estimada y corrección por criterio ──
alter table public.dream_exam_sessions
  add column if not exists kind text check (kind is null or kind in ('diagnostic', 'block', 'final')),
  add column if not exists blueprint_id uuid,
  add column if not exists estimated_grade numeric(4, 2) check (estimated_grade is null or estimated_grade between 0 and 10),
  add column if not exists grading jsonb;

-- ── RLS: el alumno solo lee lo suyo; nadie más, ni agregado ──
do $$
declare t text;
begin
  foreach t in array array['dream_unit_content', 'dream_unit_progress', 'dream_cards', 'dream_card_reviews', 'dream_error_bank', 'dream_exam_blueprints'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (student_id = auth.uid())', t || '_select_own', t);
  end loop;
end $$;

-- ── Topes diarios (solo dream-api la llama) ──
-- p_kind «lesson»: lecciones nuevas generadas hoy (hora de Madrid).
-- p_kind «mock»: simulacros de ese examen hoy. Fundación Loyola: sin tope
-- diario (solo el límite por minuto de siempre).
create or replace function public.dream_study_quota(p_owner uuid, p_kind text, p_exam uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l dream_private.study_limits;
  day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid';
  used integer;
  cap integer;
  special boolean := false;
begin
  if p_owner is null or p_kind not in ('lesson', 'mock') then
    raise exception 'invalid_quota' using errcode = '22023';
  end if;
  select * into l from dream_private.study_limits where id;
  if to_regprocedure('dream_private.is_special_account(uuid)') is not null then
    execute 'select dream_private.is_special_account($1)' into special using p_owner;
  end if;
  if p_kind = 'lesson' then
    cap := l.lessons_daily;
    select count(*) into used from public.dream_unit_content
      where student_id = p_owner and created_at >= day_start and status in ('ready', 'generating');
  else
    cap := l.mocks_per_exam_daily;
    select count(*) into used from public.dream_exam_sessions
      where owner_id = p_owner and exam_id = p_exam and mode = 'exam' and started_at >= day_start;
  end if;
  return jsonb_build_object('ok', special or used < cap, 'used', used, 'cap', cap, 'unlimited', special);
end $$;
revoke all on function public.dream_study_quota(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.dream_study_quota(uuid, text, uuid) to service_role;
revoke all on function dream_private.cards_cap() from public, anon, authenticated;

commit;
