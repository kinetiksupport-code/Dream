// Ruta «tipo Knowunity» (prompt de la ruta, 0.11 y 0.13): orden del test de la
// lección y cuándo sale el pop-up «Estudia mejor tus exámenes…».
import test from "node:test";
import assert from "node:assert/strict";
import { mixItems } from "../lib/lesson-items";
import { shouldPrompt } from "../lib/route-prompt";

const q = (index: number) => ({ index, type: "mcq" as const, prompt: `P${index}`, options: ["a", "b"] });

test("las V/F de las tarjetas van mezcladas entre las preguntas, no todas al principio", () => {
  const items = mixItems(2, [q(0), q(1), q(2)]);
  assert.equal(items.length, 5);
  assert.deepEqual(items.map((i) => (i.kind === "check" ? `c${i.section}` : `q${i.q.index}`)), ["q0", "c0", "q1", "c1", "q2"]);
  assert.equal(mixItems(0, [q(0)]).length, 1, "«Ya me sé este tema»: sin V/F");
  assert.notEqual(mixItems(3, [q(0), q(1), q(2), q(3), q(4), q(5), q(6)])[0].kind, "check");
});

const DAY = 24 * 3600 * 1000;
const exam = { id: "e1", status: "ready" as const, route: null, exam_date: "2026-12-01", materials: [{ id: "m" }] } as never;
const on = { flags: true, sessionShown: false };

test("pop-up: sale tras crear un examen sin ruta; no con ruta, flag apagado, sin apuntes o sin fecha", () => {
  assert.equal(shouldPrompt(exam, {}, 0, on), true);
  assert.equal(shouldPrompt({ ...(exam as object), route: { nodes: [] } } as never, {}, 0, on), false);
  assert.equal(shouldPrompt(exam, {}, 0, { flags: false, sessionShown: false }), false);
  assert.equal(shouldPrompt({ ...(exam as object), materials: [] } as never, {}, 0, on), false);
  assert.equal(shouldPrompt({ ...(exam as object), exam_date: null } as never, {}, 0, on), false);
  assert.equal(shouldPrompt({ ...(exam as object), status: "preparing" } as never, {}, 0, on), false);
});

test("pop-up: una vez por sesión; «Ahora no» lo oculta 7 días y luego solo sale una vez más", () => {
  assert.equal(shouldPrompt(exam, {}, 0, { flags: true, sessionShown: true }), false);
  assert.equal(shouldPrompt(exam, null, 0, on), false, "sin almacenamiento, no sale");
  const seen = { e1: { n: 1, at: 0, off: 0 } };
  assert.equal(shouldPrompt(exam, seen, 6 * DAY, on), false);
  assert.equal(shouldPrompt(exam, seen, 7 * DAY, on), true);
  assert.equal(shouldPrompt(exam, { e1: { n: 1, at: 0 } }, 30 * DAY, on), false, "lo vio y no lo cerró: no se repite");
  assert.equal(shouldPrompt(exam, { e1: { n: 2, at: 0, off: 0 } }, 30 * DAY, on), false);
});
