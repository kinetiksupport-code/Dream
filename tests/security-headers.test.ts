import test from "node:test";
import assert from "node:assert/strict";
import { HSTS, PERMISSIONS_POLICY, siteSecurityHeaders } from "../lib/security-headers";

const map = (env: Record<string, string | undefined>) => Object.fromEntries(siteSecurityHeaders(env).map((h) => [h.key, h.value]));

test("every page gets the basic security headers", () => {
  const h = map({});
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(h["Permissions-Policy"], PERMISSIONS_POLICY);
});

test("camera only for Dream itself, no microphone, no location", () => {
  assert.match(PERMISSIONS_POLICY, /camera=\(self\)/);
  assert.match(PERMISSIONS_POLICY, /microphone=\(\)/);
  assert.match(PERMISSIONS_POLICY, /geolocation=\(\)/);
});

test("HSTS with includeSubDomains only after Carlos turns it on, and never preload", () => {
  assert.equal(map({})["Strict-Transport-Security"], undefined);
  assert.equal(map({ DREAM_HSTS: "yes" })["Strict-Transport-Security"], undefined);
  assert.equal(map({ DREAM_HSTS: "on" })["Strict-Transport-Security"], "max-age=63072000; includeSubDomains");
  assert.doesNotMatch(HSTS, /preload/);
});
