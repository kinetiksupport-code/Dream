-- PR 5 · Subida desde el móvil con QR (PROMPT_EXAMEN_ESTILO 5.3 y 8).
-- NO APLICAR sin el OK de Carlos. Diseño en docs/SUBIDA_QR.md.
--
-- Sesiones de subida privadas: solo dream-api (service_role) las toca, a
-- través de funciones security definer. Ni anon ni authenticated pueden leer,
-- escribir ni ejecutar nada de esto; tampoco hay publicación de Realtime: el
-- ordenador consulta el estado con upload_session_status (sondeo corto).
--
-- Del token solo se guarda su SHA-256 (hex). El token (32 bytes aleatorios,
-- 256 bits) y la llave del móvil se generan en dream-api y no se guardan.

create schema if not exists dream_private;
revoke all on schema dream_private from public, anon, authenticated;

create table dream_private.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.dream_exams(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Primer móvil que abre el enlace: solo ese puede subir (un solo uso de sesión).
  device_hash text check (device_hash is null or device_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'open' check (state in ('open', 'connected', 'closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  connected_at timestamptz,
  closed_at timestamptz,
  uploads_count integer not null default 0 check (uploads_count >= 0),
  bytes_received bigint not null default 0 check (bytes_received >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index upload_sessions_owner_state on dream_private.upload_sessions(owner_id, state);
create index upload_sessions_expires on dream_private.upload_sessions(expires_at);

create table dream_private.upload_session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references dream_private.upload_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  size_bytes bigint not null check (size_bytes >= 0),
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attachment_id uuid references public.dream_attachments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index upload_session_files_session on dream_private.upload_session_files(session_id, created_at);
create index upload_session_files_owner on dream_private.upload_session_files(owner_id);
create index upload_session_files_attachment on dream_private.upload_session_files(attachment_id);

-- RLS cerrada: activada y sin políticas. Solo las funciones de abajo.
alter table dream_private.upload_sessions enable row level security;
alter table dream_private.upload_session_files enable row level security;
revoke all on dream_private.upload_sessions, dream_private.upload_session_files from public, anon, authenticated;

-- Contador por ventana en dream_private.counters (ya existe; la limpieza de
-- dream_admission_cleanup borra los cubos de más de 2 días). Devuelve el valor
-- tras sumar 1.
create function dream_private.upload_bump(p_scope text, p_bucket timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  insert into dream_private.counters(scope, bucket, requests) values (p_scope, p_bucket, 1)
  on conflict (scope, bucket) do update set requests = dream_private.counters.requests + 1
  returning requests into n;
  return n;
end $$;

create function dream_private.upload_peek(p_scope text, p_bucket timestamptz)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select requests from dream_private.counters where scope = p_scope and bucket = p_bucket), 0);
$$;

-- Ordenador (dueño autenticado): abre una sesión nueva para un examen en
-- borrador. Cierra cualquier otra sesión abierta del mismo alumno.
create function public.dream_upload_session_create(
  p_owner uuid, p_exam uuid, p_token_hash text, p_ttl_seconds integer, p_hourly_limit integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t timestamptz := clock_timestamp(); s dream_private.upload_sessions;
begin
  if p_ttl_seconds not between 60 and 1800 or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request');
  end if;
  perform 1 from public.dream_exams where id = p_exam and owner_id = p_owner and status in ('draft', 'failed');
  if not found then return jsonb_build_object('ok', false, 'status', 409, 'code', 'exam_not_editable'); end if;
  if dream_private.upload_bump(p_owner::text || ':qr_create', date_trunc('hour', t)) > p_hourly_limit then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'upload_session_rate', 'retry_after',
      greatest(1, ceil(extract(epoch from date_trunc('hour', t) + interval '1 hour' - t))::integer));
  end if;
  -- Limpieza perezosa de sesiones viejas (de cualquiera): nada caducado se queda más de un día.
  delete from dream_private.upload_sessions where expires_at < t - interval '1 day';
  update dream_private.upload_sessions set state = 'closed', closed_at = t, updated_at = t
   where owner_id = p_owner and state <> 'closed';
  insert into dream_private.upload_sessions(owner_id, exam_id, token_hash, created_at, expires_at)
  values (p_owner, p_exam, p_token_hash, t, t + make_interval(secs => p_ttl_seconds))
  returning * into s;
  return jsonb_build_object('ok', true, 'session_id', s.id, 'expires_at', s.expires_at);
end $$;

-- Ordenador: alarga 10 minutos más una sesión aún viva (hasta su vida máxima).
create function public.dream_upload_session_renew(
  p_owner uuid, p_session uuid, p_ttl_seconds integer, p_max_lifetime_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t timestamptz := clock_timestamp(); s dream_private.upload_sessions;
begin
  select * into s from dream_private.upload_sessions where id = p_session and owner_id = p_owner for update;
  if not found or s.state = 'closed' or s.expires_at <= t then
    return jsonb_build_object('ok', false, 'status', 410, 'code', 'upload_session_gone');
  end if;
  perform 1 from public.dream_exams where id = s.exam_id and owner_id = p_owner and status in ('draft', 'failed');
  if not found then return jsonb_build_object('ok', false, 'status', 410, 'code', 'upload_session_gone'); end if;
  update dream_private.upload_sessions
     set expires_at = least(t + make_interval(secs => p_ttl_seconds), created_at + make_interval(secs => p_max_lifetime_seconds)),
         updated_at = t
   where id = s.id returning * into s;
  return jsonb_build_object('ok', true, 'session_id', s.id, 'expires_at', s.expires_at);
end $$;

-- Ordenador: cierra la sesión (paso siguiente, salir del asistente). Idempotente.
create function public.dream_upload_session_close(p_owner uuid, p_session uuid)
returns void language sql security definer set search_path = '' as $$
  update dream_private.upload_sessions set state = 'closed', closed_at = coalesce(closed_at, clock_timestamp()), updated_at = clock_timestamp()
   where id = p_session and owner_id = p_owner and state <> 'closed';
$$;

-- Ordenador: estado para el sondeo. Nunca devuelve hashes.
create function public.dream_upload_session_status(p_owner uuid, p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t timestamptz := clock_timestamp(); s dream_private.upload_sessions;
begin
  select * into s from dream_private.upload_sessions where id = p_session and owner_id = p_owner;
  if not found then return jsonb_build_object('ok', false, 'status', 404, 'code', 'upload_session_gone'); end if;
  return jsonb_build_object(
    'ok', true,
    'session_id', s.id,
    'state', case when s.state = 'closed' then 'closed' when s.expires_at <= t then 'expired' else s.state end,
    'connected', s.connected_at is not null,
    'connected_at', s.connected_at,
    'expires_at', s.expires_at,
    'uploads', s.uploads_count,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'attachment_id', f.attachment_id, 'file_name', f.file_name,
        'size_bytes', f.size_bytes, 'status', f.status, 'created_at', f.created_at
      ) order by f.created_at)
      from dream_private.upload_session_files f where f.session_id = s.id
    ), '[]'::jsonb)
  );
end $$;

-- Móvil (sin sesión de usuario, solo token): límites por IP y por token y,
-- si todo cuadra, «connect» ata el móvil a la sesión y «upload» reserva un
-- hueco y crea la fila del archivo en estado processing.
-- Cualquier token inválido, caducado, cerrado, de otro móvil o de un examen
-- que ya no es borrador da el MISMO resultado (404 upload_link_invalid).
create function public.dream_upload_qr_gate(
  p_token_hash text, p_ip_hash text, p_device_hash text, p_kind text,
  p_file_name text, p_bytes bigint, p_limits jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
  ip_minute integer := coalesce((p_limits->>'ip_per_minute')::integer, 30);
  ip_failures integer := coalesce((p_limits->>'ip_failures_per_hour')::integer, 20);
  max_attempts integer := coalesce((p_limits->>'session_attempts')::integer, 200);
  max_uploads integer := coalesce((p_limits->>'max_uploads')::integer, 10);
  max_bytes bigint := coalesce((p_limits->>'max_bytes')::bigint, 41943040);
  max_in_flight integer := coalesce((p_limits->>'max_in_flight')::integer, 2);
  fail_scope text := 'qr_ipfail:' || p_ip_hash;
  s dream_private.upload_sessions;
  f dream_private.upload_session_files;
  invalid jsonb := jsonb_build_object('ok', false, 'status', 404, 'code', 'upload_link_invalid');
begin
  if p_kind not in ('connect', 'upload') or p_ip_hash !~ '^[0-9a-f]{64}$' or p_device_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request');
  end if;
  if dream_private.upload_bump('qr_ip:' || p_ip_hash, date_trunc('minute', t)) > ip_minute then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'upload_rate', 'retry_after', 60);
  end if;
  if dream_private.upload_peek(fail_scope, date_trunc('hour', t)) >= ip_failures then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'upload_rate', 'retry_after',
      greatest(1, ceil(extract(epoch from date_trunc('hour', t) + interval '1 hour' - t))::integer));
  end if;

  select * into s from dream_private.upload_sessions where token_hash = p_token_hash for update;
  if not found or s.state = 'closed' or s.expires_at <= t
     or not exists (select 1 from public.dream_exams e where e.id = s.exam_id and e.owner_id = s.owner_id and e.status in ('draft', 'failed'))
     or (s.device_hash is not null and s.device_hash <> p_device_hash)
     or (p_kind = 'upload' and s.device_hash is null) then
    perform dream_private.upload_bump(fail_scope, date_trunc('hour', t));
    return invalid;
  end if;

  update dream_private.upload_sessions set attempts = attempts + 1, updated_at = t where id = s.id returning * into s;
  if s.attempts > max_attempts then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'upload_rate', 'retry_after', 60);
  end if;

  if p_kind = 'connect' then
    if s.device_hash is null then
      update dream_private.upload_sessions set device_hash = p_device_hash, state = 'connected', connected_at = t, updated_at = t
       where id = s.id returning * into s;
    end if;
    return jsonb_build_object('ok', true, 'expires_at', s.expires_at, 'uploads', s.uploads_count, 'max_uploads', max_uploads);
  end if;

  if p_bytes is null or p_bytes < 1 or p_file_name is null or char_length(p_file_name) not between 1 and 255 then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request');
  end if;
  if s.uploads_count >= max_uploads or s.bytes_received + p_bytes > max_bytes then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'upload_quota');
  end if;
  if (select count(*) from dream_private.upload_session_files
       where session_id = s.id and status = 'processing' and created_at > t - interval '3 minutes') >= max_in_flight then
    return jsonb_build_object('ok', false, 'status', 429, 'code', 'upload_busy', 'retry_after', 5);
  end if;
  update dream_private.upload_sessions set uploads_count = uploads_count + 1, bytes_received = bytes_received + p_bytes, updated_at = t
   where id = s.id returning * into s;
  insert into dream_private.upload_session_files(session_id, owner_id, file_name, size_bytes)
  values (s.id, s.owner_id, p_file_name, p_bytes) returning * into f;
  return jsonb_build_object('ok', true, 'owner_id', s.owner_id, 'exam_id', s.exam_id, 'file_id', f.id,
    'uploads', s.uploads_count, 'max_uploads', max_uploads);
end $$;

-- Móvil: resultado del archivo. Si falló, libera el hueco (los bytes recibidos
-- siguen contando para el tope de la sesión).
create function public.dream_upload_qr_finish(p_file uuid, p_attachment uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f dream_private.upload_session_files; n integer;
begin
  update dream_private.upload_session_files
     set status = case when p_attachment is null then 'failed' else 'processed' end,
         attachment_id = p_attachment, updated_at = clock_timestamp()
   where id = p_file and status = 'processing' returning * into f;
  if not found then return jsonb_build_object('ok', false); end if;
  if p_attachment is null then
    update dream_private.upload_sessions set uploads_count = greatest(0, uploads_count - 1), updated_at = clock_timestamp()
     where id = f.session_id returning uploads_count into n;
  else
    select uploads_count into n from dream_private.upload_sessions where id = f.session_id;
  end if;
  return jsonb_build_object('ok', true, 'uploads', n);
end $$;

revoke all on function
  dream_private.upload_bump(text, timestamptz),
  dream_private.upload_peek(text, timestamptz),
  public.dream_upload_session_create(uuid, uuid, text, integer, integer),
  public.dream_upload_session_renew(uuid, uuid, integer, integer),
  public.dream_upload_session_close(uuid, uuid),
  public.dream_upload_session_status(uuid, uuid),
  public.dream_upload_qr_gate(text, text, text, text, text, bigint, jsonb),
  public.dream_upload_qr_finish(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.dream_upload_session_create(uuid, uuid, text, integer, integer),
  public.dream_upload_session_renew(uuid, uuid, integer, integer),
  public.dream_upload_session_close(uuid, uuid),
  public.dream_upload_session_status(uuid, uuid),
  public.dream_upload_qr_gate(text, text, text, text, text, bigint, jsonb),
  public.dream_upload_qr_finish(uuid, uuid)
to service_role;
