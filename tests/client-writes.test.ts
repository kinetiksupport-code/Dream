import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const file = "supabase/migrations/20261009220000_revoke_client_direct_writes.sql";
const sql = readFileSync(file, "utf8").toLowerCase();

const executable = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

test("direct-write migration has a unique version and does not change service_role", () => {
  const names = readdirSync("supabase/migrations");
  assert.equal(names.filter((name) => name.startsWith("20261009220000")).length, 1);
  assert.match(executable, /revoke insert, update, delete on table public\.dream_conversations from authenticated;/);
  assert.match(executable, /revoke update on table public\.dream_user_settings from authenticated;/);
  assert.doesNotMatch(executable, /service_role/);
  assert.doesNotMatch(executable, /grant /);
  assert.doesNotMatch(executable, /dream_profiles/);
});

test("static grant review does not claim an authenticated session", () => {
  assert.match(readFileSync(file, "utf8"), /Not applied to production/);
});
