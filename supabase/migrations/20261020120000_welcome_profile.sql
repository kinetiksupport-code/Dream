-- PROPOSAL, NOT APPLIED. Needs Carlos's OK (CLAUDE.md). Design and order of
-- deployment: docs/CONSENTIMIENTO.md.
--
-- Bienvenida para usuarios nuevos (prompt «bienvenida» §4.4). Builds on
-- 20261017120000_ai_consent.sql, which IS applied in production (recorded as
-- 20261019141145 ai_consent): ai_consent_at and dream_private.consent_events
-- already exist. birth_date, age_band and onboarding_completed exist since
-- 20261015170000 and are reused.
--
-- Only dream-api (service_role) writes these columns: `authenticated` may
-- update only display_name, avatar_url and academic_level
-- (20261008192123_security_admission), and RLS lets each student read only
-- their own row (dream_profiles_select_own).

begin;

-- Hobbies: up to 8, each 1–30 characters. A CHECK cannot hold a subquery,
-- so the element rule lives in an immutable function.
create or replace function dream_private.valid_interests(items text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(cardinality(items), 0) <= 8
    and not exists (
      select 1 from unnest(coalesce(items, '{}'::text[])) as i
      where i is null or char_length(i) not between 1 and 30
    );
$$;

alter table public.dream_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists nickname text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists onboarding_step smallint not null default 0;

alter table public.dream_profiles
  add constraint dream_profiles_nickname_check
    check (nickname is null or char_length(nickname) between 1 and 20),
  add constraint dream_profiles_interests_check
    check (dream_private.valid_interests(interests)),
  add constraint dream_profiles_onboarding_step_check
    check (onboarding_step between 0 and 6),
  add constraint dream_profiles_terms_version_check
    check (terms_version is null or char_length(terms_version) <= 20);

comment on column public.dream_profiles.terms_accepted_at is
  'When the student ticked «He leído y acepto los Términos y la Política de privacidad».';
comment on column public.dream_profiles.terms_version is
  'Version of the Términos and Política accepted (lib/consent.ts TERMS_VERSION). An older one asks again.';
comment on column public.dream_profiles.nickname is
  'What the AI calls the student. Never sent to the AI provider: dream-api replaces {{APODO}} in the answer.';
comment on column public.dream_profiles.interests is
  'Hobbies chosen in the welcome (up to 8). Sent to the AI provider, without identifiers, to pick examples.';
comment on column public.dream_profiles.onboarding_step is
  'Next welcome step to show (0 = Hola … 4 = edad, 6 = done). Lets a reload resume.';

-- Every current profile has onboarding_completed = true from the old
-- `onboarding` action (checked on 20/10/2026: 10 of 10) and none has
-- ai_consent_at. Without this reset they would only see the consent step;
-- with it, everyone sees the whole welcome once.
update public.dream_profiles
  set onboarding_completed = false, onboarding_step = 0
  where ai_consent_at is null;

-- The consent history also records the terms box and its version.
alter table dream_private.consent_events
  drop constraint if exists consent_events_kind_check;
alter table dream_private.consent_events
  add constraint consent_events_kind_check check (kind in ('ai', 'guardian', 'terms')),
  add column if not exists terms_version text;

commit;
