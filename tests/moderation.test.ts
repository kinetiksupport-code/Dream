import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  DEFAULT_IP_HEADER,
  MESSAGES,
  RULES,
  THRESHOLDS,
  decideAbuse,
  getClientIp,
  ipFingerprint,
  autoBanEnabled,
  minEntriesFrom,
  modMode,
  moderationEntry,
  moderationGate,
  normalizeIp,
  trustedClientIp,
} from "../supabase/functions/dream-api/moderation.mjs";

const PEPPER = "p".repeat(40);
const USER = "00000000-0000-4000-8000-000000000001";
const h = (record: Record<string, string>) => new Headers(record);

// ── B1: IP de confianza y huella ─────────────────────────────────────────────

test("only the platform header is trusted; spoofed headers never choose the IP", () => {
  const spoofed = h({
    "cf-connecting-ip": "198.51.100.7",
    "x-forwarded-for": "203.0.113.99, 10.0.0.1",
    "x-real-ip": "203.0.113.99",
    forwarded: "for=203.0.113.99",
    "true-client-ip": "203.0.113.99",
    "x-client-ip": "203.0.113.99",
  });
  assert.equal(trustedClientIp(spoofed), "198.51.100.7");
  // Sin la cabecera de confianza no hay IP: ningún otro encabezado la sustituye.
  const noTrusted = h({ "x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.99", forwarded: "for=203.0.113.99" });
  assert.equal(trustedClientIp(noTrusted), null);
  assert.equal(DEFAULT_IP_HEADER, "cf-connecting-ip");
});

test("x-forwarded-for, if configured, uses the hop added by the platform, never the client's first entry", () => {
  const request = h({ "x-forwarded-for": "203.0.113.99, 192.0.2.50" });
  assert.equal(trustedClientIp(request, { header: "x-forwarded-for" }), "192.0.2.50");
  assert.equal(trustedClientIp(request, { header: "x-forwarded-for", hopsFromRight: 2 }), "203.0.113.99");
  assert.equal(trustedClientIp(request, { header: "x-forwarded-for", hopsFromRight: 9 }), null);
});

test("a spoofed request cannot make the victim's fingerprint the one that is recorded", async () => {
  const attacker = "198.51.100.7";
  const victim = "203.0.113.99";
  const request = h({ "cf-connecting-ip": attacker, "x-forwarded-for": victim, "x-real-ip": victim });
  const seen = await ipFingerprint(trustedClientIp(request) as string, PEPPER);
  assert.equal(seen, await ipFingerprint(attacker, PEPPER));
  assert.notEqual(seen, await ipFingerprint(victim, PEPPER));
});

test("invalid or oversized values are not IPs", () => {
  for (const bad of ["", "not-an-ip", "999.1.1.1", "1.2.3", "a".repeat(100), "1.2.3.4, 5.6.7.8", "<script>"])
    assert.equal(normalizeIp(bad), null, bad);
  assert.equal(normalizeIp(" 198.51.100.7 "), "198.51.100.7");
});

test("IPv6 is cut to its /64 so changing inside the prefix is the same network; IPv4-mapped is IPv4", () => {
  const a = normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
  const b = normalizeIp("2001:0db8:0001:0002::1");
  assert.equal(a, "2001:0db8:0001:0002::/64");
  assert.equal(a, b);
  assert.notEqual(a, normalizeIp("2001:db8:1:3::1"));
  assert.equal(normalizeIp("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(normalizeIp("::1"), "0000:0000:0000:0000::/64");
});

test("the fingerprint is a keyed hash: 64 hex, stable, depends on the secret, hides the IP", async () => {
  const one = await ipFingerprint("198.51.100.7", PEPPER);
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.equal(one, await ipFingerprint("198.51.100.7", PEPPER));
  assert.notEqual(one, await ipFingerprint("198.51.100.7", "q".repeat(40)));
  assert.ok(!one.includes("198"));
  await assert.rejects(ipFingerprint("198.51.100.7", ""), /mod_pepper_missing/);
  await assert.rejects(ipFingerprint("198.51.100.7", "corto"), /mod_pepper_missing/);
});

// ── B2: decisión ─────────────────────────────────────────────────────────────

const quiet = { hitsMinute: 3, hitsHour: 20, distinctUsers: 1, userHitsHour: 20 };

test("a normal student is never touched", () => {
  assert.equal(decideAbuse(quiet).action, "none");
  assert.equal(decideAbuse({ hitsMinute: 24, hitsHour: 140, distinctUsers: 4, userHitsHour: 50 }).action, "none");
});

test("a burst from a non-shared IP blocks the IP (rule: bots, table G)", () => {
  const decision = decideAbuse({ hitsMinute: 200, hitsHour: 200, distinctUsers: 1, userHitsHour: 200 });
  assert.equal(decision.action, "block_ip");
  assert.equal(decision.rule, RULES.bot.id);
  assert.equal(decision.mostlyThisUser, true);
  assert.equal(decideAbuse({ hitsMinute: 5, hitsHour: 400, distinctUsers: 3, userHitsHour: 100 }).action, "block_ip");
});

test("school scenario: many legitimate accounts on one IP never produce an IP block or ban", () => {
  // 30 alumnos × ~6 por minuto, cada uno con poca actividad en la hora.
  const school = { hitsMinute: 180, hitsHour: 900, distinctUsers: 30, userHitsHour: 30 };
  const decision = decideAbuse(school);
  assert.equal(decision.action, "none");
  assert.equal(decision.shared, true);
  assert.equal(decision.reason, "shared_network_ok");
});

test("in a shared network only the account that hammers is limited, not the IP", () => {
  const decision = decideAbuse({ hitsMinute: 300, hitsHour: 1500, distinctUsers: 25, userHitsHour: 120 });
  assert.equal(decision.action, "limit_user");
  assert.equal(decision.rule, RULES.spam.id);
  assert.equal(decision.shared, true);
});

test("minors get stricter thresholds, never a harsher outcome", () => {
  const edge = { hitsMinute: 35, hitsHour: 130, distinctUsers: 1, userHitsHour: 50 };
  assert.equal(decideAbuse(edge, { minor: false }).action, "none");
  assert.equal(decideAbuse(edge, { minor: true }).action, "block_ip");
  assert.equal(decideAbuse(edge, { minor: true }).rule, RULES.bot.id);
});

test("every rule points at a row of table G that exists in the Terms", () => {
  const terms = readFileSync("content/legal/terminos.ts", "utf8");
  for (const rule of Object.values(RULES)) assert.ok(terms.includes(rule.table), rule.id);
});

// ── B2: la puerta, con una base simulada ─────────────────────────────────────

type Call = { fn: string; args: Record<string, unknown> };
function fakeDb(signal: Record<string, unknown>, priorEvents = 0) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "mod_ip_check") return { ip_blocked_until: null, user_limited_until: null, banned: false, ...signal };
    if (fn === "mod_event_add") return priorEvents;
    return null;
  };
  return { calls, rpc };
}
const ENV = { MOD_MODE: "enforce", MOD_IP_PEPPER: PEPPER };
const ROUTED = h({ "cf-connecting-ip": "198.51.100.7" });
const burst = { hits_minute: 200, hits_hour: 200, distinct_users_hour: 1, user_hits_hour: 200 };
const school = { hits_minute: 180, hits_hour: 900, distinct_users_hour: 30, user_hits_hour: 30 };
const log = () => {};

test("MOD_MODE off (the default) does nothing at all: no IP read, no database call", async () => {
  for (const mode of [undefined, "", "off", "enforce ", "ON"]) {
    const db = fakeDb(burst);
    assert.equal(await moderationGate({ rpc: db.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: { ...ENV, MOD_MODE: mode }, log }), null);
    assert.equal(db.calls.length, 0);
  }
  assert.equal(modMode("observe"), "observe");
  assert.equal(modMode(undefined), "off");
});

test("observe mode records the decision as an event but blocks and sanctions nothing", async () => {
  const db = fakeDb(burst);
  const out = await moderationGate({ rpc: db.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: { ...ENV, MOD_MODE: "observe" }, log });
  assert.equal(out, null);
  assert.deepEqual(db.calls.map((c) => c.fn), ["mod_ip_check", "mod_event_add"]);
  assert.equal(db.calls[1].args.p_rule, `${RULES.bot.id}:observe`);
});

test("enforce: a burst blocks the IP for 24 h, proposes (never applies) the 7-day ban, and answers 429", async () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  const db = fakeDb(burst);
  const out = await moderationGate({ rpc: db.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now, log });
  assert.equal(out?.status, 429);
  assert.equal(out?.code, "mod_ip_blocked");
  assert.equal(out?.message, MESSAGES.mod_ip_blocked);
  assert.equal(out?.retryAfter, 86400);
  const block = db.calls.find((c) => c.fn === "mod_ip_block_set");
  assert.equal(block?.args.p_until, "2026-10-23T10:00:00.000Z");
  assert.match(String(block?.args.p_ip_hash), /^[0-9a-f]{64}$/);
  const bans = db.calls.filter((c) => c.fn === "mod_sanction_add");
  assert.equal(bans.length, 1);
  assert.equal(bans[0].args.p_kind, "baneo");
  assert.equal(bans[0].args.p_status, "revision_pendiente", "los baneos de 7 días o más los confirma una persona");
  // Nada con la IP en claro: ni en las llamadas ni en los mensajes.
  assert.ok(!JSON.stringify(db.calls).includes("198.51.100.7"));
});

test("enforce: the IP unblocks after 24 h", async () => {
  const start = Date.parse("2026-10-22T10:00:00Z");
  const blockedUntil = new Date(start + 86400_000).toISOString();
  const calm = { hits_minute: 1, hits_hour: 1, distinct_users_hour: 1, user_hits_hour: 1 };
  const during = fakeDb({ ...calm, ip_blocked_until: blockedUntil });
  const stillBlocked = await moderationGate({ rpc: during.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now: start + 86400_000 - 60_000, log });
  assert.equal(stillBlocked?.code, "mod_ip_blocked");
  assert.equal(stillBlocked?.retryAfter, 60);
  const after = fakeDb({ ...calm, ip_blocked_until: blockedUntil });
  assert.equal(await moderationGate({ rpc: after.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now: start + 86400_000 + 1000, log }), null);
});

test("enforce: the school scenario produces no IP block, no sanction and no ban", async () => {
  const db = fakeDb(school);
  assert.equal(await moderationGate({ rpc: db.rpc, headers: ROUTED, userId: USER, ageBand: "14_17", env: ENV, log }), null);
  assert.deepEqual(db.calls.map((c) => c.fn), ["mod_ip_check"]);
});

test("enforce: in a school the one account that hammers gets a 1 h limit; a repeat gets 24 h; a third time proposes a ban", async () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  const heavy = { ...school, user_hits_hour: 120 };
  const first = fakeDb(heavy, 0);
  const a = await moderationGate({ rpc: first.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now, log });
  assert.equal(a?.code, "mod_user_limited");
  assert.equal(first.calls.find((c) => c.fn === "mod_sanction_add")?.args.p_until, "2026-10-22T11:00:00.000Z");
  assert.ok(!first.calls.some((c) => c.fn === "mod_ip_block_set"));
  const second = fakeDb(heavy, 1);
  await moderationGate({ rpc: second.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now, log });
  assert.equal(second.calls.find((c) => c.fn === "mod_sanction_add")?.args.p_until, "2026-10-23T10:00:00.000Z");
  const third = fakeDb(heavy, 2);
  await moderationGate({ rpc: third.rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, now, log });
  const adds = third.calls.filter((c) => c.fn === "mod_sanction_add");
  assert.deepEqual(adds.map((c) => [c.args.p_kind, c.args.p_status]), [["limitacion", "activa"], ["baneo", "revision_pendiente"]]);
});

test("a spoofed-header request does not touch another person's IP", async () => {
  const db = fakeDb(burst);
  const spoofed = h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.99" });
  await moderationGate({ rpc: db.rpc, headers: spoofed, userId: USER, ageBand: "18_plus", env: ENV, log });
  const sent = new Set(db.calls.filter((c) => c.args.p_ip_hash).map((c) => c.args.p_ip_hash));
  assert.deepEqual([...sent], [await ipFingerprint("198.51.100.7", PEPPER)]);
  assert.ok(!sent.has(await ipFingerprint("203.0.113.99", PEPPER)));
});

test("it fails open: no trusted IP, no secret or a database error never block a student", async () => {
  const none = fakeDb(burst);
  assert.equal(await moderationGate({ rpc: none.rpc, headers: h({ "x-forwarded-for": "203.0.113.99" }), userId: USER, ageBand: null, env: ENV, log }), null);
  assert.equal(none.calls.length, 0);
  assert.equal(await moderationGate({ rpc: none.rpc, headers: ROUTED, userId: USER, ageBand: null, env: { MOD_MODE: "enforce" }, log }), null);
  const broken = async () => {
    throw new Error("db down");
  };
  assert.equal(await moderationGate({ rpc: broken, headers: ROUTED, userId: USER, ageBand: null, env: ENV, log }), null);
});

test("the gate runs only for actions that consume AI, never for login, legal pages or appeals", () => {
  const api = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  assert.match(api, /if \(consuming\) \{\s*const limited = await moderationGate/);
  assert.ok(THRESHOLDS.ipBlockMs === 86400_000);
  const admission = readFileSync("supabase/functions/dream-api/admission.mjs", "utf8");
  assert.ok(!/reclam|appeal|login/i.test(admission.slice(admission.indexOf("consumingActions"), admission.indexOf("]);"))));
});

// ── B3: cuentas nuevas desde la IP de una cuenta baneada ─────────────────────

function entryDb(observation: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return fn === "mod_entry" ? observation : null;
  };
  return { calls, rpc };
}
const NOW = Date.parse("2026-10-24T12:00:00Z");
const due = { id: "obs-1", status: "observando", shared: false, entries: 5, ends_at: "2026-10-24T11:00:00Z" };
const notDue = { ...due, ends_at: "2026-10-25T11:00:00Z" };

test("B3 is off with MOD_MODE off and only records in observe mode", async () => {
  const off = entryDb(due);
  await moderationEntry({ rpc: off.rpc, headers: ROUTED, userId: USER, env: { ...ENV, MOD_MODE: "off" }, now: NOW, log });
  assert.equal(off.calls.length, 0);
  const observe = entryDb(due);
  await moderationEntry({ rpc: observe.rpc, headers: ROUTED, userId: USER, env: { ...ENV, MOD_MODE: "observe", MOD_AUTO_BAN_ENABLED: "true" }, now: NOW, log });
  assert.deepEqual(observe.calls.map((c) => c.fn), ["mod_entry"], "observe nunca resuelve ni banea");
});

test("the automatic ban switch is off by default and needs enforce plus an explicit 'true'", async () => {
  assert.equal(autoBanEnabled({ MOD_MODE: "enforce" }), false);
  assert.equal(autoBanEnabled({ MOD_MODE: "enforce", MOD_AUTO_BAN_ENABLED: "false" }), false);
  assert.equal(autoBanEnabled({ MOD_MODE: "enforce", MOD_AUTO_BAN_ENABLED: "1" }), false);
  assert.equal(autoBanEnabled({ MOD_MODE: "observe", MOD_AUTO_BAN_ENABLED: "true" }), false);
  assert.equal(autoBanEnabled({ MOD_MODE: "enforce", MOD_AUTO_BAN_ENABLED: "true" }), true);
  const proposeOnly = entryDb(due);
  await moderationEntry({ rpc: proposeOnly.rpc, headers: ROUTED, userId: USER, env: ENV, now: NOW, log });
  assert.equal(proposeOnly.calls[1].fn, "mod_observation_resolve");
  assert.equal(proposeOnly.calls[1].args.p_auto, false, "sin el interruptor solo propone");
  const auto = entryDb(due);
  await moderationEntry({ rpc: auto.rpc, headers: ROUTED, userId: USER, env: { ...ENV, MOD_AUTO_BAN_ENABLED: "true" }, now: NOW, log });
  assert.equal(auto.calls[1].args.p_auto, true);
  assert.equal(auto.calls[1].args.p_home_max, THRESHOLDS.homeMaxAccounts);
});

test("the observation is only resolved after its 2 days, and only when it is still 'observando'", async () => {
  const early = entryDb(notDue);
  await moderationEntry({ rpc: early.rpc, headers: ROUTED, userId: USER, env: ENV, now: NOW, log });
  assert.deepEqual(early.calls.map((c) => c.fn), ["mod_entry"]);
  const school = entryDb({ ...due, status: "revision_pendiente", shared: true });
  await moderationEntry({ rpc: school.rpc, headers: ROUTED, userId: USER, env: { ...ENV, MOD_AUTO_BAN_ENABLED: "true" }, now: NOW, log });
  assert.deepEqual(school.calls.map((c) => c.fn), ["mod_entry"], "la red compartida va al panel, no se resuelve sola");
  const none = entryDb(null);
  await moderationEntry({ rpc: none.rpc, headers: ROUTED, userId: USER, env: ENV, now: NOW, log });
  assert.deepEqual(none.calls.map((c) => c.fn), ["mod_entry"]);
  assert.equal(THRESHOLDS.observationDays, 2);
  assert.equal(THRESHOLDS.homeMaxAccounts, 4);
});

test("the minimum number of entries is configurable but always between 4 and 7", () => {
  assert.equal(minEntriesFrom(undefined), 4);
  assert.equal(minEntriesFrom("1"), 4);
  assert.equal(minEntriesFrom("5"), 5);
  assert.equal(minEntriesFrom("99"), 7);
  assert.equal(minEntriesFrom("abc"), 4);
});

test("B3 sends only IP fingerprints, shows nothing to the student and fails open", async () => {
  const db = entryDb(due);
  const out = await moderationEntry({ rpc: db.rpc, headers: ROUTED, userId: USER, env: ENV, now: NOW, log });
  assert.equal(out, null, "no devuelve nada que el alumno pueda ver");
  assert.ok(!JSON.stringify(db.calls).includes("198.51.100.7"));
  assert.match(String(db.calls[0].args.p_ip_hash), /^[0-9a-f]{64}$/);
  const broken = async () => {
    throw new Error("db down");
  };
  assert.equal(await moderationEntry({ rpc: broken, headers: ROUTED, userId: USER, env: ENV, now: NOW, log }), null);
  assert.equal(await moderationEntry({ rpc: db.rpc, headers: h({ "x-forwarded-for": "203.0.113.99" }), userId: USER, env: ENV, now: NOW, log }), null);
});

// ── Lectura única de la IP en dream-api (docs/ip-real.md) ────────────────────

test("getClientIp is the only IP reader in dream-api and follows MOD_IP_HEADER", () => {
  assert.equal(getClientIp(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.99" })), "198.51.100.7");
  assert.equal(getClientIp(h({ "x-forwarded-for": "203.0.113.99, 192.0.2.50" }), { MOD_IP_HEADER: "x-forwarded-for" }), "192.0.2.50");
  assert.equal(getClientIp(h({ "cf-connecting-ip": "not-an-ip" })), null);
  assert.equal(getClientIp(h({})), null);
  const dir = "supabase/functions/dream-api";
  const reads = /x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip/i;
  const offenders = readdirSync(dir)
    .filter((f) => /\.(ts|mjs|js)$/.test(f) && f !== "moderation.mjs")
    .filter((f) => reads.test(readFileSync(`${dir}/${f}`, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the plain IP never reaches the logs, whatever the outcome", async () => {
  const lines: string[] = [];
  const capture = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  const failing = async () => { throw new Error("db down"); };
  for (const rpc of [fakeDb(burst).rpc, fakeDb(school).rpc, failing]) {
    await moderationGate({ rpc, headers: ROUTED, userId: USER, ageBand: "18_plus", env: ENV, log: capture });
    await moderationEntry({ rpc, headers: ROUTED, userId: USER, env: ENV, log: capture });
  }
  await moderationGate({ rpc: fakeDb(burst).rpc, headers: ROUTED, userId: USER, ageBand: null, env: { MOD_MODE: "enforce" }, log: capture });
  assert.ok(lines.length > 0);
  assert.ok(!lines.join("\n").includes("198.51.100.7"));
});
