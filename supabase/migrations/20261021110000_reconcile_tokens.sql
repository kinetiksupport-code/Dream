-- Auditoría (SEC-05, parte 2): dream_reconcile corregía el coste real pero no
-- los tokens. Los contadores diarios (por alumno y global) se quedaban con la
-- estimación por bytes, unas 3,8 veces el uso real, y el cupo global de 2 M
-- se agotaba con pocas decenas de conversaciones normales.
-- Solo cambia la rama "reconciled": los intentos sin uso conocido siguen
-- cobrando la estimación completa (conservador).
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
  token_delta bigint;
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
  -- SEC-05: the daily token counters kept the byte-based worst-case estimate
  -- (about 3.8x the real use) after reconcile; they now follow real usage.
  token_delta := greatest(0, p_input) + greatest(0, p_output) - a.reserved_tokens;
  if delta <> 0 or token_delta <> 0 then
    update dream_private.counters set microusd = greatest(0, microusd + delta), tokens = greatest(0, tokens + token_delta)
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

revoke all on function public.dream_reconcile(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.dream_reconcile(uuid, uuid, integer, integer) to service_role;
