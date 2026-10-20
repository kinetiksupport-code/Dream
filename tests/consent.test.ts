import test from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  consentGate,
  validateConsent,
  CONSENT_ERRORS,
  CONSENT_TEXT,
  TERMS_VERSION,
} from "../lib/consent";

const today = new Date(2026, 9, 17); // 17/10/2026, local time
const done = {
  ai_consent_at: "2026-10-20T10:00:00Z",
  terms_accepted_at: "2026-10-20T10:00:00Z",
  terms_version: TERMS_VERSION,
  age_band: "14_17" as const,
  onboarding_completed: true,
};

test("age counts whole years and waits for the birthday", () => {
  assert.equal(ageOn("2012-10-17", today), 14);
  assert.equal(ageOn("2012-10-18", today), 13);
  assert.equal(ageOn("2000-01-01", today), 26);
});

test("invalid, impossible or future birth dates have no age", () => {
  for (const value of ["", "17/10/2010", "2010-02-30", "2026-10-18", "1899-12-31"])
    assert.equal(ageOn(value, today), null, value);
});

test("the welcome stays off while dream-api does not send ai_consent_at", () => {
  assert.equal(consentGate(null), "off");
  assert.equal(consentGate({}), "off");
  assert.equal(consentGate({ nickname: "Ale" }), "off");
});

test("a new student gets the whole welcome", () => {
  assert.equal(consentGate({ ai_consent_at: null }), "welcome");
  assert.equal(consentGate({ ...done, onboarding_completed: false }), "welcome");
});

test("after the welcome, a withdrawn permission or new terms ask only the consent", () => {
  assert.equal(consentGate(done), "off");
  assert.equal(consentGate({ ...done, ai_consent_at: null }), "consent");
  assert.equal(consentGate({ ...done, terms_accepted_at: null }), "consent");
  assert.equal(consentGate({ ...done, terms_version: "2026-10-01" }), "consent");
  assert.equal(consentGate({ ...done, age_band: null }), "consent");
});

test("nothing is accepted by default: both boxes must be ticked", () => {
  assert.deepEqual(validateConsent({ ai: false, terms: false }), {
    ai: CONSENT_ERRORS.ai,
    terms: CONSENT_ERRORS.terms,
  });
  assert.deepEqual(validateConsent({ ai: true, terms: false }), { terms: CONSENT_ERRORS.terms });
  assert.deepEqual(validateConsent({ ai: true, terms: true }), {});
});

test("the AI box keeps the exact text of the Política de privacidad", () => {
  assert.equal(
    CONSENT_TEXT.ai,
    "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme",
  );
});
