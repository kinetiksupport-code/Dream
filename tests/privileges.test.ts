import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migration = "supabase/migrations/20261009213034_lock_client_table_privileges.sql";
const sql = readFileSync(migration, "utf8");
const files = readdirSync("supabase/migrations");

test("privilege migration uses the production history version", () => {
  assert.equal(files.filter((name) => name.includes("lock_client_table_privileges")).length, 1);
  assert.ok(files.includes("20261009213034_lock_client_table_privileges.sql"));
  assert.equal(files.includes("20261009233000_lock_client_table_privileges.sql"), false);
});

test("authenticated profile update excludes protected columns", () => {
  const grant = sql.slice(sql.toLowerCase().lastIndexOf("grant update"));
  for (const column of [
    "display_name",
    "avatar_url",
    "academic_level",
    "pref_step_by_step",
    "pref_practice_suggestions",
    "pref_calm_tone",
  ]) {
    assert.match(grant, new RegExp(`\\b${column}\\b`));
  }
  for (const column of [
    "role",
    "email",
    "email_domain",
    "age_band",
    "education_mode",
    "birth_date",
    "updated_at",
    "onboarding_completed",
    "guardian_required",
    "guardian_confirmed_at",
  ]) {
    assert.doesNotMatch(grant, new RegExp(`\\b${column}\\b`));
  }
  assert.match(sql, /revoke update on table public\.dream_profiles from authenticated;/);
  assert.match(sql, /revoke all on table public\.dream_teacher_invites from anon;/);
});
