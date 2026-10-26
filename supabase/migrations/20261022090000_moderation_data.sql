-- Moderación y antiabuso, bloques B1 y B2. APLICAR SOLO CON EL OK DE CARLOS.
--
-- Las normas son las de la tabla G de los términos (content/legal/terminos.ts,
-- §6.G). Cada regla apunta a una fila de esa tabla desde
-- supabase/functions/dream-api/moderation.mjs; aquí solo se guardan datos.
--
-- Privacidad:
--  - La IP nunca se guarda en claro: solo su huella HMAC-SHA256 calculada en
--    dream-api con el secreto MOD_IP_PEPPER (64 caracteres hexadecimales aquí).
--  - mod_events guarda una referencia mínima (ids), nunca el texto del alumno.
--  - Las filas de IP se borran a los 30 días (mod_purge). Todo se borra en
--    cascada al eliminar la cuenta.
--  - El alumno solo puede LEER sus propias sanciones y reclamaciones. Escribir
--    y leer el resto solo lo hace dream-api con la clave de servicio.

begin;

create schema if not exists dream_private;

-- ── Lo que ve el alumno: sus sanciones y sus reclamaciones ──────────────────
create table if not exists public.mod_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('aviso', 'limitacion', 'baneo')),
  rule text not null check (char_length(rule) between 1 and 64),
  status text not null default 'activa' check (status in ('activa', 'revision_pendiente', 'levantada')),
  -- null en un aviso o en un baneo permanente.
  until timestamptz,
  decided_by text not null check (decided_by in ('sistema', 'ia', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mod_sanctions_user_idx on public.mod_sanctions(user_id, status, until);
create index if not exists mod_sanctions_pending_idx on public.mod_sanctions(created_at) where status = 'revision_pendiente';

create table if not exists public.mod_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sanction_id uuid references public.mod_sanctions(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'abierta' check (status in ('abierta', 'aceptada', 'rechazada')),
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists mod_appeals_user_idx on public.mod_appeals(user_id, created_at desc);

alter table public.mod_sanctions enable row level security;
alter table public.mod_appeals enable row level security;
revoke all on table public.mod_sanctions from public, anon, authenticated;
revoke all on table public.mod_appeals from public, anon, authenticated;
grant select on table public.mod_sanctions to authenticated;
grant select on table public.mod_appeals to authenticated;
drop policy if exists mod_sanctions_select_own on public.mod_sanctions;
create policy mod_sanctions_select_own on public.mod_sanctions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists mod_appeals_select_own on public.mod_appeals;
create policy mod_appeals_select_own on public.mod_appeals
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Interno: ni el navegador ni PostgREST llegan aquí ───────────────────────
create table if not exists dream_private.mod_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null check (char_length(rule) between 1 and 64),
  origin text not null check (origin in ('automatico', 'ia', 'manual')),
  severity text not null check (severity in ('baja', 'media', 'alta')),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Ids y códigos, nunca texto del alumno.
  ref text check (ref is null or char_length(ref) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists mod_events_user_rule_idx on dream_private.mod_events(user_id, rule, created_at desc);

create table if not exists dream_private.mod_ip_signals (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (ip_hash, user_id)
);
create index if not exists mod_ip_signals_seen_idx on dream_private.mod_ip_signals(last_seen);
create index if not exists mod_ip_signals_user_idx on dream_private.mod_ip_signals(user_id);

create table if not exists dream_private.mod_ip_blocks (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  until timestamptz not null,
  rule text not null check (char_length(rule) between 1 and 64),
  created_at timestamptz not null default now()
);
create index if not exists mod_ip_blocks_until_idx on dream_private.mod_ip_blocks(until);

-- Contador por minuto, IP y cuenta: sirve para las ventanas de 1 minuto y 1 hora.
create table if not exists dream_private.mod_ip_hits (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (ip_hash, user_id, bucket)
);
create index if not exists mod_ip_hits_bucket_idx on dream_private.mod_ip_hits(bucket);
create index if not exists mod_ip_hits_user_idx on dream_private.mod_ip_hits(user_id, bucket);

alter table dream_private.mod_events enable row level security;
alter table dream_private.mod_ip_signals enable row level security;
alter table dream_private.mod_ip_blocks enable row level security;
alter table dream_private.mod_ip_hits enable row level security;
revoke all on table dream_private.mod_events, dream_private.mod_ip_signals,
  dream_private.mod_ip_blocks, dream_private.mod_ip_hits from public, anon, authenticated;

-- ── Funciones: solo service_role (dream-api) ────────────────────────────────

-- Cuenta una petición que consume IA y devuelve lo que hace falta para decidir.
create or replace function public.mod_ip_check(p_ip_hash text, p_user uuid, p_record boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := date_trunc('minute', clock_timestamp());
  v_block timestamptz;
  v_limit timestamptz;
  v_ban timestamptz;
  v_banned boolean;
  v_min int;
  v_hour int;
  v_users int;
  v_user_hour int;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ip_hash_invalid';
  end if;
  if p_record then
    insert into dream_private.mod_ip_signals(ip_hash, user_id) values (p_ip_hash, p_user)
    on conflict (ip_hash, user_id) do update set last_seen = excluded.last_seen;
    insert into dream_private.mod_ip_hits(ip_hash, user_id, bucket, hits) values (p_ip_hash, p_user, v_minute, 1)
    on conflict (ip_hash, user_id, bucket) do update set hits = dream_private.mod_ip_hits.hits + 1;
    -- Limpieza oportunista: no hace falta pg_cron para que esto no crezca.
    if random() < 0.005 then perform public.mod_purge(); end if;
  end if;
  select max(until) into v_block from dream_private.mod_ip_blocks where ip_hash = p_ip_hash and until > v_now;
  select coalesce(sum(hits), 0) into v_min from dream_private.mod_ip_hits
    where ip_hash = p_ip_hash and bucket >= v_minute - interval '1 minute';
  select coalesce(sum(hits), 0), count(distinct user_id) into v_hour, v_users from dream_private.mod_ip_hits
    where ip_hash = p_ip_hash and bucket > v_now - interval '1 hour';
  select coalesce(sum(hits), 0) into v_user_hour from dream_private.mod_ip_hits
    where user_id = p_user and bucket > v_now - interval '1 hour';
  select max(until) into v_limit from public.mod_sanctions
    where user_id = p_user and kind = 'limitacion' and status = 'activa' and until > v_now;
  select bool_or(until is null or until > v_now), max(until) into v_banned, v_ban from public.mod_sanctions
    where user_id = p_user and kind = 'baneo' and status = 'activa';
  return jsonb_build_object(
    'ip_blocked_until', v_block,
    'user_limited_until', v_limit,
    'banned', coalesce(v_banned, false),
    'hits_minute', v_min,
    'hits_hour', v_hour,
    'distinct_users_hour', v_users,
    'user_hits_hour', v_user_hour
  );
end $$;

create or replace function public.mod_ip_block_set(p_ip_hash text, p_until timestamptz, p_rule text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'ip_hash_invalid'; end if;
  insert into dream_private.mod_ip_blocks(ip_hash, until, rule) values (p_ip_hash, p_until, p_rule)
  on conflict (ip_hash) do update
    set until = greatest(dream_private.mod_ip_blocks.until, excluded.until), rule = excluded.rule;
end $$;

-- Apunta un hecho y devuelve cuántas veces ya había pasado lo mismo en p_days.
create or replace function public.mod_event_add(
  p_user uuid, p_rule text, p_origin text, p_severity text, p_confidence numeric, p_ref text, p_days integer default 7
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_prior integer;
begin
  select count(*) into v_prior from dream_private.mod_events
    where user_id = p_user and rule = p_rule and created_at > clock_timestamp() - make_interval(days => greatest(1, p_days));
  insert into dream_private.mod_events(user_id, rule, origin, severity, confidence, ref)
  values (p_user, p_rule, p_origin, p_severity, p_confidence, left(p_ref, 80));
  return v_prior;
end $$;

-- Crea una sanción sin duplicar otra igual y vigente.
create or replace function public.mod_sanction_add(
  p_user uuid, p_kind text, p_until timestamptz, p_rule text, p_status text, p_by text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Un aviso siempre se apunta. Limitación o baneo: si ya hay una igual (o más
  -- larga) en vigor, se reutiliza.
  if p_kind <> 'aviso' then
    select id into v_id from public.mod_sanctions
      where user_id = p_user and kind = p_kind and rule = p_rule and status = p_status
        and (until is null or until > clock_timestamp())
        and (until is null or (p_until is not null and until >= p_until))
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.mod_sanctions(user_id, kind, until, rule, status, decided_by)
  values (p_user, p_kind, p_until, p_rule, p_status, p_by) returning id into v_id;
  return v_id;
end $$;

-- Borra lo que ya no hace falta: filas de IP a los 30 días, contadores a las 2 horas.
create or replace function public.mod_purge() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from dream_private.mod_ip_hits where bucket < clock_timestamp() - interval '2 hours';
  delete from dream_private.mod_ip_signals where last_seen < clock_timestamp() - interval '30 days';
  delete from dream_private.mod_ip_blocks where until < clock_timestamp() - interval '30 days';
end $$;

revoke all on function public.mod_ip_check(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.mod_ip_block_set(text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.mod_event_add(uuid, text, text, text, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.mod_sanction_add(uuid, text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.mod_purge() from public, anon, authenticated;
grant execute on function public.mod_ip_check(text, uuid, boolean) to service_role;
grant execute on function public.mod_ip_block_set(text, timestamptz, text) to service_role;
grant execute on function public.mod_event_add(uuid, text, text, text, numeric, text, integer) to service_role;
grant execute on function public.mod_sanction_add(uuid, text, timestamptz, text, text, text) to service_role;
grant execute on function public.mod_purge() to service_role;

commit;

-- Si Carlos activa pg_cron (Database › Extensions), la purga también corre cada
-- hora por su cuenta. Sin pg_cron sigue funcionando la limpieza oportunista.
do $$ begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('mod-purge', '17 * * * *', 'select public.mod_purge()');
  end if;
exception when others then
  null;
end $$;
