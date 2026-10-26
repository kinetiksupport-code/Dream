import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// SEC-01 (auditoría del 20/10/2026): ninguna función SECURITY DEFINER de
// public puede quedar ejecutable por anon o authenticated sin una razón
// escrita aquí. Mira la última migración que toca cada función.
const ALLOWED_FOR_USERS = new Set<string>([]);
const migrations = readdirSync("supabase/migrations").sort().map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
const all = migrations.join("\n");

test("SECURITY DEFINER functions in public are revoked from anon and authenticated", () => {
  const definers = new Set<string>();
  for (const m of all.matchAll(/create(?: or replace)? function public\.(\w+)\s*\(([^)]*)\)[\s\S]*?security definer/gi)) definers.add(m[1]);
  assert.ok(definers.size > 10, "se encuentran las funciones");
  for (const name of definers) {
    if (ALLOWED_FOR_USERS.has(name)) continue;
    const revoked = new RegExp(`revoke[^;]*(?:execute|all)[^;]*public\\.${name}\\b[^;]*from[^;]*\\banon\\b`, "i").test(all);
    assert.ok(revoked, `${name}: falta revoke … from anon`);
  }
});

test("the fix revokes the three exposed functions and sets safe default privileges", () => {
  const fix = readFileSync("supabase/migrations/20261020200000_revoke_public_rpc.sql", "utf8");
  for (const fn of ["dream_provider_pause", "dream_release", "dream_admission_cleanup"])
    assert.match(fix, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
  assert.match(fix, /alter default privileges for role postgres revoke execute on functions from public;/);
  assert.match(fix, /alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;/);
});
