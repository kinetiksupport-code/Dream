import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consentBlock } from "../supabase/functions/dream-api/onboarding.mjs";

// SEC-02 (auditoría del 20/10/2026): el canal QR despacha como el dueño con
// examInternal=true, que se salta la puerta de consentimiento de handle().
// Estas comprobaciones fallan si se quita cualquiera de las tres defensas.
const index = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
const handleQr = index.slice(index.indexOf("async function handleQr"), index.indexOf("async function groqJson"));

test("the QR channel checks the owner's consent before dispatching", () => {
  const start = handleQr.indexOf("const ownerContext");
  const owner = handleQr.slice(start, handleQr.indexOf("try {", start));
  assert.match(owner, /if \(consentBlock\(profile\.data\)\) throw new UploadSessionError\(404, 'upload_link_invalid'/);
  assert.ok(owner.indexOf("consentBlock") < owner.indexOf("const context"), "antes de crear el contexto");
});

test("renewing a QR session needs consent, and withdrawing consent closes open sessions", () => {
  assert.match(index, /const CONSENT_GATED = new Set\(\[[^\]]*'upload_session_renew'/);
  const withdraw = index.slice(index.indexOf("// consent_withdraw"), index.indexOf("// consent_withdraw") + 1400);
  assert.match(withdraw, /from\('upload_sessions'\)\s*\.update\(\{ state: 'closed'/);
  assert.match(withdraw, /\.eq\('owner_id', user\.id\)/);
});

test("a withdrawn or outdated profile is blocked by consentBlock", () => {
  const base = { terms_version: "2026-10-20", terms_accepted_at: "2026-10-20T10:00:00Z", ai_consent_at: "2026-10-20T10:00:00Z", age_band: "14_17" };
  assert.equal(consentBlock(base), null);
  assert.ok(consentBlock({ ...base, ai_consent_at: null }));
  assert.ok(consentBlock({ ...base, terms_version: "2026-01-01" }));
});
