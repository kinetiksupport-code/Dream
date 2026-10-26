-- Moderación B6: lado del alumno. APLICAR SOLO CON EL OK DE CARLOS.
--
-- Apelar y reclamar: cada reclamación lleva un CÓDIGO de apelación aleatorio y
-- de un solo uso (sin datos personales) para que, si el alumno escribe por el
-- chat de soporte, Carlos lo encuentre en el panel sin que a Crisp le llegue
-- ningún dato de la cuenta (ni correo ni nombre). Los avisos y limitaciones se
-- marcan como vistos con `acknowledged_at`.
-- El alumno sigue sin poder escribir en mod_*: todo pasa por dream-api.

begin;

alter table public.mod_appeals add column if not exists code text;
alter table public.mod_appeals drop constraint if exists mod_appeals_code_format;
alter table public.mod_appeals add constraint mod_appeals_code_format check (code is null or code ~ '^DREAM-[A-Z2-9]{4}-[A-Z2-9]{4}$');
create unique index if not exists mod_appeals_code_key on public.mod_appeals(code) where code is not null;
alter table public.mod_sanctions add column if not exists acknowledged_at timestamptz;

-- «DREAM-K7QM-2XPD»: 8 caracteres de un alfabeto de 32 sin letras que se confundan.
-- gen_random_uuid() es aleatorio de verdad; 256 es múltiplo de 32, así que no hay sesgo.
create or replace function dream_private.mod_make_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  i integer;
begin
  for attempt in 1..20 loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
      if i = 3 then v_code := v_code || '-'; end if;
    end loop;
    v_code := 'DREAM-' || v_code;
    if not exists (select 1 from public.mod_appeals where code = v_code) then return v_code; end if;
  end loop;
  raise exception 'code_unavailable';
end $$;

-- Reclamar (formulario). Máximo 3 abiertas por cuenta; texto de 1 a 2000.
create or replace function public.mod_appeal_create(p_user uuid, p_body text, p_sanction uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_sanction uuid;
  v_id uuid;
  v_code text;
  v_at timestamptz;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'texto_no_valido');
  end if;
  if (select count(*) from public.mod_appeals where user_id = p_user and status = 'abierta') >= 3 then
    return jsonb_build_object('ok', false, 'code', 'demasiadas_abiertas');
  end if;
  -- Solo se asocia una sanción que sea de esa cuenta.
  select id into v_sanction from public.mod_sanctions where id = p_sanction and user_id = p_user;
  v_code := dream_private.mod_make_code();
  insert into public.mod_appeals(user_id, sanction_id, body, code)
  values (p_user, v_sanction, v_body, v_code) returning id, created_at into v_id, v_at;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'due_at', v_at + interval '30 days');
end $$;

-- Código para pegar en el chat de soporte: el de la apelación abierta «por el
-- chat» o uno nuevo con un texto fijo. Si ya hay 3 abiertas, devuelve la primera.
create or replace function public.mod_appeal_code(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_marker constant text := 'Apelación por el chat de soporte.';
  v_code text;
  v_ban uuid;
begin
  select code into v_code from public.mod_appeals
    where user_id = p_user and status = 'abierta' and body = v_marker and code is not null order by created_at limit 1;
  if v_code is not null then return v_code; end if;
  if (select count(*) from public.mod_appeals where user_id = p_user and status = 'abierta') >= 3 then
    select code into v_code from public.mod_appeals where user_id = p_user and status = 'abierta' and code is not null order by created_at limit 1;
    return v_code;
  end if;
  select id into v_ban from public.mod_sanctions
    where user_id = p_user and kind = 'baneo' and status = 'activa' and (until is null or until > clock_timestamp())
    order by created_at desc limit 1;
  v_code := dream_private.mod_make_code();
  insert into public.mod_appeals(user_id, sanction_id, body, code) values (p_user, v_ban, v_marker, v_code);
  return v_code;
end $$;

-- Sus reclamaciones, con el plazo de 30 días a la vista.
create or replace function public.mod_appeals_list(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select id, status, code, created_at, created_at + interval '30 days' as due_at,
           case when status = 'abierta' then null else resolution end as resolution
    from public.mod_appeals where user_id = p_user order by created_at desc limit 10) x;
$$;

-- Avisos y limitaciones en vigor que el alumno aún no ha visto.
create or replace function public.mod_notices(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select id, kind, rule, until, created_at from public.mod_sanctions
    where user_id = p_user and kind in ('aviso', 'limitacion') and status = 'activa'
      and acknowledged_at is null and (until is null or until > clock_timestamp())
    order by created_at desc limit 10) x;
$$;

create or replace function public.mod_ack(p_user uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.mod_sanctions set acknowledged_at = clock_timestamp()
    where id = p_id and user_id = p_user and kind in ('aviso', 'limitacion') and acknowledged_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke all on function dream_private.mod_make_code() from public, anon, authenticated;
revoke all on function public.mod_appeal_create(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.mod_appeal_code(uuid) from public, anon, authenticated;
revoke all on function public.mod_appeals_list(uuid) from public, anon, authenticated;
revoke all on function public.mod_notices(uuid) from public, anon, authenticated;
revoke all on function public.mod_ack(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mod_appeal_create(uuid, text, uuid) to service_role;
grant execute on function public.mod_appeal_code(uuid) to service_role;
grant execute on function public.mod_appeals_list(uuid) to service_role;
grant execute on function public.mod_notices(uuid) to service_role;
grant execute on function public.mod_ack(uuid, uuid) to service_role;

commit;
