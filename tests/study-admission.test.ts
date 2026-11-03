// La ruta de estudio pide permiso (lease) antes de llamar a la IA: sin él,
// dream_reserve devolvía 503 «lease_expired» y la lección fallaba al momento.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("las acciones de la ruta usan una IA que admite antes de la primera llamada", () => {
  const src = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  const branch = src.slice(src.indexOf("if (STUDY_ACTIONS.has(String(body.action)))"), src.indexOf("if (body.action === 'exams'"));
  assert.match(branch, /const studyAI = async[\s\S]*?await admission\.admit\('test_check_answer'\); admitted = true;[\s\S]*?return jsonAI\(/);
  assert.match(branch, /studyAction\(admin, user\.id, body, studyAI,/);
  assert.doesNotMatch(branch, /studyAction\(admin, user\.id, body, jsonAI,/);
});
