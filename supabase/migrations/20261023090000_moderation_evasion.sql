-- Moderación B3: cuentas nuevas desde la IP de una cuenta baneada. APLICAR SOLO CON EL OK DE CARLOS.
--
-- Regla de Carlos (20/10/2026): no se banea en el primer momento; se espera 2
-- días y se observa. Fila de la tabla G: «Varias cuentas para saltarse límites,
-- cola o un baneo» (cierre de las cuentas extra y baneo de 7 días).
--
-- Salvaguarda 1b contra baneos injustos:
--  - la cuenta nueva debe haberse creado DESPUÉS del baneo;
--  - la regla solo es automática en una IP «de tamaño de hogar»: si en 30 días
--    esa huella la han usado más de 4 cuentas distintas, es una red compartida
--    (colegio, biblioteca, datos móviles) y NO se banea a nadie solo: el caso
--    queda «revision_pendiente» para una persona.
-- Solo se relaciona por la huella de IP y el comportamiento: nada de huellas de
-- dispositivo ni cookies de seguimiento.

begin;

create table if not exists dream_private.mod_observations (
  id uuid primary key default gen_random_uuid(),
  new_user uuid not null references auth.users(id) on delete cascade,
  banned_user uuid references auth.users(id) on delete set null,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  ban_id uuid references public.mod_sanctions(id) on delete set null,
  status text not null default 'observando'
    check (status in ('observando', 'descartada', 'revision_pendiente', 'confirmada', 'levantada')),
  shared boolean not null default false,
  entries integer not null default 0 check (entries >= 0),
  last_entry_at timestamptz,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  resolved_at timestamptz,
  unique (new_user, ip_hash)
);
create index if not exists mod_observations_status_idx on dream_private.mod_observations(status, ends_at);

-- Cada entrada con su huella de IP (nunca la IP en claro), para poder revisar y revertir.
create table if not exists dream_private.mod_observation_entries (
  observation_id uuid not null references dream_private.mod_observations(id) on delete cascade,
  at timestamptz not null default now(),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  primary key (observation_id, at)
);

alter table dream_private.mod_observations enable row level security;
alter table dream_private.mod_observation_entries enable row level security;
revoke all on table dream_private.mod_observations, dream_private.mod_observation_entries from public, anon, authenticated;

-- Cierra las sesiones de una cuenta (baneos). El token de acceso que ya esté
-- emitido caduca solo y dream-api comprueba el baneo en cada petición.
create or replace function public.mod_close_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user;
end $$;

-- Se llama en cada entrada de una cuenta (al abrir Dream y al usar la IA).
create or replace function public.mod_entry(
  p_ip_hash text, p_user uuid,
  p_window_days integer default 30, p_gap_minutes integer default 30,
  p_observe_days integer default 2, p_home_max integer default 4
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_obs dream_private.mod_observations;
  v_ban public.mod_sanctions;
  v_created timestamptz;
  v_accounts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'ip_hash_invalid'; end if;
  insert into dream_private.mod_ip_signals(ip_hash, user_id) values (p_ip_hash, p_user)
  on conflict (ip_hash, user_id) do update set last_seen = excluded.last_seen;

  select * into v_obs from dream_private.mod_observations where new_user = p_user and ip_hash = p_ip_hash;
  if not found then
    select created_at into v_created from auth.users where id = p_user;
    -- Un baneo activo de otra cuenta que usó esta IP en la ventana, y anterior a esta cuenta.
    select b.* into v_ban
    from public.mod_sanctions b
    join dream_private.mod_ip_signals s on s.user_id = b.user_id
    where s.ip_hash = p_ip_hash
      and s.user_id <> p_user
      and s.last_seen > v_now - make_interval(days => p_window_days)
      and b.kind = 'baneo' and b.status = 'activa' and (b.until is null or b.until > v_now)
      and v_created is not null and v_created > b.created_at
    order by b.created_at desc limit 1;
    if not found then return null; end if;
    select count(distinct user_id) into v_accounts from dream_private.mod_ip_signals
      where ip_hash = p_ip_hash and last_seen > v_now - make_interval(days => p_window_days);
    insert into dream_private.mod_observations(new_user, banned_user, ip_hash, ban_id, status, shared, ends_at)
    values (p_user, v_ban.user_id, p_ip_hash, v_ban.id,
            case when v_accounts > p_home_max then 'revision_pendiente' else 'observando' end,
            v_accounts > p_home_max, v_now + make_interval(days => p_observe_days))
    returning * into v_obs;
  end if;

  if v_obs.status in ('observando', 'revision_pendiente')
     and (v_obs.last_entry_at is null or v_obs.last_entry_at < v_now - make_interval(mins => p_gap_minutes)) then
    insert into dream_private.mod_observation_entries(observation_id, at, ip_hash) values (v_obs.id, v_now, p_ip_hash);
    update dream_private.mod_observations set entries = entries + 1, last_entry_at = v_now where id = v_obs.id
    returning * into v_obs;
  end if;
  return jsonb_build_object('id', v_obs.id, 'status', v_obs.status, 'shared', v_obs.shared,
                            'entries', v_obs.entries, 'ends_at', v_obs.ends_at);
end $$;

-- Cierra la observación cuando ha pasado el plazo.
create or replace function public.mod_observation_resolve(
  p_id uuid, p_auto boolean, p_min_entries integer, p_home_max integer default 4,
  p_ban_days integer default 7, p_window_days integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  o dream_private.mod_observations;
  v_accounts integer;
  v_until timestamptz := clock_timestamp() + make_interval(days => p_ban_days);
begin
  select * into o from dream_private.mod_observations where id = p_id for update;
  if not found then return jsonb_build_object('status', 'desconocida'); end if;
  if o.status <> 'observando' or o.ends_at > v_now then
    return jsonb_build_object('status', o.status, 'entries', o.entries);
  end if;
  select count(distinct user_id) into v_accounts from dream_private.mod_ip_signals
    where ip_hash = o.ip_hash and last_seen > v_now - make_interval(days => p_window_days);

  if o.entries < greatest(1, p_min_entries) then
    update dream_private.mod_observations set status = 'descartada', resolved_at = v_now where id = o.id;
    return jsonb_build_object('status', 'descartada', 'entries', o.entries);
  end if;

  if v_accounts > p_home_max or o.shared then
    update dream_private.mod_observations set status = 'revision_pendiente', shared = true, resolved_at = null where id = o.id;
    perform public.mod_sanction_add(o.new_user, 'baneo', v_until, 'G-MULTI', 'revision_pendiente', 'sistema');
    perform public.mod_event_add(o.new_user, 'G-MULTI:red_compartida', 'automatico', 'media', null, 'obs:' || o.id, 30);
    return jsonb_build_object('status', 'revision_pendiente', 'entries', o.entries);
  end if;

  if p_auto then
    perform public.mod_sanction_add(o.new_user, 'baneo', v_until, 'G-MULTI', 'activa', 'sistema');
    perform public.mod_event_add(o.new_user, 'G-MULTI', 'automatico', 'alta', null, 'obs:' || o.id, 30);
    perform public.mod_close_sessions(o.new_user);
    update dream_private.mod_observations set status = 'confirmada', resolved_at = v_now where id = o.id;
    return jsonb_build_object('status', 'confirmada', 'entries', o.entries);
  end if;

  -- Interruptor apagado: el sistema solo propone y lo decide una persona.
  perform public.mod_sanction_add(o.new_user, 'baneo', v_until, 'G-MULTI', 'revision_pendiente', 'sistema');
  perform public.mod_event_add(o.new_user, 'G-MULTI:propuesta', 'automatico', 'media', null, 'obs:' || o.id, 30);
  update dream_private.mod_observations set status = 'revision_pendiente', resolved_at = null where id = o.id;
  return jsonb_build_object('status', 'revision_pendiente', 'entries', o.entries);
end $$;

revoke all on function public.mod_close_sessions(uuid) from public, anon, authenticated;
revoke all on function public.mod_entry(text, uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mod_observation_resolve(uuid, boolean, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mod_close_sessions(uuid) to service_role;
grant execute on function public.mod_entry(text, uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.mod_observation_resolve(uuid, boolean, integer, integer, integer, integer) to service_role;

commit;
