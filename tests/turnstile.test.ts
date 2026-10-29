import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HUMAN_CHECK_MESSAGE,
  SITEVERIFY_URL,
  TURNSTILE_ACTIONS,
  createSpentTokens,
  verifyTurnstile,
} from "../supabase/functions/dream-api/turnstile.mjs";
import { moderationGate, suspiciousNewAccount, THRESHOLDS } from "../supabase/functions/dream-api/moderation.mjs";
import { handleStudentModeration } from "../supabase/functions/dream-api/student-moderation.mjs";

// Turnstile validado en el servidor (docs/turnstile.md). Cloudflare simulado.

const ENV = { TURNSTILE_SECRET_KEY: "s".repeat(35) };
const NOW = Date.parse("2026-10-29T10:00:00Z");
const TOKEN = "tok.".padEnd(60, "x");
const ACTION = TURNSTILE_ACTIONS.qr;

type Reply = Record<string, unknown> | Error | { status: number };
function cloudflare(reply: Reply) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchImpl = async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, body: init.body });
    if (reply instanceof Error) throw reply;
    if ("status" in reply && typeof reply.status === "number") return new Response("{}", { status: reply.status });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}
const good = { success: true, hostname: "www.edudream.es", action: ACTION, challenge_ts: new Date(NOW - 10_000).toISOString(), "error-codes": [] };
const lines: string[] = [];
const log = (line: string) => void lines.push(line);
const verify = (reply: Reply, extra: Record<string, unknown> = {}) => {
  const cf = cloudflare(reply);
  return { cf, run: () => verifyTurnstile({ token: TOKEN, action: ACTION, env: ENV, fetchImpl: cf.fetchImpl, spent: createSpentTokens(() => NOW), now: NOW, log, ...extra }) };
};

test("a valid token passes; the secret and the visitor IP go to Cloudflare, never the logs", async () => {
  const { cf, run } = verify(good, { remoteip: "198.51.100.7" });
  assert.deepEqual(await run(), { ok: true });
  assert.equal(cf.calls[0].url, SITEVERIFY_URL);
  assert.equal(cf.calls[0].body.get("secret"), ENV.TURNSTILE_SECRET_KEY);
  assert.equal(cf.calls[0].body.get("response"), TOKEN);
  assert.equal(cf.calls[0].body.get("remoteip"), "198.51.100.7");
  assert.match(String(cf.calls[0].body.get("idempotency_key")), /^[0-9a-f-]{36}$/);
});

test("missing token: 428 turnstile_required, Cloudflare is not called", async () => {
  for (const token of [undefined, null, "", 42, {}]) {
    const { cf, run } = verify(good, { token });
    const out = await run();
    assert.equal(out.ok, false);
    assert.equal(out.status, 428);
    assert.equal(out.code, "turnstile_required");
    assert.equal(out.message, HUMAN_CHECK_MESSAGE);
    assert.equal(cf.calls.length, 0);
  }
});

test("invalid token (Cloudflare says no) or too long: turnstile_failed", async () => {
  const { run } = verify({ success: false, "error-codes": ["invalid-input-response"] });
  assert.equal((await run()).code, "turnstile_failed");
  const long = verify(good, { token: "x".repeat(2049) });
  assert.equal((await long.run()).code, "turnstile_failed");
  assert.equal(long.cf.calls.length, 0);
});

test("a reused token is rejected, even before asking Cloudflare again", async () => {
  const spent = createSpentTokens(() => NOW);
  const cf = cloudflare(good);
  const once = () => verifyTurnstile({ token: TOKEN, action: ACTION, env: ENV, fetchImpl: cf.fetchImpl, spent, now: NOW, log });
  assert.equal((await once()).ok, true);
  const again = await once();
  assert.equal(again.ok, false);
  assert.equal(again.code, "turnstile_failed");
  assert.equal(cf.calls.length, 1);
  // Two at the same time: only one can pass.
  const spent2 = createSpentTokens(() => NOW);
  const both = await Promise.all([1, 2].map(() => verifyTurnstile({ token: "dup".padEnd(40, "y"), action: ACTION, env: ENV, fetchImpl: cloudflare(good).fetchImpl, spent: spent2, now: NOW, log })));
  assert.equal(both.filter((r) => r.ok).length, 1);
  // And Cloudflare's own duplicate answer is a failure too.
  assert.equal((await verify({ success: false, "error-codes": ["timeout-or-duplicate"] }).run()).code, "turnstile_failed");
});

test("a token from another domain or for another action is rejected", async () => {
  for (const hostname of ["edudream.vercel.app", "evil.example", "localhost", "", "www.edudream.es.evil.example"])
    assert.equal((await verify({ ...good, hostname }).run()).code, "turnstile_failed", hostname);
  assert.equal((await verify({ ...good, hostname: "edudream.es" }).run()).ok, true);
  assert.equal((await verify({ ...good, action: TURNSTILE_ACTIONS.appeal }).run()).code, "turnstile_failed");
  assert.equal((await verify({ ...good, action: undefined }).run()).code, "turnstile_failed");
  // localhost only when configured on purpose (local tests).
  assert.equal((await verify({ ...good, hostname: "localhost" }, { env: { ...ENV, TURNSTILE_EXTRA_HOSTNAMES: "localhost" } }).run()).ok, true);
});

test("a token older than 5 minutes is rejected", async () => {
  assert.equal((await verify({ ...good, challenge_ts: new Date(NOW - 301_000).toISOString() }).run()).code, "turnstile_failed");
  assert.equal((await verify({ ...good, challenge_ts: "nonsense" }).run()).code, "turnstile_failed");
});

test("Cloudflare down: fails closed (503 turnstile_unavailable), the action does not run", async () => {
  for (const reply of [new Error("network"), { status: 500 }, { status: 429 }, { success: false, "error-codes": ["internal-error"] }, { success: false, "error-codes": ["invalid-input-secret"] }]) {
    const out = await verify(reply).run();
    assert.equal(out.ok, false);
    assert.equal(out.status, 503);
    assert.equal(out.code, "turnstile_unavailable");
    assert.equal(out.message, HUMAN_CHECK_MESSAGE);
  }
  // A hung Cloudflare is cut by the timeout.
  const hang = (async (_u: string, init: { signal: AbortSignal }) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout"))))) as unknown as typeof fetch;
  const out = await verifyTurnstile({ token: TOKEN, action: ACTION, env: ENV, fetchImpl: hang, spent: createSpentTokens(() => NOW), now: NOW, timeoutMs: 20, log });
  assert.equal(out.code, "turnstile_unavailable");
});

test("without TURNSTILE_SECRET_KEY nothing is asked (not configured yet)", async () => {
  const { cf, run } = verify(good, { env: {}, token: undefined });
  assert.deepEqual(await run(), { ok: true, skipped: true });
  assert.equal(cf.calls.length, 0);
});

test("tokens and secrets never reach the logs", () => {
  const all = lines.join("\n");
  assert.ok(lines.length > 0);
  assert.ok(!all.includes(TOKEN));
  assert.ok(!all.includes(ENV.TURNSTILE_SECRET_KEY));
  assert.ok(!all.includes("198.51.100.7"));
});

// ── Dónde se pide ────────────────────────────────────────────────────────────

const HOUR = 3600_000;
const created = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const home = { hits_minute: 25, hits_hour: 30, distinct_users_hour: 2, user_hits_hour: 1 };

test("new account: only asked when something is odd, never in a school or for older accounts", () => {
  assert.equal(suspiciousNewAccount({ createdAt: created(HOUR), sig: home, now: NOW }), true);
  assert.equal(suspiciousNewAccount({ createdAt: created(HOUR), sig: { ...home, hits_minute: 1, hits_hour: 80 }, now: NOW }), true);
  // Normal use from home: nothing.
  assert.equal(suspiciousNewAccount({ createdAt: created(HOUR), sig: { ...home, hits_minute: 2, hits_hour: 5 }, now: NOW }), false);
  // A school: many accounts at once is normal.
  assert.equal(suspiciousNewAccount({ createdAt: created(HOUR), sig: { ...home, distinct_users_hour: THRESHOLDS.sharedNetworkMinUsers }, now: NOW }), false);
  // Account older than 24 h, or unknown date: nothing.
  assert.equal(suspiciousNewAccount({ createdAt: created(25 * HOUR), sig: home, now: NOW }), false);
  assert.equal(suspiciousNewAccount({ createdAt: null, sig: home, now: NOW }), false);
  assert.equal(suspiciousNewAccount({ createdAt: created(HOUR), sig: null, now: NOW }), false);
});

function modDb(signal: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (fn: string) => {
      calls.push(fn);
      if (fn === "mod_ip_check") return { ip_blocked_until: null, user_limited_until: null, ...signal };
      return 0;
    },
  };
}
const GATE = { headers: new Headers({ "cf-connecting-ip": "198.51.100.7" }), userId: "00000000-0000-4000-8000-000000000001", ageBand: "18_plus", now: NOW, log: () => {} };

test("the gate asks for the check only in enforce, and respects its answer", async () => {
  const denied = { status: 428, code: "turnstile_required", message: HUMAN_CHECK_MESSAGE, retryAfter: 0 };
  let asked = 0;
  const challenge = async () => (asked++, denied);
  const env = { MOD_MODE: "enforce", MOD_IP_PEPPER: "p".repeat(40) };
  assert.deepEqual(await moderationGate({ ...GATE, rpc: modDb(home).rpc, env, challenge }), denied);
  assert.equal(asked, 1);
  // observe / off: never asks.
  for (const MOD_MODE of ["observe", "off"]) await moderationGate({ ...GATE, rpc: modDb(home).rpc, env: { ...env, MOD_MODE }, challenge });
  assert.equal(asked, 1);
  // A check that passes lets the rest of the gate run.
  assert.equal(await moderationGate({ ...GATE, rpc: modDb({ ...home, hits_minute: 1 }).rpc, env, challenge: async () => null }), null);
  // A check that breaks fails open, like the rest of the gate.
  assert.equal(await moderationGate({ ...GATE, rpc: modDb(home).rpc, env, challenge: async () => { throw new Error("db"); } }), null);
});

test("appeal: without a valid check the appeal is not created", async () => {
  const calls: string[] = [];
  const rpc = async (fn: string) => (calls.push(fn), { ok: true, code: "DREAM-ABCD-EFGH", due_at: "x" });
  const no = await handleStudentModeration({
    action: "mod_appeal_create", body: { body: "Fue un error" }, userId: GATE.userId, rpc,
    humanCheck: async () => ({ ok: false, status: 428, code: "turnstile_required", message: HUMAN_CHECK_MESSAGE }),
  });
  assert.equal(no?.status, 428);
  assert.equal(no?.body.code, "turnstile_required");
  assert.deepEqual(calls, []);
  const yes = await handleStudentModeration({ action: "mod_appeal_create", body: { body: "Fue un error" }, userId: GATE.userId, rpc, humanCheck: async () => ({ ok: true }) });
  assert.equal(yes?.status, 200);
  assert.deepEqual(calls, ["mod_appeal_create"]);
});

test("Turnstile is wired where Carlos decided, and not in the login", () => {
  const index = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  assert.match(index, /humanCheck: humanCheckFor\(TURNSTILE_ACTIONS\.qr/);
  assert.match(index, /humanCheckFor\(TURNSTILE_ACTIONS\.appeal/);
  assert.match(index, /humanCheckFor\(TURNSTILE_ACTIONS\.firstAi/);
  for (const f of ["app/login/page.tsx", "app/auth/callback/page.tsx"]) assert.doesNotMatch(readFileSync(f, "utf8"), /turnstile/i, f);
});
