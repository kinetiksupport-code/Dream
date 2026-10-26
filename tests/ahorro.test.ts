import test from "node:test";
import assert from "node:assert/strict";
import { RULES_REMINDER, fixedAnswer, needsReminder, olderSummary } from "../supabase/functions/dream-api/chat-helpers.mjs";
import { visibleWords } from "../supabase/functions/dream-api/sources.mjs";
import { openrouterBody, OPENROUTER_MODEL } from "../supabase/functions/dream-api/openrouter.mjs";
import { AI_FLAGS } from "../supabase/functions/dream-api/models.mjs";
import { EXPORT_TABLES } from "../supabase/functions/dream-api/data-export.mjs";
import pau from "../evals/pau.json" with { type: "json" };

test("fixed answers only for plain questions about using Dream", () => {
  for (const q of ["¿dónde subo mis apuntes?", "¿es gratis?", "cómo borro mi historial", "cómo cambio mi apodo", "cómo hago un examen de prueba"])
    assert.ok(fixedAnswer(q), q);
  for (const q of ["resuelve 2x+3=7", "explícame dónde subo apuntes y luego las derivadas", "cómo se calcula el área del círculo", "¿qué es la fotosíntesis?", ""])
    assert.equal(fixedAnswer(q), null, q);
  // A feature behind a switch that is off is never described.
  assert.equal(fixedAnswer("¿dónde subo mis apuntes?", {}), fixedAnswer("¿dónde subo mis apuntes?"));
});

test("older messages become a short summary without the AI; reminder every 5 turns from the 10th", () => {
  const older = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `pregunta ${i} `.repeat(20) }));
  const s = olderSummary(older);
  assert.match(s, /^Antes, en esta misma conversación/);
  assert.ok(s.length <= 520, `${s.length}`);
  assert.doesNotMatch(s, /respuesta/);
  assert.equal(olderSummary([]), "");
  assert.deepEqual([9, 10, 11, 15, 20].map(needsReminder), [false, true, false, true, true]);
  assert.match(RULES_REMINDER, /un paso por mensaje/);
});

test("the switches that need the evals stay off; OpenRouter only free and without data collection", () => {
  assert.deepEqual(
    [AI_FLAGS.mathCheck, AI_FLAGS.shortRetry, AI_FLAGS.claimCheck, AI_FLAGS.openrouterFallback],
    [false, false, false, false],
  );
  const body = openrouterBody({ model: "x", reasoning_format: "hidden", messages: [] });
  assert.equal(body.model, OPENROUTER_MODEL);
  assert.match(OPENROUTER_MODEL, /:free$/);
  assert.equal(body.provider.data_collection, "deny");
  assert.equal("reasoning_format" in body, false);
  assert.equal(visibleWords("uno dos <!--DREAM_SOURCES:[]--> tres"), 3);
});

test("data export covers memory and summaries; PAU bank has 30 questions", () => {
  const tables = EXPORT_TABLES.map(([t]) => t);
  for (const t of ["dream_messages", "dream_memories", "dream_conversation_summaries", "dream_exams"]) assert.ok(tables.includes(t), t);
  assert.equal(pau.cases.length, 30);
});
