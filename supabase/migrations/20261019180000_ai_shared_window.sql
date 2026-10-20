begin;
-- Límite CONJUNTO de la IA por ventana de 5 h (decisión de Carlos, 19/10/2026).
-- «El límite es uno conjunto y los modelos más altos consumen más.»
-- REVISIÓN OBLIGATORIA: no aplicar sin el OK de Carlos. Ver docs/MODOS_IA.md §3.
--
-- Solo cambia dream_ai_window_charge: con kind = 'mode', la comprobación suma
-- los tokens de TODOS los modos de la ventana, no solo los de p_mode.
-- - Misma firma y mismos permisos (solo service_role).
-- - Las filas se siguen guardando por modo: sabemos qué modo se usó.
-- - El respaldo (kind = 'fallback') sigue sin contar.
-- - dream_ai_window_settle y dream_ai_usage no cambian.
--
-- Compatibilidad:
-- - dream-api nuevo: envía p_budget = SHARED_WINDOW_BUDGET y p_tokens ya
--   multiplicado por el peso del modo (models.mjs).
-- - dream-api v27 (el de producción): envía el presupuesto de cada modo
--   (30.000 / 40.000 / 12.000) y tokens sin peso. Con esta función solo se
--   vuelve MÁS estricto: un modo se bloquea cuando la suma de todos llega a su
--   presupuesto. Nunca deja pasar más que antes.
-- Se puede aplicar antes o después de desplegar el dream-api nuevo.

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

  -- Una fila por alumno: el FOR UPDATE serializa sus peticiones simultáneas,
  -- también entre modos distintos (todas cargan el mismo límite).
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
    -- Límite conjunto: todos los modos de la ventana, sin el respaldo.
    select coalesce(sum(tokens), 0) into used from dream_private.ai_usage
    where owner_id = p_owner and window_started_at = w.started_at and kind = 'mode';
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

comment on function public.dream_ai_window_charge(uuid, text, text, text, integer, integer, uuid) is
  'Carga atómica de la ventana de 5 h. kind=mode: límite CONJUNTO (suma de todos los modos). kind=fallback: solo registra.';

-- Los mismos permisos que en 20261017090000_ai_modes_windows.sql.
revoke all on function public.dream_ai_window_charge(uuid, text, text, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.dream_ai_window_charge(uuid, text, text, text, integer, integer, uuid) to service_role;

commit;
