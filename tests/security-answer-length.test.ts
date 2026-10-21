import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SEC-05 (auditoría del 21/10/2026): una respuesta de test va entera al modelo
// y la admisión reserva sus tokens aunque el proveedor la rechace. Sin tope,
// dos peticiones llenaban el cupo diario de una cuenta.
const api = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
const ui = readFileSync("components/test-experience.tsx", "utf8");
const limit = (src: string) => Number(src.match(/const MAX_ANSWER_CHARS = (\d+);/)?.[1]);
const block = (name: string) => {
  const start = api.indexOf(`body.action === '${name}'`);
  return api.slice(start, api.indexOf("jsonAI(", start));
};

test("test answers are capped before any model call", () => {
  assert.ok(limit(api) > 0 && limit(api) <= 4000);
  assert.match(block("test_check_answer"), /answerTooLong\(body\.answer\)\) return json\(\{[^}]*\}, 413\)/);
  assert.match(block("test_submit"), /body\.answers\.some\(\(a: any\) => answerTooLong\(a\?\.answer\)\)/);
});

test("the answer boxes stop at the same length as the server", () => {
  assert.equal(limit(ui), limit(api));
  assert.equal(ui.match(/maxLength=\{MAX_ANSWER_CHARS\}/g)?.length, 2);
});
