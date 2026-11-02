import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getClientIp, inRange, isCloudflareIp, isValidIp } from "../lib/client-ip";
import { ipCheck } from "../lib/ip-check";

const VERCEL = { VERCEL: "1" };
const req = (record: Record<string, string>) => ({ headers: new Headers(record) });

test("only the IP set by Vercel counts; spoofed headers never change it", () => {
  const spoofed = req({
    "x-real-ip": "198.51.100.7",
    "x-forwarded-for": "203.0.113.99, 10.0.0.1",
    "cf-connecting-ip": "203.0.113.99",
    "true-client-ip": "203.0.113.99",
    forwarded: "for=203.0.113.99",
    "x-client-ip": "203.0.113.99",
  });
  assert.equal(getClientIp(spoofed, VERCEL), "198.51.100.7");
  // Sin la cabecera de Vercel no hay IP: ninguna otra la sustituye.
  assert.equal(getClientIp(req({ "cf-connecting-ip": "203.0.113.99", "x-forwarded-for": "203.0.113.99" }), VERCEL), null);
});

test("outside Vercel x-real-ip can be written by anyone: no IP", () => {
  assert.equal(getClientIp(req({ "x-real-ip": "198.51.100.7" }), {}), null);
  assert.equal(getClientIp(req({ "x-real-ip": "198.51.100.7" }), { VERCEL: "0" }), null);
});

test("a Cloudflare address is never taken as the student's IP", () => {
  for (const ip of ["172.68.10.1", "104.23.1.1", "162.159.0.1", "2606:4700::6810:1", "2a06:98c0:3600::103"]) {
    assert.ok(isCloudflareIp(ip), ip);
    assert.equal(getClientIp(req({ "x-real-ip": ip, "cf-connecting-ip": "203.0.113.99" }), VERCEL), null, ip);
  }
  for (const ip of ["198.51.100.7", "8.8.8.8", "2001:db8::1", "172.63.255.255", "172.72.0.0"]) assert.equal(isCloudflareIp(ip), false, ip);
});

test("null, empty or invalid values do not crash and give no IP", () => {
  for (const bad of ["", " ", "unknown", "999.1.1.1", "1.2.3", "1.2.3.4, 5.6.7.8", "01.2.3.4", "<script>", "a".repeat(200), "::g", "1::2::3", "[::1]"]) {
    assert.equal(isValidIp(bad), false, bad);
    assert.equal(getClientIp(req({ "x-real-ip": bad }), VERCEL), null, bad);
  }
  assert.equal(getClientIp(req({}), VERCEL), null);
  assert.equal(getClientIp(req({ "x-real-ip": "2001:db8::1" }), VERCEL), "2001:db8::1");
  assert.equal(inRange("not-an-ip", "104.16.0.0/13"), false);
});

test("the diagnostic answers yes/no and never contains an IP", () => {
  const out = JSON.stringify(ipCheck(new Headers({ "x-real-ip": "198.51.100.7", "cf-connecting-ip": "198.51.100.7", "cf-ray": "x" }), VERCEL));
  assert.equal(out.includes("198.51.100.7"), false);
  assert.deepEqual(JSON.parse(out), {
    pasa_por_cloudflare: true, en_vercel: true, ip_de_vercel: "del_visitante", coincide_con_cloudflare: true, ip_usable: true,
  });
  assert.equal(ipCheck(new Headers({ "x-real-ip": "172.68.10.1", "cf-connecting-ip": "198.51.100.7" }), VERCEL).ip_de_vercel, "de_cloudflare");
});

test("nothing logs an IP: getClientIp and the diagnostic are silent", () => {
  const seen: string[] = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(keep) as (keyof typeof keep)[]) console[k] = (...a: unknown[]) => void seen.push(a.join(" "));
  try {
    getClientIp(req({ "x-real-ip": "198.51.100.7" }), VERCEL);
    ipCheck(new Headers({ "x-real-ip": "198.51.100.7" }), VERCEL);
  } finally {
    Object.assign(console, keep);
  }
  assert.equal(seen.join("\n").includes("198.51.100.7"), false);
});

// Ninguna otra parte de la web lee cabeceras de IP: todo pasa por lib/client-ip.ts.
test("no other web code reads IP headers", () => {
  const roots = ["app", "components", "lib", "middleware.ts"];
  const allowed = new Set(["lib/client-ip.ts", "lib/ip-check.ts"]);
  const files: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
    else if (/\.(ts|tsx|js|mjs)$/.test(p)) files.push(p);
  };
  roots.forEach(walk);
  const reads = /x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip|x-vercel-forwarded-for|request\.ip\b|ipAddress\(/i;
  const offenders = files.filter((f) => !allowed.has(f.replace(/\\/g, "/")) && reads.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
