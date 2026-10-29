import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudflareChallenge } from "../lib/maintenance-check";

const res = (status: number, headers: Record<string, string>) => ({ ok: status >= 200 && status < 300, headers: new Headers(headers) });

test("a Cloudflare challenge is not Dream saying 'maintenance' or 'no access'", () => {
  assert.equal(cloudflareChallenge(res(403, { "cf-mitigated": "challenge", "content-type": "text/html" })), true);
  assert.equal(cloudflareChallenge(res(503, { "content-type": "text/html; charset=UTF-8" })), true);
  assert.equal(cloudflareChallenge(res(200, { "cf-mitigated": "challenge" })), true);
});

test("Dream's own answers still count", () => {
  assert.equal(cloudflareChallenge(res(503, { "content-type": "application/json" })), false);
  assert.equal(cloudflareChallenge(res(401, { "content-type": "application/json" })), false);
  assert.equal(cloudflareChallenge(res(200, { "content-type": "application/json" })), false);
});

test("the periodic maintenance check ignores challenges before signing anyone out", () => {
  const source = readFileSync("components/providers.tsx", "utf8");
  const check = source.indexOf("if (cloudflareChallenge(response)) return;");
  const signOut = source.indexOf("[401, 403, 503].includes(response.status)");
  assert.ok(check > 0 && signOut > check);
});
