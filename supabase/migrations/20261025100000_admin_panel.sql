-- Panel de administración (B5). APLICAR SOLO CON EL OK DE CARLOS.
--
-- Quién es administrador:
--  - Una fila en dream_private.admin_users con el id de la cuenta de Supabase.
--    Las altas son SOLO A MANO en la base de datos (editor SQL de Supabase):
--      insert into dream_private.admin_users(user_id) values ('<id de la cuenta>');
--    Ninguna función ni acción puede crear, editar ni conceder administrador.
--  - Y además dream-api exige que el correo verificado del token sea ADMIN_EMAIL
--    (secreto del servidor) y que la sesión sea aal2 (doble factor).
--
-- Auditoría inmutable: dream_private.admin_audit_log solo admite INSERT. UPDATE,
-- DELETE y TRUNCATE los rechaza un disparador, además de tener los permisos
-- revocados, para todos los roles (también service_role).

begin;

create table if not exists dream_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table dream_private.admin_users enable row level security;
revoke all on table dream_private.admin_users from public, anon, authenticated, service_role;

create table if not exists dream_private.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  -- Sin clave foránea a propósito: el registro sobrevive al borrado de cuentas.
  actor uuid,
  action text not null check (char_length(action) between 1 and 64),
  target uuid,
  result text not null check (result in ('ok', 'denied', 'error', 'locked')),
  -- Códigos y ids; nunca datos personales ni texto de alumnos.
  detail text check (detail is null or char_length(detail) <= 200)
);
create index if not exists admin_audit_log_actor_idx on dream_private.admin_audit_log(actor, at desc);
alter table dream_private.admin_audit_log enable row level security;
revoke all on table dream_private.admin_audit_log from public, anon, authenticated, service_role;

create or replace function dream_private.admin_audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'admin_audit_log es inmutable' using errcode = '42501';
end $$;
drop trigger if exists admin_audit_log_no_update_delete on dream_private.admin_audit_log;
create trigger admin_audit_log_no_update_delete before update or delete on dream_private.admin_audit_log
  for each row execute function dream_private.admin_audit_immutable();
drop trigger if exists admin_audit_log_no_truncate on dream_private.admin_audit_log;
create trigger admin_audit_log_no_truncate before truncate on dream_private.admin_audit_log
  for each statement execute function dream_private.admin_audit_immutable();

-- Única vía de escritura del registro.
create or replace function public.admin_audit_add(p_actor uuid, p_action text, p_target uuid, p_result text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into dream_private.admin_audit_log(actor, action, target, result, detail)
  values (p_actor, left(p_action, 64), p_target, p_result, left(p_detail, 200));
end $$;

create or replace function public.admin_check(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from dream_private.admin_users where user_id = p_user);
$$;

-- Estado de la sesión del panel y límites, a partir del propio registro.
create or replace function public.admin_session_state(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_last_ok timestamptz;
  v_start timestamptz;
  v_denied integer;
  v_minute integer;
begin
  select max(at) into v_last_ok from dream_private.admin_audit_log where actor = p_actor and result = 'ok';
  select max(at) into v_start from dream_private.admin_audit_log where actor = p_actor and result = 'ok' and action = 'admin_session_start';
  select count(*) into v_denied from dream_private.admin_audit_log
    where actor = p_actor and result in ('denied', 'locked') and at > v_now - interval '15 minutes';
  select count(*) into v_minute from dream_private.admin_audit_log
    where actor = p_actor and result = 'ok' and at > v_now - interval '1 minute';
  return jsonb_build_object('last_ok', v_last_ok, 'session_start', v_start, 'denied_15m', v_denied, 'ok_1m', v_minute);
end $$;

-- Bloquea 24 h la última huella de IP vista de una cuenta (acción del panel).
create or replace function public.mod_ip_block_user(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select ip_hash into v_hash from dream_private.mod_ip_signals where user_id = p_user order by last_seen desc limit 1;
  if v_hash is null then return null; end if;
  perform public.mod_ip_block_set(v_hash, clock_timestamp() + interval '24 hours', 'ADMIN');
  perform public.mod_event_add(p_user, 'ADMIN:bloqueo_ip', 'manual', 'media', null, 'ip:' || left(v_hash, 12), 30);
  return left(v_hash, 12);
end $$;

-- Quita un bloqueo de IP por su prefijo (12 caracteres, el que ve el panel).
create or replace function public.mod_ip_unblock(p_prefix text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_prefix !~ '^[0-9a-f]{12}$' then raise exception 'prefix_invalid'; end if;
  delete from dream_private.mod_ip_blocks where left(ip_hash, 12) = p_prefix;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.admin_audit_add(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_check(uuid) from public, anon, authenticated;
revoke all on function public.admin_session_state(uuid) from public, anon, authenticated;
revoke all on function public.mod_ip_block_user(uuid) from public, anon, authenticated;
revoke all on function public.mod_ip_unblock(text) from public, anon, authenticated;
grant execute on function public.admin_audit_add(uuid, text, uuid, text, text) to service_role;
grant execute on function public.admin_check(uuid) to service_role;
grant execute on function public.admin_session_state(uuid) to service_role;
grant execute on function public.mod_ip_block_user(uuid) to service_role;
grant execute on function public.mod_ip_unblock(text) to service_role;

-- Lo que ve el panel: funciones con permisos mínimos, sin IP en claro (solo el
-- prefijo de 12 caracteres de la huella) y con el mínimo de datos personales.
create or replace function public.admin_inbox()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  return jsonb_build_object(
    'appeals', coalesce((select jsonb_agg(x order by x.created_at) from (
      select id, user_id, sanction_id, left(body, 600) as body, status, created_at,
             created_at + interval '30 days' as due_at,
             greatest(0, ceil(extract(epoch from (created_at + interval '30 days' - v_now)) / 86400))::int as days_left
      from public.mod_appeals where status = 'abierta' order by created_at limit 50) x), '[]'::jsonb),
    'observations', coalesce((select jsonb_agg(x order by x.ends_at) from (
      select id, new_user as user_id, status, entries, shared, ends_at, left(ip_hash, 12) as ip_prefix
      from dream_private.mod_observations where status in ('observando', 'revision_pendiente') order by ends_at limit 50) x), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(x order by x.created_at) from (
      select id, user_id, kind, rule, until, decided_by, created_at
      from public.mod_sanctions where status = 'revision_pendiente' order by created_at limit 50) x), '[]'::jsonb),
    'active_bans', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, user_id, rule, until, decided_by, created_at
      from public.mod_sanctions where kind = 'baneo' and status = 'activa' and (until is null or until > v_now)
      order by created_at desc limit 50) x), '[]'::jsonb),
    'ip_blocks', coalesce((select jsonb_agg(x order by x.until) from (
      select left(ip_hash, 12) as ip_prefix, until, rule from dream_private.mod_ip_blocks where until > v_now order by until limit 50) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select user_id, rule, origin, severity, created_at from dream_private.mod_events
      where severity = 'alta' and created_at > v_now - interval '14 days' order by created_at desc limit 50) x), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_user_card(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'sanctions', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, kind, rule, status, until, decided_by, created_at from public.mod_sanctions where user_id = p_user order by created_at desc limit 30) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select rule, origin, severity, created_at from dream_private.mod_events where user_id = p_user order by created_at desc limit 30) x), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, left(body, 600) as body, status, created_at, resolution from public.mod_appeals where user_id = p_user order by created_at desc limit 10) x), '[]'::jsonb),
    'observations', coalesce((select jsonb_agg(x order by x.started_at desc) from (
      select id, status, entries, shared, started_at, ends_at, left(ip_hash, 12) as ip_prefix
      from dream_private.mod_observations where new_user = p_user order by started_at desc limit 10) x), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_appeal_resolve(p_id uuid, p_status text, p_resolution text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.mod_appeals;
begin
  if p_status not in ('aceptada', 'rechazada') then return jsonb_build_object('ok', false, 'code', 'estado_no_valido'); end if;
  select * into a from public.mod_appeals where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_encontrada'); end if;
  if a.status <> 'abierta' then return jsonb_build_object('ok', false, 'code', 'ya_resuelta'); end if;
  update public.mod_appeals set status = p_status, resolution = left(p_resolution, 2000), resolved_at = clock_timestamp() where id = p_id;
  return jsonb_build_object('ok', true, 'user_id', a.user_id);
end $$;

revoke all on function public.admin_inbox() from public, anon, authenticated;
revoke all on function public.admin_user_card(uuid) from public, anon, authenticated;
revoke all on function public.admin_appeal_resolve(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_inbox() to service_role;
grant execute on function public.admin_user_card(uuid) to service_role;
grant execute on function public.admin_appeal_resolve(uuid, text, text) to service_role;

commit;
