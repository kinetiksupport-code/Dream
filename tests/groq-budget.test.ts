// El mensaje cabe en el límite de Groq (413 del 3-nov-2026).
import test from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, fitGroqBudget, GROQ_SAFE_LIMIT, MIN_ANSWER } from "../supabase/functions/dream-api/groq-budget.mjs";

const sys = (n: number) => ({ role: "system", content: "r".repeat(n) });
const material = (n: number) => ({ role: "system", content: "Contexto de archivos adjuntos:\n" + "a".repeat(n) });
const turn = (n: number) => [{ role: "user", content: "p".repeat(n) }, { role: "assistant", content: "q".repeat(n) }];
const tail = [{ role: "system", content: "estilo" }, { role: "user", content: "¿Y esto?" }];

test("si ya cabe, no se toca nada", () => {
  const r = fitGroqBudget({ system: [sys(7000)], history: turn(200), tail, maxTokens: 800 });
  assert.equal(r.fits, true);
  assert.deepEqual(r.trimmed, { history: 0, materialChars: 0, answer: 0 });
  assert.equal(r.maxTokens, 800);
});

test("el caso del 3-nov: reglas + apuntes + historial pasan de 8.000 → cabe recortando lo justo", () => {
  // ~6.666 tokens de reglas, ~1.409 de apuntes, historial corto, 800 de respuesta.
  const system = [sys(6666 * 3.5), material(1409 * 3.5)];
  const r = fitGroqBudget({ system, history: [...turn(240), ...turn(240)], tail, maxTokens: 800 });
  assert.equal(r.fits, true);
  assert.ok(estimateTokens(r.messages) + r.maxTokens <= GROQ_SAFE_LIMIT);
  // Las reglas y el mensaje del alumno quedan intactos.
  assert.equal(r.messages[0].content.length, 6666 * 3.5);
  assert.equal(r.messages.at(-1)!.content, "¿Y esto?");
  // Primero el historial antiguo (queda el último intercambio), luego los apuntes, con aviso.
  assert.equal(r.trimmed.history, 2);
  assert.ok(r.trimmed.materialChars > 0);
  assert.match(r.messages[1].content, /apuntes recortados/);
  assert.ok(r.maxTokens >= MIN_ANSWER);
});

test("sin apuntes: se acorta la respuesta, nunca por debajo del mínimo; si no cabe, lo dice", () => {
  const r = fitGroqBudget({ system: [sys(7300 * 3.5)], history: [], tail, maxTokens: 800 });
  assert.ok(r.maxTokens < 800 && r.maxTokens >= MIN_ANSWER);
  const huge = fitGroqBudget({ system: [sys(9000 * 3.5)], history: [], tail, maxTokens: 800 });
  assert.equal(huge.fits, false);
  assert.equal(huge.maxTokens, MIN_ANSWER);
});
