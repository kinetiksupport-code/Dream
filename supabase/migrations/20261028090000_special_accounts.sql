-- Cuentas de Fundación Loyola sin límite de uso (Bloque 5). SIN APLICAR hasta el OK de Carlos.
--
-- La lista de dominios vive en dream-api (special-accounts.mjs). dream-api marca
-- la cuenta con dream_special_account_mark() cuando el correo verificado de Google
-- es de uno de esos dominios; aquí se vuelve a comprobar que el correo de
-- auth.users sigue siendo de ese dominio, así una marca vieja no sirve de nada.
--
-- Para esas cuentas, dream_admit y dream_reserve usan límites propios: 20
-- mensajes por minuto (anti abuso) y topes diarios muy altos. Siguen
-- la misma cola y los mismos topes GLOBALES que el resto. La ventana de 5 horas
-- la salta dream-api. Las dos funciones son copia de su última versión
-- (20261018170000_exam_wizard.sql y 20261017090000_ai_modes_windows.sql);
-- solo cambian las líneas marcadas con «especial».

begin;

alter table dream_private.limits
  add column if not exists special_rpm integer not null default 20 check (special_rpm between 1 and 1000),
  add column if not exists special_daily integer not null default 2000 check (special_daily between 1 and 100000),
  add column if not exists special_user_tokens bigint not null default 20000000 check (special_user_tokens > 0),
  add column if not exists special_user_microusd bigint not null default 40000000 check (special_user_microusd > 0);

create table if not exists dream_private.special_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9.-]+$'),
  marked_at timestamptz not null default now()
);
alter table dream_private.special_accounts enable row level security;
revoke all on table dream_private.special_accounts from public, anon, authenticated;

-- Mensaje de bienvenida de Loyola: una sola vez.
alter table public.dream_profiles add column if not exists special_welcome_shown_at timestamptz;

-- ¿Cuenta especial? Marca de dream-api Y correo confirmado del mismo dominio.
create or replace function dream_private.is_special_account(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from dream_private.special_accounts s
    join auth.users u on u.id = s.owner_id
    where s.owner_id = p_owner
      and u.email_confirmed_at is not null
      and lower(split_part(u.email, '@', array_length(string_to_array(u.email, '@'), 1))) = s.domain
  )
$$;
revoke all on function dream_private.is_special_account(uuid) from public, anon, authenticated;

-- dream-api la llama en cada petición de una cuenta especial (barata e idempotente).
-- Devuelve si ya se le enseñó la bienvenida.
create or replace function public.dream_special_account_mark(p_owner uuid, p_domain text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_shown timestamptz;
begin
  if p_owner is null or p_domain !~ '^[a-z0-9.-]+$' then raise exception 'invalid_special_account'; end if;
  insert into dream_private.special_accounts(owner_id, domain) values (p_owner, p_domain)
  on conflict (owner_id) do update set domain = excluded.domain;
  select special_welcome_shown_at into v_shown from public.dream_profiles where id = p_owner;
  return jsonb_build_object('special', dream_private.is_special_account(p_owner), 'welcome_shown_at', v_shown);
end $$;

-- Si la cuenta ya no es especial (no debería pasar con Google), se quita la marca.
create or replace function public.dream_special_account_clear(p_owner uuid)
returns void language sql security definer set search_path = '' as $$
  delete from dream_private.special_accounts where owner_id = p_owner
$$;

-- dream_admit: «especial» = v_special, v_rpm, v_daily.
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
  v_special boolean;
  v_rpm integer;
  v_daily integer;
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
  -- Cuenta especial (Fundación Loyola): su propio límite por minuto y sin tope diario efectivo.
  v_special := dream_private.is_special_account(p_owner);
  v_rpm := case when v_special then c.special_rpm else c.rpm end;
  v_daily := case when v_special then c.special_daily else c.daily end;
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
  if m.requests >= v_rpm then
    return jsonb_build_object('ok', false, 'status', 429, 'code', case when v_special then 'dream_special_rpm' else 'dream_rpm' end, 'retry_after', greatest(1, ceil(extract(epoch from (w + interval '1 minute' - t)))));
  end if;
  if u.requests >= v_daily or (p_operation in ('test_generate','exam_prepare','exam_session_create') and u.exams >= c.exams_daily) then
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

-- dream_reserve: «especial» = topes por alumno de la cuenta especial.
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
  v_special boolean;
  v_user_tokens bigint;
  v_user_microusd bigint;
begin
  if not dream_private.take_budget_lock() then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_admission_busy', 'retry_after', 1);
  end if;
  if p_provider not in ('groq', 'tavily', 'cloudflare') then raise exception 'invalid_reservation'; end if;
  if exists (select 1 from dream_private.attempts where attempt_id = attempt) then
    return jsonb_build_object('ok', true, 'attempt_id', attempt, 'idempotent', true);
  end if;
  select * into c from dream_private.limits where id;
  v_special := dream_private.is_special_account(p_owner);
  v_user_tokens := case when v_special then c.special_user_tokens else c.user_tokens end;
  v_user_microusd := case when v_special then c.special_user_microusd else c.user_microusd end;
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
  if g.tokens + v_tokens > c.global_tokens or u.tokens + v_tokens > v_user_tokens
     or g.microusd + cost > c.global_microusd or u.microusd + cost > v_user_microusd
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

revoke all on function public.dream_special_account_mark(uuid, text) from public, anon, authenticated;
revoke all on function public.dream_special_account_clear(uuid) from public, anon, authenticated;
grant execute on function public.dream_special_account_mark(uuid, text) to service_role;
grant execute on function public.dream_special_account_clear(uuid) to service_role;

commit;
