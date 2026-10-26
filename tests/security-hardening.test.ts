import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAdmission, MAX_PROVIDER_PAUSE_SECONDS } from "../supabase/functions/dream-api/admission.mjs";

// Endurecimiento de la auditoría del 21/10/2026.
const api = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
const exams = readFileSync("supabase/functions/dream-api/exams.ts", "utf8");

test("a provider pause is capped at one day", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: { ok: true }, error: null }) };
  const admission = createAdmission(db as never, "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002");
  await admission.pause("groq", 2147483647);
  const pause = calls.find((c) => c.fn === "dream_provider_pause");
  assert.equal(pause?.args.p_seconds, MAX_PROVIDER_PAUSE_SECONDS);
  assert.equal(MAX_PROVIDER_PAUSE_SECONDS, 86400);
});

test("maintenance is enforced inside dream-api for bearer and QR channels", () => {
  assert.match(api, /DREAM_MAINTENANCE_MODE/);
  const qr = api.slice(api.indexOf("async function handleQr"));
  assert.match(qr.slice(0, 200), /maintenanceOn\(\)\) return maintenanceResponse\(\)/);
  assert.match(api, /if \(maintenanceOn\(\) && !maintenanceAllows\(user\)\) return maintenanceResponse\(\);/);
  assert.match(api, /email_confirmed_at/);
});

test("conversations and exams have a per-owner row cap", () => {
  assert.match(api, /MAX_CONVERSATIONS_PER_OWNER/);
  assert.match(api, /count \?\? 0\) >= MAX_CONVERSATIONS_PER_OWNER/);
  assert.match(exams, /MAX_EXAMS_PER_OWNER=200/);
  assert.match(exams, /count\?\?0\)>=MAX_EXAMS_PER_OWNER/);
});

test("take_budget_lock pins its search_path", () => {
  const m = readFileSync("supabase/migrations/20261021100000_budget_lock_search_path.sql", "utf8");
  assert.match(m, /set search_path = ''/);
});
