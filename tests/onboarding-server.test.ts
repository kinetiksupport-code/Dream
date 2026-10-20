import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_TEXT as SERVER_TEXT,
  MINOR_RESET,
  NICKNAME_MARKER,
  OnboardingError,
  TERMS_VERSION as SERVER_VERSION,
  ageOn,
  consentBlock,
  consentDecision,
  createNicknameReplacer,
  madridToday,
  nicknameFor,
  onboardingPatch,
  personalContext,
  replaceNickname,
  welcomeFields,
} from "../supabase/functions/dream-api/onboarding.mjs";
import { CONSENT_TEXT, TERMS_VERSION } from "../lib/consent";

const now = new Date("2026-10-20T10:00:00Z");
const birth = (years: number) => `${2026 - years}-05-01`;
const fails = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof OnboardingError && e.code === code);

test("the server stores the exact texts and version the web shows", () => {
  assert.equal(SERVER_TEXT.ai, CONSENT_TEXT.ai);
  assert.equal(SERVER_TEXT.terms, CONSENT_TEXT.terms);
  assert.equal(SERVER_VERSION, TERMS_VERSION);
});

test("onboarding_save validates each field on the server", () => {
  assert.deepEqual(onboardingPatch({ step: 2, display_name: "  Lucía  " }), { display_name: "Lucía", onboarding_step: 2 });
  fails(() => onboardingPatch({ display_name: "   " }), "invalid_name");
  fails(() => onboardingPatch({ display_name: "x".repeat(41) }), "invalid_name");
  fails(() => onboardingPatch({ nickname: "x".repeat(21) }), "invalid_nickname");
  assert.deepEqual(onboardingPatch({ nickname: "" }), { nickname: null });
  fails(() => onboardingPatch({ interests: Array(9).fill("a") }), "invalid_interests");
  fails(() => onboardingPatch({ interests: ["x".repeat(31)] }), "invalid_interests");
  fails(() => onboardingPatch({ interests: [1] }), "invalid_interests");
  assert.deepEqual(onboardingPatch({ interests: ["Fútbol", "fútbol", " ", "Ajedrez"] }).interests, ["Fútbol", "Ajedrez"]);
  fails(() => onboardingPatch({ step: 6 }), "invalid_step");
  fails(() => onboardingPatch({}), "empty");
  // Nothing else can be written through it.
  assert.deepEqual(onboardingPatch({ step: 1, ai_consent_at: "2026-01-01", birth_date: "2000-01-01" }), { onboarding_step: 1 });
});

test("age in Madrid's calendar, with impossible dates rejected", () => {
  assert.equal(madridToday(new Date("2026-10-19T22:30:00Z")), "2026-10-20");
  assert.equal(ageOn("2012-10-20", "2026-10-20"), 14);
  assert.equal(ageOn("2012-10-21", "2026-10-20"), 13);
  for (const bad of ["", "2010-02-30", "2027-01-01", "1899-12-31", "20/10/2010"]) assert.equal(ageOn(bad, "2026-10-20"), null, bad);
});

test("consent: 14 or older with both boxes and the current terms", () => {
  const { patch, events } = consentDecision(
    { birth_date: birth(16), ai_consent: true, terms_accepted: true, terms_version: TERMS_VERSION },
    {},
    now,
  );
  assert.equal(patch.age_band, "14_17");
  assert.equal(patch.birth_date, birth(16));
  assert.equal(patch.onboarding_completed, true);
  assert.equal(patch.ai_consent_at, now.toISOString());
  assert.deepEqual(
    events.map((e) => [e.kind, e.text_shown]),
    [
      ["ai", CONSENT_TEXT.ai],
      ["terms", CONSENT_TEXT.terms],
    ],
  );
  assert.equal(consentDecision({ birth_date: birth(20), ai_consent: true, terms_accepted: true, terms_version: TERMS_VERSION }, {}, now).patch.age_band, "18_plus");
});

test("consent is refused under 14, without a box, or with old terms", () => {
  const ok = { birth_date: birth(16), ai_consent: true, terms_accepted: true, terms_version: TERMS_VERSION };
  fails(() => consentDecision({ ...ok, birth_date: birth(12) }, {}, now), "under_age");
  fails(() => consentDecision({ ...ok, birth_date: "2010-02-30" }, {}, now), "invalid_birth_date");
  fails(() => consentDecision({ ...ok, ai_consent: false }, {}, now), "ai_consent_required");
  fails(() => consentDecision({ ...ok, terms_accepted: "true" }, {}, now), "terms_required");
  fails(() => consentDecision({ ...ok, terms_version: "2026-01-01" }, {}, now), "terms_outdated");
  // A saved birth date wins: it cannot be changed to slip past the age.
  fails(() => consentDecision({ ...ok, birth_date: birth(30) }, { birth_date: birth(12) }, now), "under_age");
  // A withdrawn permission is given again without a new date.
  assert.equal(consentDecision({ ...ok, birth_date: undefined }, { birth_date: birth(16) }, now).patch.birth_date, birth(16));
});

test("under 14 erases what the welcome saved and keeps no date", () => {
  assert.deepEqual(MINOR_RESET, { display_name: null, nickname: null, interests: [], onboarding_step: 0, birth_date: null, age_band: null });
});

test("AI actions are blocked without consent, but not on the old schema", () => {
  const done = { ai_consent_at: "x", terms_accepted_at: "x", terms_version: TERMS_VERSION };
  assert.equal(consentBlock({ ai_consent_at: null }), null, "old schema: no terms_version column");
  assert.equal(consentBlock(done), null);
  for (const p of [{ ...done, ai_consent_at: null }, { ...done, terms_accepted_at: null }, { ...done, terms_version: "2026-01-01" }])
    assert.equal(consentBlock(p)?.code, "consent_required");
});

test("profile never returns the birth date", () => {
  const fields = welcomeFields({ terms_version: null, birth_date: "2010-01-01", interests: ["Moda"], nickname: "Lu", age_band: "14_17" });
  assert.equal("birth_date" in fields, false);
  assert.equal(fields.nickname, "Lu");
  assert.deepEqual(welcomeFields({ ai_consent_at: null }), {}, "old schema: no new fields");
});

test("personalisation: a marker instead of the name, hobbies only when asked", () => {
  const profile = { terms_version: TERMS_VERSION, display_name: "Lucía Pérez", nickname: "Lu", interests: ["Fútbol", "Música"] };
  const context = personalContext(profile);
  assert.match(context, /\{\{APODO\}\}/);
  assert.match(context, /Fútbol, Música/);
  assert.doesNotMatch(context, /Lucía|Lu\b/);
  assert.doesNotMatch(personalContext(profile, { interests: false }), /Fútbol/);
  assert.equal(personalContext({ terms_version: null }), "");
  assert.equal(personalContext({ display_name: "Lucía", interests: ["Moda"] }), "", "old schema: nothing changes");
  assert.equal(nicknameFor(profile), "Lu");
  assert.equal(nicknameFor({ display_name: "Lucía Pérez" }), "Lucía");
});

test("{{APODO}} is replaced even when it arrives split across chunks", () => {
  const chunks = ["¡Muy bien, {", "{AP", "ODO}}! Ahora ", "prueba tú, {{APO", "DO}}.", " {", "no es marcador"];
  const r = createNicknameReplacer("Lu");
  const out = chunks.map((c) => r.push(c)).join("") + r.flush();
  assert.equal(out, "¡Muy bien, Lu! Ahora prueba tú, Lu. {no es marcador");
  const tail = createNicknameReplacer("Lu");
  assert.equal(tail.push("Hola {{AP") + tail.flush(), "Hola {{AP");
  assert.equal(replaceNickname(`Hola ${NICKNAME_MARKER}`, "Lu"), "Hola Lu");
});
