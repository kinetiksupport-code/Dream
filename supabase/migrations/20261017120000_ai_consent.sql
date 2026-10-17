-- PROPOSAL, NOT APPLIED. Needs Carlos's OK (CLAUDE.md). Design and order of
-- deployment: docs/CONSENTIMIENTO.md.
--
-- Sign-up consent (Parte D): the date and time a student ticked
-- «Estoy de acuerdo en enviar mi información a proveedores de IA para que
-- Dream pueda responderme». The guardian box (under 14) keeps using the
-- existing guardian_confirmed_at; birth_date, age_band and guardian_required
-- also exist already (kept by 20261015170000_student_only_cleanup).
--
-- Only dream-api (service_role) writes these columns: since
-- 20261008192123_security_admission, `authenticated` may update only
-- display_name, avatar_url and academic_level, so a student cannot mark
-- consent by hand from the browser.

begin;

alter table public.dream_profiles
  add column if not exists ai_consent_at timestamptz;

comment on column public.dream_profiles.ai_consent_at is
  'When the student ticked the AI providers box at sign-up. Null = no consent or withdrawn: dream-api refuses chat, apuntes and exámenes.';
comment on column public.dream_profiles.guardian_confirmed_at is
  'When an under-14 student ticked the guardian permission box. Required when guardian_required.';

-- Consent history (proof of consent, GDPR art. 7.1): one row per tick or
-- withdrawal, with the exact text shown. Private schema, service_role only.
create table if not exists dream_private.consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ai', 'guardian')),
  granted boolean not null,
  text_shown text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists consent_events_user_idx
  on dream_private.consent_events(user_id, created_at desc);
revoke all on dream_private.consent_events from public, anon, authenticated;
grant select, insert on dream_private.consent_events to service_role;
grant usage, select on sequence dream_private.consent_events_id_seq to service_role;

commit;
