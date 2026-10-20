-- Actividad de sintagmas (prompt «sintagmas», Bloque 6).
-- NO APLICAR sin el OK de Carlos. Va después de 20261020120000_welcome_profile.
--
-- 1. dream_syntax_settings: una fila por alumno con las convenciones del
--    profesor, la fase (opciones o escribir), el nivel y si oculta el
--    tutorial. El alumno puede leerla; solo dream-api escribe.
-- 2. dream_syntax_sentences: frases con su análisis oficial. El alumno no
--    puede leerlas desde el navegador (llevan la solución); dream-api solo
--    devuelve las palabras hasta que se comprueba.
-- 3. dream_syntax_attempts: cada frase comprobada, con acierto por etiqueta.
--    `fn` en el análisis y `functions` aquí quedan para la segunda fase
--    (sujeto, CD, CI…).
-- 4. dream_admit admite syntax_conventions, syntax_next y syntax_check
--    (consumingActions de dream-api). Misma función que la vigente en
--    producción (comprobado el 21/10/2026); solo cambia la lista.
--
-- Todo cuelga de auth.users con ON DELETE CASCADE: borrar la cuenta lo borra.

create table public.dream_syntax_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  conventions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(conventions) = 'object' and length(conventions::text) <= 1000),
  conventions_source text not null default 'standard'
    check (conventions_source in ('standard', 'notes')),
  note_sentences text[] not null default '{}'
    check (cardinality(note_sentences) <= 12),
  phase text not null default 'options' check (phase in ('options', 'write')),
  level smallint not null default 1 check (level between 1 and 5),
  phase_changed_at timestamptz not null default now(),
  level_changed_at timestamptz not null default now(),
  tutorial_hidden boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.dream_syntax_settings is
  'Actividad de sintagmas: convenciones del profesor, fase, nivel y tutorial. Solo escribe dream-api.';
comment on column public.dream_syntax_settings.note_sentences is
  'Frases sacadas de los apuntes del alumno para analizarlas (sin nombres ni datos personales).';

create table public.dream_syntax_sentences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  words text[] not null check (cardinality(words) between 2 and 14),
  analysis jsonb not null check (jsonb_typeof(analysis) = 'array'),
  level smallint not null check (level between 1 and 5),
  source text not null check (source in ('ai', 'notes')),
  served_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.dream_syntax_sentences is
  'Frases de la actividad con su análisis oficial (lleva la solución: sin lectura desde el navegador).';
create index dream_syntax_sentences_queue on public.dream_syntax_sentences (owner_id, served_at, created_at);

create table public.dream_syntax_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sentence_id uuid not null references public.dream_syntax_sentences(id) on delete cascade,
  phase text not null check (phase in ('options', 'write')),
  marks jsonb not null check (jsonb_typeof(marks) = 'array'),
  correct smallint not null check (correct >= 0),
  total smallint not null check (total >= 1),
  score numeric(4,3) not null check (score between 0 and 1),
  labels jsonb not null default '{}'::jsonb,
  functions jsonb,
  hints smallint not null default 0 check (hints between 0 and 20),
  alternative boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.dream_syntax_attempts is
  'Cada frase comprobada: acierto total y por etiqueta. `functions` queda para la segunda fase.';
create index dream_syntax_attempts_owner on public.dream_syntax_attempts (owner_id, created_at desc);
create index dream_syntax_attempts_sentence on public.dream_syntax_attempts (sentence_id);

alter table public.dream_syntax_settings enable row level security;
alter table public.dream_syntax_sentences enable row level security;
alter table public.dream_syntax_attempts enable row level security;

create policy dream_syntax_settings_select_own on public.dream_syntax_settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy dream_syntax_attempts_select_own on public.dream_syntax_attempts
  for select to authenticated using (owner_id = (select auth.uid()));
-- dream_syntax_sentences: sin políticas a propósito (solo service_role).

revoke all on public.dream_syntax_settings, public.dream_syntax_sentences, public.dream_syntax_attempts from anon;
revoke insert, update, delete on public.dream_syntax_settings, public.dream_syntax_attempts from authenticated;
revoke all on public.dream_syntax_sentences from authenticated;

create or replace function public.dream_admit(p_owner uuid, p_request uuid, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c dream_private.limits;
  u dream_private.counters;
  m dream_private.counters;
  t timestamptz := clock_timestamp();
  d timestamptz := date_trunc('day', t at time zone 'UTC') at time zone 'UTC';
  w timestamptz := date_trunc('minute', t);
  n bigint;
  blocked timestamptz;
begin
  if not dream_private.take_budget_lock() then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_admission_busy', 'retry_after', 1);
  end if;
  if p_owner is null or p_request is null or p_operation not in (
    'chat','attachment_upload','test_generate','test_check_answer','test_submit',
    'exam_prepare','exam_session_create','exam_session_submit',
    'exam_route_regenerate','exam_identify',
    'syntax_conventions','syntax_next','syntax_check'
  ) then
    raise exception 'invalid_admission';
  end if;
  select * into c from dream_private.limits where id;
  if not c.enabled or c.tavily_credit_microusd <= 0 or not exists (select 1 from dream_private.model_prices) then
    return jsonb_build_object('ok', false, 'status', 503, 'code', 'budget_unconfigured', 'retry_after', 60);
  end if;
  select blocked_until into blocked from dream_private.user_blocks where owner_id = p_owner;
  if blocked > t then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_budget', 'retry_after', greatest(1, ceil(extract(epoch from (blocked - t)))));
  end if;
  insert into dream_private.counters(scope, bucket) values ('global', d) on conflict do nothing;
  perform 1 from dream_private.counters where scope = 'global' and bucket = d for update;
  if exists (select 1 from dream_private.leases where owner_id = p_owner and request_id = p_request and expires_at > t) then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'duplicate_request', 'retry_after', 5);
  end if;
  insert into dream_private.counters(scope, bucket) values (p_owner::text, d), (p_owner::text || ':minute', w) on conflict do nothing;
  select * into u from dream_private.counters where scope = p_owner::text and bucket = d for update;
  select * into m from dream_private.counters where scope = p_owner::text || ':minute' and bucket = w for update;
  if m.requests >= c.rpm then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_rpm', 'retry_after', greatest(1, ceil(extract(epoch from (w + interval '1 minute' - t)))));
  end if;
  if u.requests >= c.daily or (p_operation in ('test_generate','exam_prepare','exam_session_create') and u.exams >= c.exams_daily) then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_daily', 'retry_after', greatest(1, ceil(extract(epoch from (d + interval '1 day' - t)))));
  end if;
  select count(*) into n from dream_private.leases where not finished and expires_at > t;
  if n >= c.global_concurrency or (
    select count(*) from dream_private.leases where owner_id = p_owner and not finished and expires_at > t
  ) >= c.user_concurrency then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_concurrency', 'retry_after', 5);
  end if;
  insert into dream_private.leases values (p_owner, p_request, p_operation, t + interval '3 minutes', false)
  on conflict (owner_id, request_id) do update set expires_at = excluded.expires_at, finished = false, operation = excluded.operation;
  update dream_private.counters set requests = requests + 1,
    exams = exams + case when p_operation in ('test_generate','exam_prepare','exam_session_create') then 1 else 0 end
  where scope = p_owner::text and bucket = d;
  update dream_private.counters set requests = requests + 1 where scope = p_owner::text || ':minute' and bucket = w;
  return jsonb_build_object('ok', true);
end $$;
