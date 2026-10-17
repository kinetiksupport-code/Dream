begin;
-- Modos de IA (Parte G) y respaldo con Cloudflare (Parte H).
-- REVISIÓN OBLIGATORIA: no aplicar sin el OK de Carlos. Ver docs/MODOS_IA.md.
-- Aplicar ANTES de desplegar el dream-api que usa estas funciones: sin ellas
-- el chat responde 503 (admission_unavailable) y nunca se salta un límite.
--
-- 1. Ventana de uso de 5 h por alumno y uso en tokens por modo.
-- 2. Registro aparte del uso del respaldo (kind = 'fallback'): no cuenta en
--    los presupuestos de los modos.
-- 3. dream_reserve / dream_reconcile aceptan el proveedor 'cloudflare'.
-- 4. Precios de los modelos nuevos para la admisión existente.
-- Nunca se guarda texto de mensajes: solo tokens, peticiones y fechas.

-- ---------------------------------------------------------------------------
-- 1. Tablas (esquema privado, sin acceso del cliente)
-- ---------------------------------------------------------------------------
create table if not exists dream_private.ai_windows (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > started_at)
);

create table if not exists dream_private.ai_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  mode text not null check (mode in ('fast', 'normal', 'think')),
  kind text not null check (kind in ('mode', 'fallback')),
  provider text not null check (provider in ('groq', 'cloudflare')),
  requests integer not null default 0 check (requests >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, window_started_at, mode, kind, provider)
);

create table if not exists dream_private.ai_usage_attempts (
  attempt_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  mode text not null,
  kind text not null,
  provider text not null,
  tokens integer not null check (tokens >= 0),
  settled boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists ai_usage_attempts_created_idx on dream_private.ai_usage_attempts(created_at);

-- RLS activada y sin políticas: anon y authenticated no ven ni tocan nada.
-- Solo las funciones security definer de abajo (propietario de las tablas,
-- llamadas por service_role) las usan. Sin FORCE: el propietario debe poder
-- leerlas dentro de esas funciones.
alter table dream_private.ai_windows enable row level security;
alter table dream_private.ai_usage enable row level security;
alter table dream_private.ai_usage_attempts enable row level security;
revoke all on dream_private.ai_windows, dream_private.ai_usage, dream_private.ai_usage_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cargar la ventana (atómico). Se llama justo antes de enviar cada
--    petición al proveedor. p_budget viene de models.mjs (único sitio de
--    configuración); solo service_role puede llamar a esta función.
-- ---------------------------------------------------------------------------
create or replace function public.dream_ai_window_charge(
  p_owner uuid,
  p_mode text,
  p_kind text,
  p_provider text,
  p_tokens integer,
  p_budget integer,
  p_attempt uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
  w dream_private.ai_windows;
  used bigint;
begin
  if p_owner is null or p_attempt is null
     or p_mode not in ('fast', 'normal', 'think')
     or p_kind not in ('mode', 'fallback')
     or p_provider not in ('groq', 'cloudflare')
     or p_tokens is null or p_tokens < 0 or p_tokens > 400000
     or p_budget is null or p_budget < 1 or p_budget > 10000000 then
    raise exception 'invalid_window_charge';
  end if;
  if exists (select 1 from dream_private.ai_usage_attempts where attempt_id = p_attempt) then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  -- Una fila por alumno: el FOR UPDATE serializa sus peticiones simultáneas.
  insert into dream_private.ai_windows(owner_id, started_at, ends_at)
  values (p_owner, t, t + interval '5 hours')
  on conflict (owner_id) do nothing;
  select * into w from dream_private.ai_windows where owner_id = p_owner for update;
  -- La ventana anterior terminó: este mensaje abre una nueva.
  if w.ends_at <= t then
    update dream_private.ai_windows set started_at = t, ends_at = t + interval '5 hours'
    where owner_id = p_owner returning * into w;
  end if;

  if p_kind = 'mode' then
    select coalesce(sum(tokens), 0) into used from dream_private.ai_usage
    where owner_id = p_owner and window_started_at = w.started_at and mode = p_mode and kind = 'mode';
    if used >= p_budget then
      return jsonb_build_object('ok', false, 'status', 429, 'code', 'dream_mode_limit',
        'retry_after', greatest(1, ceil(extract(epoch from (w.ends_at - t)))),
        'resets_at', w.ends_at);
    end if;
  end if;

  insert into dream_private.ai_usage(owner_id, window_started_at, mode, kind, provider, requests, tokens)
  values (p_owner, w.started_at, p_mode, p_kind, p_provider, 1, p_tokens)
  on conflict (owner_id, window_started_at, mode, kind, provider) do update
    set requests = dream_private.ai_usage.requests + 1,
        tokens = dream_private.ai_usage.tokens + excluded.tokens,
        updated_at = t;
  insert into dream_private.ai_usage_attempts(attempt_id, owner_id, window_started_at, mode, kind, provider, tokens)
  values (p_attempt, p_owner, w.started_at, p_mode, p_kind, p_provider, p_tokens);
  return jsonb_build_object('ok', true, 'window_started_at', w.started_at, 'ends_at', w.ends_at);
end $$;

-- Ajusta la carga al uso real que devuelve el proveedor (o a 0 si el intento
-- falló sin producir texto). Idempotente.
create or replace function public.dream_ai_window_settle(
  p_owner uuid,
  p_attempt uuid,
  p_tokens integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a dream_private.ai_usage_attempts;
begin
  if p_tokens is null or p_tokens < 0 or p_tokens > 400000 then raise exception 'invalid_window_settle'; end if;
  select * into a from dream_private.ai_usage_attempts
  where attempt_id = p_attempt and owner_id = p_owner for update;
  if not found then return jsonb_build_object('ok', true, 'status', 'unknown'); end if;
  if a.settled then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  update dream_private.ai_usage
    set tokens = greatest(0, tokens + (p_tokens - a.tokens)), updated_at = clock_timestamp()
  where owner_id = a.owner_id and window_started_at = a.window_started_at
    and mode = a.mode and kind = a.kind and provider = a.provider;
  update dream_private.ai_usage_attempts set tokens = p_tokens, settled = true where attempt_id = a.attempt_id;
  return jsonb_build_object('ok', true, 'status', 'settled');
end $$;

-- Solo lectura: ventana abierta y tokens por modo y tipo. dream-api convierte
-- esto en porcentajes; el cliente nunca ve tokens.
create or replace function public.dream_ai_usage(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'window', (
      select jsonb_build_object('started_at', w.started_at, 'ends_at', w.ends_at)
      from dream_private.ai_windows w
      where w.owner_id = p_owner and w.ends_at > clock_timestamp()
    ),
    'usage', coalesce((
      select jsonb_agg(jsonb_build_object('mode', s.mode, 'kind', s.kind, 'tokens', s.tokens))
      from (
        select u.mode, u.kind, sum(u.tokens) as tokens
        from dream_private.ai_usage u
        join dream_private.ai_windows w
          on w.owner_id = u.owner_id and w.started_at = u.window_started_at and w.ends_at > clock_timestamp()
        where u.owner_id = p_owner
        group by u.mode, u.kind
      ) s
    ), '[]'::jsonb)
  );
$$;

-- Limpieza: programar al menos una vez al día junto a dream_admission_cleanup().
create or replace function public.dream_ai_usage_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from dream_private.ai_usage_attempts where created_at < clock_timestamp() - interval '2 days';
  delete from dream_private.ai_usage where window_started_at < clock_timestamp() - interval '30 days';
  delete from dream_private.ai_windows where ends_at < clock_timestamp() - interval '30 days';
$$;

revoke all on function public.dream_ai_window_charge(uuid, text, text, text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.dream_ai_window_settle(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.dream_ai_usage(uuid) from public, anon, authenticated;
revoke all on function public.dream_ai_usage_cleanup() from public, anon, authenticated;
grant execute on function public.dream_ai_window_charge(uuid, text, text, text, integer, integer, uuid) to service_role;
grant execute on function public.dream_ai_window_settle(uuid, uuid, integer) to service_role;
grant execute on function public.dream_ai_usage(uuid) to service_role;
grant execute on function public.dream_ai_usage_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Proveedor 'cloudflare' en la admisión existente
-- ---------------------------------------------------------------------------
alter table dream_private.provider_state drop constraint if exists provider_state_provider_check;
alter table dream_private.provider_state
  add constraint provider_state_provider_check check (provider in ('groq', 'tavily', 'cloudflare'));

-- Igual que en 20261010120000_admission_pricing_reconcile.sql; solo cambia la
-- lista de proveedores admitidos.
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
  if p_provider not in ('groq', 'tavily', 'cloudflare') then raise exception 'invalid_reservation'; end if;
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

-- Igual que la versión anterior; ahora también concilia 'cloudflare'.
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
  if p_input is null or p_output is null or a.provider not in ('groq', 'cloudflare') then
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

revoke all on function public.dream_reserve(uuid, uuid, text, integer, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.dream_reconcile(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.dream_reserve(uuid, uuid, text, integer, uuid, text, integer, integer) to service_role;
grant execute on function public.dream_reconcile(uuid, uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Precios de los modelos nuevos (microdólares por millón de tokens).
-- ⚠️ SIN VERIFICAR: tomados de memoria, confirmar en console.groq.com/docs/models
-- y developers.cloudflare.com/workers-ai/platform/pricing antes de aplicar.
-- Sin fila de precio, la admisión responde 503 model_unpriced (nunca gratis).
-- ---------------------------------------------------------------------------
insert into dream_private.model_prices(model, input_microusd_per_million, output_microusd_per_million, source, verified_on)
values
  ('llama-3.1-8b-instant', 50000, 80000, 'PENDIENTE DE VERIFICAR https://console.groq.com/docs/models', '2026-10-16'),
  ('llama-3.3-70b-versatile', 590000, 790000, 'PENDIENTE DE VERIFICAR https://console.groq.com/docs/models', '2026-10-16'),
  ('@cf/mistralai/mistral-small-3.1-24b-instruct', 351000, 555000, 'PENDIENTE DE VERIFICAR https://developers.cloudflare.com/workers-ai/platform/pricing/', '2026-10-16')
on conflict (model) do nothing;

commit;
