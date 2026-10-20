-- Dream · 3 piezas que la herramienta de Supabase no deja aplicar sin confirmación.
-- Pegar ENTERO en Supabase > SQL Editor > Run, DESPUÉS de que el nuevo dream-api esté desplegado.

-- 1) QR: crear sesión de subida (de 20261018153000_upload_sessions.sql)
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
revoke all on function public.dream_upload_session_create(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.dream_upload_session_create(uuid, uuid, text, integer, integer) to service_role;

-- 2) Limpieza de uso de IA (de 20261017090000_ai_modes_windows.sql)
create or replace function public.dream_ai_usage_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from dream_private.ai_usage_attempts where created_at < clock_timestamp() - interval '2 days';
  delete from dream_private.ai_usage where window_started_at < clock_timestamp() - interval '30 days';
  delete from dream_private.ai_windows where ends_at < clock_timestamp() - interval '30 days';
$$;
revoke all on function public.dream_ai_usage_cleanup() from public, anon, authenticated;
grant execute on function public.dream_ai_usage_cleanup() to service_role;

-- 3) Quitar restos de profesores (20261015170000_student_only_cleanup.sql). Tablas vacías, comprobado el 19/10/2026.
create or replace function private.dream_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.dream_profiles(id, email, display_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), ''),
    nullif(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''), ''),
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.dream_profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.dream_profiles.avatar_url, excluded.avatar_url),
    updated_at = now();

  insert into public.dream_user_settings(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop table if exists public.dream_teacher_student_links;
drop table if exists public.dream_teacher_invites;
drop function if exists public.dream_classify_email(text);
drop table if exists public.dream_domain_rules;

alter table public.dream_profiles
  drop column if exists pref_step_by_step,
  drop column if exists pref_practice_suggestions,
  drop column if exists pref_calm_tone,
  drop column if exists role,
  drop column if exists education_mode,
  drop column if exists email_domain;
