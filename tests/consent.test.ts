import test from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  needsConsent,
  validateConsent,
  CONSENT_ERRORS,
} from "../lib/consent";

const today = new Date(2026, 9, 17); // 17/10/2026, local time

test("age counts whole years and waits for the birthday", () => {
  assert.equal(ageOn("2012-10-17", today), 14);
  assert.equal(ageOn("2012-10-18", today), 13);
  assert.equal(ageOn("2000-01-01", today), 26);
});

test("invalid, impossible or future birth dates have no age", () => {
  for (const value of ["", "17/10/2010", "2010-02-30", "2026-10-18", "1899-12-31"])
    assert.equal(ageOn(value, today), null, value);
});

test("the gate stays off while dream-api does not send ai_consent_at", () => {
  assert.equal(needsConsent(null), false);
  assert.equal(needsConsent({}), false);
});

test("the gate is on until the server records every required consent", () => {
  assert.equal(needsConsent({ ai_consent_at: null, age_band: null }), true);
  assert.equal(
    needsConsent({ ai_consent_at: "2026-10-17T10:00:00Z", age_band: null }),
    true,
  );
  assert.equal(
    needsConsent({
      ai_consent_at: "2026-10-17T10:00:00Z",
      age_band: "under_14",
      guardian_required: true,
      guardian_confirmed_at: null,
    }),
    true,
  );
  assert.equal(
    needsConsent({
      ai_consent_at: "2026-10-17T10:00:00Z",
      age_band: "under_14",
      guardian_required: true,
      guardian_confirmed_at: "2026-10-17T10:00:00Z",
    }),
    false,
  );
  assert.equal(
    needsConsent({ ai_consent_at: "2026-10-17T10:00:00Z", age_band: "14_17" }),
    false,
  );
});

test("nothing is accepted by default: every box must be ticked", () => {
  assert.deepEqual(
    validateConsent({ birthDate: "", guardian: false, ai: false }, today),
    { birthDate: CONSENT_ERRORS.birthMissing, ai: CONSENT_ERRORS.ai },
  );
});

test("under 14 needs the guardian box; 14 or older does not", () => {
  assert.deepEqual(
    validateConsent({ birthDate: "2013-05-01", guardian: false, ai: true }, today),
    { guardian: CONSENT_ERRORS.guardian },
  );
  assert.deepEqual(
    validateConsent({ birthDate: "2013-05-01", guardian: true, ai: true }, today),
    {},
  );
  assert.deepEqual(
    validateConsent({ birthDate: "2012-10-17", guardian: false, ai: true }, today),
    {},
  );
});

test("a future date is an error with its cause", () => {
  assert.deepEqual(
    validateConsent({ birthDate: "2027-01-01", guardian: false, ai: true }, today),
    { birthDate: CONSENT_ERRORS.birthInvalid },
  );
});
