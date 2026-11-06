-- Hugo (IA de soporte de Crisp) por MCP, solo lectura (docs/HUGO_MCP.md).
--
-- Regla de Carlos (6-nov): si el alumno abre el chat de Crisp con su sesión de
-- Dream iniciada, Hugo puede consultar SOLO esa cuenta. Sin sesión, nada.
-- Crisp no recibe correo, nombre ni id: el navegador solo manda a dream-api el
-- identificador de la sesión de Crisp y dream-api lo ata a la cuenta (24 h).
--
-- Todo el acceso de Hugo pasa por las funciones hugo_*: devuelven solo los
-- campos permitidos y solo las puede ejecutar service_role (la Edge Function
-- hugo-mcp no llama a ninguna otra rpc; hay un test que lo comprueba).
-- Las funciones viven en `public` porque PostgREST solo expone ese esquema,
-- igual que mod_ban_state y el resto.
-- APLICAR SOLO CON EL OK DE CARLOS.

begin;

create schema if not exists dream_private;

-- Sesión de Crisp -> cuenta. Una sesión se ata una sola vez, a una sola cuenta.
create table if not exists dream_private.crisp_links (
  session_id text primary key check (session_id ~ '^[A-Za-z0-9_:.-]{1,128}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '24 hours'
);
create index if not exists crisp_links_user_idx on dream_private.crisp_links(user_id);
create index if not exists crisp_links_expires_idx on dream_private.crisp_links(expires_at);

-- Registro de llamadas de Hugo: sin datos personales (ni IP, ni correo, ni
-- textos). Se borra a los 30 días. Lo lee el Panel.
create table if not exists dream_private.hugo_calls (
  id bigint generated always as identity primary key,
  called_at timestamptz not null default clock_timestamp(),
  tool text not null check (char_length(tool) <= 40),
  result text not null check (result in ('ok', 'sin_cuenta', 'limitada', 'error', 'enlace_ignorado', 'enlace_nuevo')),
  session_id text check (session_id is null or char_length(session_id) <= 128)
);
create index if not exists hugo_calls_time_idx on dream_private.hugo_calls(called_at desc);
create index if not exists hugo_calls_session_idx on dream_private.hugo_calls(session_id, called_at desc);

-- Ajustes de soporte que escribe Carlos desde el Panel (p. ej. el aviso).
create table if not exists dream_private.hugo_settings (
  key text primary key check (key in ('aviso')),
  value text not null default '' check (char_length(value) <= 280),
  updated_at timestamptz not null default clock_timestamp()
);

alter table dream_private.crisp_links enable row level security;
alter table dream_private.hugo_calls enable row level security;
alter table dream_private.hugo_settings enable row level security;
revoke all on table dream_private.crisp_links, dream_private.hugo_calls, dream_private.hugo_settings from public, anon, authenticated;

-- ── Atar / desatar ────────────────────────────────────────────────────────
create or replace function public.hugo_link(p_user uuid, p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v dream_private.crisp_links;
begin
  if p_user is null or p_session is null or p_session !~ '^[A-Za-z0-9_:.-]{1,128}$' then
    return jsonb_build_object('ok', false, 'code', 'sesion_no_valida');
  end if;
  delete from dream_private.crisp_links where expires_at <= clock_timestamp();
  delete from dream_private.hugo_calls where called_at < clock_timestamp() - interval '30 days';
  select * into v from dream_private.crisp_links where session_id = p_session;
  if found then
    -- Ya atada: a la misma cuenta no cambia nada; a otra, se ignora y se registra.
    if v.user_id <> p_user then
      insert into dream_private.hugo_calls(tool, result, session_id) values ('crisp_link', 'enlace_ignorado', p_session);
      return jsonb_build_object('ok', false, 'code', 'ya_atada');
    end if;
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  -- Un alumno solo mantiene unas pocas sesiones atadas a la vez.
  if (select count(*) from dream_private.crisp_links where user_id = p_user) >= 5 then
    return jsonb_build_object('ok', false, 'code', 'demasiadas');
  end if;
  insert into dream_private.crisp_links(session_id, user_id) values (p_session, p_user);
  insert into dream_private.hugo_calls(tool, result, session_id) values ('crisp_link', 'enlace_nuevo', p_session);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hugo_unlink(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from dream_private.crisp_links where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Lo que ve Hugo ────────────────────────────────────────────────────────
-- Una sola puerta: hugo_call(sesión, herramienta). Registra la llamada, aplica
-- el límite (por sesión y total) y devuelve solo los campos permitidos.
-- Sesión desconocida, caducada o con un texto raro: la misma respuesta.
create or replace function public.hugo_call(p_session text, p_tool text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
  d timestamptz := date_trunc('day', t at time zone 'UTC') at time zone 'UTC';
  v_user uuid;
  v_sess text := case when p_session ~ '^[A-Za-z0-9_:.-]{1,128}$' then p_session else null end;
  v_ban jsonb; v_estado text; v_limit jsonb; v_appeal jsonb; v_special boolean;
  v_req bigint; v_daily integer; v_name text; v_notice text; v_pause timestamptz;
  v_blocked timestamptz; v_res jsonb; c dream_private.limits; v_queue boolean;
  s public.mod_sanctions;
begin
  if p_tool not in ('consultar_bloqueo', 'consultar_cuenta', 'estado_de_dream') then
    return jsonb_build_object('ok', false, 'code', 'herramienta_desconocida');
  end if;
  -- Límite de llamadas: 20 por sesión y 300 en total, cada 10 minutos.
  if (select count(*) from dream_private.hugo_calls where called_at > t - interval '10 minutes') >= 300
     or (v_sess is not null and (select count(*) from dream_private.hugo_calls where session_id = v_sess and called_at > t - interval '10 minutes') >= 20) then
    insert into dream_private.hugo_calls(tool, result, session_id) values (p_tool, 'limitada', v_sess);
    return jsonb_build_object('ok', false, 'code', 'limitada');
  end if;

  if p_tool = 'estado_de_dream' then
    select max(blocked_until) into v_pause from dream_private.provider_state where blocked_until > t;
    select value into v_notice from dream_private.hugo_settings where key = 'aviso';
    insert into dream_private.hugo_calls(tool, result, session_id) values (p_tool, 'ok', v_sess);
    return jsonb_build_object('ok', true,
      'ia', case when v_pause is null then 'normal' when v_pause > t + interval '15 minutes' then 'sin_servicio' else 'lenta' end,
      'cola_global', v_pause is not null,
      'aviso', coalesce(v_notice, ''));
  end if;

  select user_id into v_user from dream_private.crisp_links where session_id = v_sess and expires_at > t;
  if v_user is null then
    insert into dream_private.hugo_calls(tool, result, session_id) values (p_tool, 'sin_cuenta', v_sess);
    return jsonb_build_object('ok', true, 'linked', false);
  end if;

  -- Bloqueo (mismo criterio que mod_ban_state y mod_appeals_list; sin textos).
  select * into s from public.mod_sanctions
    where user_id = v_user and kind = 'baneo' and status = 'activa' and (until is null or until > t)
    order by (until is null) desc, until desc limit 1;
  if found then
    v_estado := case when s.until is null then 'baneada_permanente' else 'baneada_temporal' end;
    v_ban := jsonb_build_object('estado', v_estado, 'regla', split_part(s.rule, ':', 1), 'desde', s.created_at, 'hasta', s.until);
  else
    select * into s from public.mod_sanctions
      where user_id = v_user and kind = 'limitacion' and status = 'activa' and (until is null or until > t)
      order by created_at desc limit 1;
    if found then
      v_ban := jsonb_build_object('estado', 'limitada', 'regla', split_part(s.rule, ':', 1), 'desde', s.created_at, 'hasta', s.until);
    else
      v_ban := jsonb_build_object('estado', 'sin_bloqueo', 'regla', null, 'desde', null, 'hasta', null);
    end if;
  end if;
  select jsonb_build_object('estado', a.status, 'fecha', a.created_at) into v_appeal
    from public.mod_appeals a where a.user_id = v_user order by a.created_at desc limit 1;
  v_appeal := coalesce(v_appeal, jsonb_build_object('estado', 'ninguna', 'fecha', null));

  if p_tool = 'consultar_bloqueo' then
    insert into dream_private.hugo_calls(tool, result, session_id) values (p_tool, 'ok', v_sess);
    return jsonb_build_object('ok', true, 'linked', true, 'bloqueo', v_ban, 'apelacion', v_appeal);
  end if;

  -- consultar_cuenta
  select split_part(btrim(display_name), ' ', 1) into v_name from public.dream_profiles where id = v_user;
  v_name := nullif(left(coalesce(v_name, ''), 20), '');
  v_special := dream_private.is_special_account(v_user);
  select * into c from dream_private.limits where id;
  select requests into v_req from dream_private.counters where scope = v_user::text and bucket = d;
  v_daily := case when v_special then null else c.daily end;
  select blocked_until into v_blocked from dream_private.user_blocks where owner_id = v_user;
  select max(blocked_until) into v_pause from dream_private.provider_state where blocked_until > t;
  v_queue := (v_blocked is not null and v_blocked > t) or v_pause is not null;
  v_res := jsonb_build_object(
    'ok', true, 'linked', true,
    'nombre', v_name,
    'bloqueo', v_ban,
    'cuenta_especial', v_special,
    'mensajes_hoy', coalesce(v_req, 0),
    'limite_hoy', v_daily,
    'se_reinicia', d + interval '1 day',
    'en_cola', v_queue,
    'avisos_recientes', coalesce((select jsonb_agg(jsonb_build_object('regla', split_part(x.rule, ':', 1), 'fecha', x.created_at) order by x.created_at desc)
        from (select rule, created_at from public.mod_sanctions where user_id = v_user and kind = 'aviso' and status <> 'levantada' order by created_at desc limit 5) x), '[]'::jsonb),
    'apelaciones', coalesce((select jsonb_agg(jsonb_build_object('estado', x.status, 'fecha', x.created_at) order by x.created_at desc)
        from (select status, created_at from public.mod_appeals where user_id = v_user order by created_at desc limit 5) x), '[]'::jsonb));
  insert into dream_private.hugo_calls(tool, result, session_id) values (p_tool, 'ok', v_sess);
  return v_res;
end $$;

-- ── Panel: bandeja «Soporte» (sin datos personales) ───────────────────────
create or replace function public.hugo_panel()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'aviso', coalesce((select value from dream_private.hugo_settings where key = 'aviso'), ''),
    'resumen', (select coalesce(jsonb_object_agg(result, n), '{}'::jsonb) from (
        select result, count(*) n from dream_private.hugo_calls where called_at > clock_timestamp() - interval '24 hours' group by result) r),
    'llamadas', coalesce((select jsonb_agg(jsonb_build_object('hora', x.called_at, 'herramienta', x.tool, 'resultado', x.result, 'sesion', x.session_id) order by x.called_at desc)
        from (select called_at, tool, result, session_id from dream_private.hugo_calls order by called_at desc limit 100) x), '[]'::jsonb));
$$;

create or replace function public.hugo_set_notice(p_text text)
returns void language sql security definer set search_path = '' as $$
  insert into dream_private.hugo_settings(key, value) values ('aviso', left(btrim(coalesce(p_text, '')), 280))
  on conflict (key) do update set value = excluded.value, updated_at = clock_timestamp();
$$;

-- Panel: buscar una cuenta por correo (solo devuelve el id; el Panel no guarda
-- ni audita el correo en claro).
create or replace function public.hugo_find_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function public.hugo_find_by_email(text) from public, anon, authenticated;
grant execute on function public.hugo_find_by_email(text) to service_role;

revoke all on function public.hugo_link(uuid, text), public.hugo_unlink(uuid), public.hugo_call(text, text),
  public.hugo_panel(), public.hugo_set_notice(text) from public, anon, authenticated;
grant execute on function public.hugo_link(uuid, text), public.hugo_unlink(uuid), public.hugo_call(text, text),
  public.hugo_panel(), public.hugo_set_notice(text) to service_role;

commit;
