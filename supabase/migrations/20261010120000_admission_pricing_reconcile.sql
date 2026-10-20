begin;
-- Pricing, per-attempt reservations and reconciliation.
-- Does not enable admission. Prices below are official published rates as of 2026-10-10
-- and must be re-verified by the operator before enabled is set to true.

create table if not exists dream_private.model_prices (
  model text primary key,
  input_microusd_per_million bigint not null check (input_microusd_per_million > 0),
  output_microusd_per_million bigint not null check (output_microusd_per_million > 0),
  source text not null,
  verified_on date not null
);

insert into dream_private.model_prices(model, input_microusd_per_million, output_microusd_per_million, source, verified_on)
values
  ('qwen/qwen3.8-27b', 800000, 4000000, 'https://console.groq.com/docs/models', '2026-10-10'),
  ('openai/gpt-oss-120b', 150000, 600000, 'https://console.groq.com/docs/models', '2026-10-10'),
  ('openai/gpt-oss-20b', 75000, 300000, 'https://console.groq.com/docs/models', '2026-10-10')
on conflict (model) do nothing;

alter table dream_private.limits
  add column if not exists tavily_credit_microusd bigint not null default 8000,
  add column if not exists tavily_basic_credits integer not null default 1;

comment on column dream_private.limits.tavily_credit_microusd is
  'Microdollars per Tavily credit. 8000 is the published pay-as-you-go rate on 2026-10-10. Confirm the contracted plan before enabling.';

create table if not exists dream_private.attempts (
  attempt_id uuid primary key,
  owner_id uuid not null,
  request_id uuid not null,
  provider text not null,
  model text,
  reserved_input integer not null default 0,
  reserved_output integer not null default 0,
  reserved_microusd bigint not null,
  reserved_tokens integer not null default 0,
  actual_input integer,
  actual_output integer,
  actual_microusd bigint,
  status text not null default 'reserved',
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists dream_private.usage_audit (
  id bigint generated always as identity primary key,
  attempt_id uuid not null,
  event text not null,
  reserved_microusd bigint,
  actual_microusd bigint,
  delta_microusd bigint,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists dream_private.user_blocks (
  owner_id uuid primary key,
  blocked_until timestamptz not null,
  reason text not null
);

create or replace function dream_private.take_budget_lock() returns boolean
language plpgsql as $$
begin
  perform set_config('lock_timeout', '200ms', true);
  perform pg_advisory_xact_lock(174493828);
  return true;
exception when lock_not_available then
  return false;
end $$;

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
    'exam_prepare','exam_session_create','exam_session_submit'
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

drop function if exists public.dream_reserve(uuid, uuid, text, integer);

create or replace function public.dream_reserve(
  p_owner uuid,
  p_request uuid,
  p_provider text,
  p_tokens integer,
  p_attempt uuid default null,
  p_model text default null,
  p_input integer default null,
  p_output integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c dream_private.limits;
  u dream_private.counters;
  g dream_private.counters;
  price dream_private.model_prices;
  t timestamptz := clock_timestamp();
  d timestamptz := date_trunc('day', t at time zone 'UTC') at time zone 'UTC';
  attempt uuid := coalesce(p_attempt, gen_random_uuid());
  input_n integer;
  output_n integer;
  cost bigint;
  v_tokens integer;
  pause timestamptz;
begin
  if not dream_private.take_budget_lock() then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_admission_busy', 'retry_after', 1);
  end if;
  if p_provider not in ('groq','tavily') then raise exception 'invalid_reservation'; end if;
  if exists (select 1 from dream_private.attempts where attempt_id = attempt) then
    return jsonb_build_object('ok', true, 'attempt_id', attempt, 'idempotent', true);
  end if;
  select * into c from dream_private.limits where id;
  if not c.enabled or c.tavily_credit_microusd <= 0 then
    return jsonb_build_object('ok', false, 'status', 503, 'code', 'budget_unconfigured', 'retry_after', 60);
  end if;
  if not exists (select 1 from dream_private.leases where owner_id = p_owner and request_id = p_request and not finished and expires_at > t) then
    return jsonb_build_object('ok', false, 'status', 503, 'code', 'lease_expired', 'retry_after', 5);
  end if;
  select blocked_until into pause from dream_private.provider_state where provider = p_provider;
  if pause > t then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'provider_rate_limit', 'retry_after', greatest(1, ceil(extract(epoch from (pause - t)))));
  end if;
  if p_provider = 'tavily' then
    input_n := 0; output_n := 0; v_tokens := 0;
    cost := c.tavily_basic_credits * c.tavily_credit_microusd;
  else
    select * into price from dream_private.model_prices where model = coalesce(p_model, 'qwen/qwen3.8-27b');
    if not found then
      return jsonb_build_object('ok', false, 'status', 503, 'code', 'model_unpriced', 'retry_after', 60);
    end if;
    input_n := greatest(0, coalesce(p_input, p_tokens, 0));
    output_n := greatest(0, coalesce(p_output, 0));
    if input_n > 400000 or output_n > 4096 then raise exception 'invalid_reservation'; end if;
    v_tokens := input_n + output_n;
    cost := ceil(input_n * price.input_microusd_per_million / 1000000.0)
          + ceil(output_n * price.output_microusd_per_million / 1000000.0);
  end if;
  insert into dream_private.counters(scope, bucket) values ('global', d), (p_owner::text, d) on conflict do nothing;
  select * into g from dream_private.counters where scope = 'global' and bucket = d for update;
  select * into u from dream_private.counters where scope = p_owner::text and bucket = d for update;
  if g.tokens + v_tokens > c.global_tokens or u.tokens + v_tokens > c.user_tokens
     or g.microusd + cost > c.global_microusd or u.microusd + cost > c.user_microusd
     or (p_provider = 'tavily' and u.searches >= c.searches_daily) then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_budget', 'retry_after', greatest(1, ceil(extract(epoch from (d + interval '1 day' - t)))));
  end if;
  update dream_private.counters
    set tokens = dream_private.counters.tokens + v_tokens, microusd = microusd + cost,
        searches = searches + case when p_provider = 'tavily' then 1 else 0 end
  where bucket = d and scope in ('global', p_owner::text);
  insert into dream_private.attempts(attempt_id, owner_id, request_id, provider, model, reserved_input, reserved_output, reserved_microusd, reserved_tokens)
  values (attempt, p_owner, p_request, p_provider, p_model, input_n, output_n, cost, v_tokens);
  insert into dream_private.usage_audit(attempt_id, event, reserved_microusd, delta_microusd)
  values (attempt, 'reserved', cost, cost);
  return jsonb_build_object('ok', true, 'attempt_id', attempt);
end $$;

create or replace function public.dream_reconcile(
  p_owner uuid,
  p_attempt uuid,
  p_input integer,
  p_output integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a dream_private.attempts;
  price dream_private.model_prices;
  actual bigint;
  delta bigint;
  d timestamptz := date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  if not dream_private.take_budget_lock() then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_admission_busy', 'retry_after', 1);
  end if;
  select * into a from dream_private.attempts where attempt_id = p_attempt and owner_id = p_owner for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'code', 'attempt_unknown');
  end if;
  if a.status = 'reconciled' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if p_input is null or p_output is null or a.provider <> 'groq' then
    update dream_private.attempts set status = 'unreconciled' where attempt_id = a.attempt_id;
    insert into dream_private.usage_audit(attempt_id, event, reserved_microusd) values (a.attempt_id, 'unreconciled', a.reserved_microusd);
    return jsonb_build_object('ok', true, 'status', 'unreconciled');
  end if;
  select * into price from dream_private.model_prices where model = coalesce(a.model, 'qwen/qwen3.8-27b');
  if not found then
    update dream_private.attempts set status = 'unreconciled' where attempt_id = a.attempt_id;
    return jsonb_build_object('ok', true, 'status', 'unreconciled');
  end if;
  actual := ceil(greatest(0, p_input) * price.input_microusd_per_million / 1000000.0)
          + ceil(greatest(0, p_output) * price.output_microusd_per_million / 1000000.0);
  delta := actual - a.reserved_microusd;
  if delta <> 0 then
    update dream_private.counters set microusd = greatest(0, microusd + delta)
    where bucket = d and scope in ('global', p_owner::text);
  end if;
  if delta > 0 and (
    select microusd from dream_private.counters where scope = p_owner::text and bucket = d
  ) > (select user_microusd from dream_private.limits where id) then
    insert into dream_private.user_blocks(owner_id, blocked_until, reason)
    values (p_owner, d + interval '1 day', 'overrun')
    on conflict (owner_id) do update set blocked_until = excluded.blocked_until, reason = excluded.reason;
  end if;
  update dream_private.attempts
    set actual_input = p_input, actual_output = p_output, actual_microusd = actual, status = 'reconciled'
  where attempt_id = a.attempt_id;
  insert into dream_private.usage_audit(attempt_id, event, reserved_microusd, actual_microusd, delta_microusd)
  values (a.attempt_id, 'reconciled', a.reserved_microusd, actual, delta);
  return jsonb_build_object('ok', true, 'status', 'reconciled', 'delta_microusd', delta);
end $$;

revoke all on function public.dream_admit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.dream_reserve(uuid, uuid, text, integer, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.dream_reconcile(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.dream_admit(uuid, uuid, text) to service_role;
grant execute on function public.dream_reserve(uuid, uuid, text, integer, uuid, text, integer, integer) to service_role;
grant execute on function public.dream_reconcile(uuid, uuid, integer, integer) to service_role;
revoke all on all tables in schema dream_private from public, anon, authenticated;

do $$ begin
  if to_regclass('public.dream_conversations') is not null then
    execute 'revoke insert, update, delete on table public.dream_conversations from authenticated';
  end if;
  if to_regclass('public.dream_user_settings') is not null then
    execute 'revoke update on table public.dream_user_settings from authenticated';
  end if;
  if to_regclass('public.dream_skills') is not null then
    execute 'revoke select (prompt) on public.dream_skills from authenticated';
  end if;
end $$;

commit;
