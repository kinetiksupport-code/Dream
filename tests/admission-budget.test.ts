import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateTokens, estimateRequest } from "../supabase/functions/dream-api/admission.mjs";

const sql = readFileSync("supabase/migrations/20261010120000_admission_pricing_reconcile.sql", "utf8");

test("token estimate is at least the UTF-8 size and is not treated as exact", () => {
  const value = "áéíóú";
  assert.ok(estimateTokens(value) >= new TextEncoder().encode(value).length);
  const request = estimateRequest("groq", { messages: [{ content: "hola" }], max_tokens: 10 });
  assert.equal(request.output, 10);
  assert.equal(request.model, "qwen/qwen3.8-27b");
});

test("admission SQL reserves per attempt, reconciles once and fails closed", () => {
  assert.match(sql, /attempt_id uuid primary key/);
  assert.match(sql, /model_unpriced/);
  assert.match(sql, /if a.status = 'reconciled'/);
  assert.match(sql, /unreconciled/);
  assert.match(sql, /revoke insert, update, delete on table public.dream_conversations/);
  assert.match(sql, /qwen\/qwen3\.8-27b', 800000, 4000000/);
  assert.doesNotMatch(sql, /enabled\s*=\s*true/);
});
