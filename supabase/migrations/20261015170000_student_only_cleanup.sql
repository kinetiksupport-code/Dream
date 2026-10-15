-- Dream is student-only: remove teacher features, role classification and the
-- per-user help settings ("Cómo te ayuda Dream"). Checked on 15/10/2026: no
-- teacher invites or links, every profile is a student, and age, birth date and
-- guardian columns are empty. Apply AFTER deploying the dream-api that no longer
-- reads these columns.

-- New-user trigger without the dropped columns.
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
  drop column if exists age_band,
  drop column if exists birth_date,
  drop column if exists guardian_required,
  drop column if exists guardian_confirmed_at,
  drop column if exists onboarding_completed,
  drop column if exists email_domain;
