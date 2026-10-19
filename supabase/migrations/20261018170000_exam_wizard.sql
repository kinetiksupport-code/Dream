-- Asistente de examen a pantalla completa (PROMPT_EXAMEN_ESTILO.md §5, PR 3).
-- NO APLICAR sin el OK de Carlos. Va después de 20261018153000_upload_sessions
-- y 20261018160000_exam_materials_limit (PR #32).
--
-- 1. Borrador sin nombre, asignatura ni fecha: el asistente crea el examen al
--    empezar (para subir apuntes y para el QR) y la IA pone el nombre y la
--    asignatura al final. Solo un borrador puede tenerlos vacíos.
-- 2. Columnas nuevas:
--    - target_grade: nota objetivo de 0 a 10 en saltos de 0,5 (la ruedecita).
--    - wizard_step: paso del asistente en el que va el borrador (retomar).
--    - few_notes_ack: el alumno ya dijo «Continuar con estos» al aviso de
--      pocos apuntes; no se vuelve a preguntar en este examen.
--    daily_minutes ya no se pregunta: el asistente guarda 45 (valor por
--    defecto del examen desde el cliente; la columna conserva su default).
-- 3. dream_admit admite 'exam_identify' (acción nueva con IA) y
--    'exam_route_regenerate', que ya estaba en consumingActions de dream-api
--    pero faltaba aquí (la admisión lo rechazaba con invalid_admission).
--    Misma función que 20261010120000_admission_pricing_reconcile.sql; solo
--    cambia la lista de operaciones. Se conservan sus permisos.

alter table public.dream_exams
  drop constraint if exists dream_exams_title_check,
  drop constraint if exists dream_exams_subject_check,
  alter column exam_date drop not null,
  add column if not exists target_grade numeric(3,1),
  add column if not exists wizard_step text,
  add column if not exists few_notes_ack boolean not null default false;

alter table public.dream_exams
  add constraint dream_exams_title_check
    check (length(title) <= 160 and (status = 'draft' or length(btrim(title)) >= 1)),
  add constraint dream_exams_subject_check
    check (length(subject) <= 80 and (status = 'draft' or length(btrim(subject)) >= 1)),
  add constraint dream_exams_date_when_planned
    check (status = 'draft' or exam_date is not null),
  add constraint dream_exams_target_grade_check
    check (target_grade is null or (target_grade between 0 and 10 and target_grade * 2 = floor(target_grade * 2))),
  add constraint dream_exams_wizard_step_check
    check (wizard_step is null or wizard_step in ('upload','date','grade','identify'));

comment on column public.dream_exams.target_grade is 'Nota objetivo del alumno (0–10, saltos de 0,5). La elige en el asistente.';
comment on column public.dream_exams.wizard_step is 'Paso del asistente de crear examen en el que va el borrador (upload, date, grade, identify).';
comment on column public.dream_exams.few_notes_ack is 'El alumno eligió «Continuar con estos» ante el aviso de pocos apuntes.';

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
    'exam_route_regenerate','exam_identify'
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
