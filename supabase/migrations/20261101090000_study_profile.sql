-- Perfil de estudio opcional (docs/HABLA_NATURAL.md, P4): asignaturas que le
-- cuestan, comunidad, objetivo, cómo prefiere que le expliquen y tiempo de
-- estudio. Solo valores de listas cerradas (los valida dream-api ›
-- onboarding.mjs › studyProfile); nunca texto libre. Lo escribe solo
-- dream-api (service role): el alumno no tiene permiso de UPDATE sobre esta
-- columna (security_admission concede solo display_name, avatar_url y
-- academic_level).
alter table public.dream_profiles
  add column if not exists study_profile jsonb not null default '{}'::jsonb;

alter table public.dream_profiles
  drop constraint if exists dream_profiles_study_profile_shape;
alter table public.dream_profiles
  add constraint dream_profiles_study_profile_shape
  check (jsonb_typeof(study_profile) = 'object' and pg_column_size(study_profile) <= 1024);

comment on column public.dream_profiles.study_profile is
  'Perfil de estudio opcional (listas cerradas): hard[], region, goal, style, time. Lo escribe dream-api.';
