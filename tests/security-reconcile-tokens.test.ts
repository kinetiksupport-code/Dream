import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SEC-05 parte 2 (auditoría del 21/10/2026): dream_reconcile ajustaba el coste
// pero no los tokens, y el cupo global se llenaba con la estimación por bytes.
const m = readFileSync("supabase/migrations/20261021110000_reconcile_tokens.sql", "utf8");

test("reconcile corrects the daily token counters with real usage", () => {
  assert.match(m, /token_delta := greatest\(0, p_input\) \+ greatest\(0, p_output\) - a\.reserved_tokens;/);
  assert.match(m, /tokens = greatest\(0, tokens \+ token_delta\)/);
  assert.match(m, /scope in \('global', p_owner::text\)/);
});

test("reconcile stays service_role only", () => {
  assert.match(m, /revoke all on function public\.dream_reconcile\(uuid, uuid, integer, integer\) from public, anon, authenticated;/);
  assert.match(m, /grant execute on function public\.dream_reconcile\(uuid, uuid, integer, integer\) to service_role;/);
  assert.match(m, /security definer set search_path = ''/);
});
