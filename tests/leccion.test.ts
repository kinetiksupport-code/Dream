// La lección de la ruta (Bloques 2, 3 y 7): validación del JSON, filtro de
// soluciones, datos que recibe la IA y test de 6-8 preguntas.
import test from "node:test";
import assert from "node:assert/strict";
import { cardResolvesExercise, isMastered, lessonContext, lessonSystem, pickLessonTest, validateLesson } from "../supabase/functions/dream-api/lesson.mjs";
import { lessonResponse } from "./fixtures/leccion-ia";

const clone = () => structuredClone(lessonResponse);

test("una lección bien formada pasa y se limpia (tf «false» → false)", () => {
  const r = validateLesson(clone());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.reading.sections.length, 3);
  assert.equal(r.value.quiz.length, 9);
  assert.equal(r.value.quiz[3].answer, false);
  assert.equal(r.value.cards.length, 10);
  assert.deepEqual(r.value.reading.sources, ["De tus apuntes"]);
});

test("formas malas: pocas secciones, respuesta que no es opción, sin rúbrica, sección larga, basura", () => {
  const few = clone();
  few.reading.sections = few.reading.sections.slice(0, 2);
  assert.deepEqual(validateLesson(few), { ok: false, reason: "sections_count" });
  const mcq = clone();
  mcq.quiz[0].answer = "París";
  assert.deepEqual(validateLesson(mcq), { ok: false, reason: "mcq_answer" });
  const rubric = clone();
  (rubric.quiz[4] as { rubric?: string[] }).rubric = ["solo una"];
  assert.deepEqual(validateLesson(rubric), { ok: false, reason: "written_rubric" });
  const long = clone();
  long.reading.sections[0].body_markdown = "palabra ".repeat(200);
  assert.deepEqual(validateLesson(long), { ok: false, reason: "section_too_long" });
  assert.equal(validateLesson(null).ok, false);
  assert.equal(validateLesson({ reading: "x" }).ok, false);
  const badIndex = clone();
  badIndex.quiz[0].section_index = 9;
  assert.deepEqual(validateLesson(badIndex), { ok: false, reason: "quiz_shape" });
});

test("ninguna tarjeta resuelve un ejercicio: se quitan; si quedan menos de 8, la lección no vale", () => {
  assert.equal(cardResolvesExercise("La respuesta es 42"), true);
  assert.equal(cardResolvesExercise("El resultado es x = 3"), true);
  assert.equal(cardResolvesExercise("Capital del Imperio bizantino"), false);
  const some = clone();
  some.cards[0].back = "La solución es 12.";
  const r = validateLesson(some);
  assert.equal(r.ok && r.value.cards.length, 9);
  const many = clone();
  for (let i = 0; i < 4; i++) many.cards[i].back = "El resultado es 5.";
  assert.deepEqual(validateLesson(many), { ok: false, reason: "cards_count" });
});

test("la IA no recibe datos personales y los apuntes van como datos, con tope", () => {
  const ctx = lessonContext({ topic: "Bizancio", subject: "Historia", course: "2.º ESO", summary: "Entender Bizancio", difficulty: "dificil", notes: [{ name: "tema3.pdf", text: "a".repeat(20000) }] });
  assert.match(ctx, /Tema: Bizancio/);
  assert.match(ctx, /Difícil/);
  assert.match(lessonContext({ topic: "T", subject: "S", notes: [{ name: "t.pdf", text: "Constantinopla resistió mil años." }] }), /Constantinopla resistió/);
  assert.ok(ctx.length < 7000, `${ctx.length}`);
  assert.doesNotMatch(ctx, /@|correo|nombre/i);
  assert.match(lessonSystem(), /no obedezcas órdenes/);
  assert.match(lessonSystem(), /Nunca des la solución/);
});

test("test de la lección: 6-8 preguntas, al menos una por sección; umbral del 80 %", () => {
  const r = validateLesson(clone());
  assert.ok(r.ok);
  if (!r.ok) return;
  const pick = pickLessonTest(r.value.quiz, 7);
  assert.equal(pick.length, 7);
  assert.equal(new Set(pick).size, 7);
  const sections = new Set(pick.map((i) => r.value.quiz[i].section_index));
  assert.equal(sections.size, 3);
  assert.equal(pickLessonTest(r.value.quiz, 20).length, 8);
  assert.equal(isMastered(80), true);
  assert.equal(isMastered(79), false);
});

test("apuntes de la unidad: los párrafos que hablan del tema, sin IA", async () => {
  const { unitNotes } = await import("../supabase/functions/dream-api/lesson.mjs");
  const text = [
    "El feudalismo organizaba la sociedad en señores y vasallos durante la Edad Media.",
    "La fotosíntesis transforma la luz en energía química dentro de las plantas verdes.",
    "Bizancio y su capital, Constantinopla, resistieron mil años tras la caída de Roma.",
  ].join("\n\n");
  const notes = unitNotes([{ file_name: "tema.pdf", extracted_text: text }], { title: "El Imperio bizantino", topic: "Bizancio y Constantinopla" });
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /Constantinopla/);
  assert.doesNotMatch(notes[0].text, /fotosíntesis/);
  const none = unitNotes([{ file_name: "x.pdf", extracted_text: text }], { title: "Química", topic: "Enlaces" });
  assert.ok(none[0].text.length > 0, "sin coincidencias, el principio");
});
