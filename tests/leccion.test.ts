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

test("corrección en código: test, V/F y escrita por ideas de la rúbrica; tarjeta del fallo", async () => {
  const { gradeQuestion, publicQuestion, mistakeCard } = await import("../supabase/functions/dream-api/lesson.mjs");
  const mcq = { type: "mcq" as const, prompt: "¿Capital?", options: ["Roma", "Constantinopla"], answer: "Constantinopla", explanation: "Sección 1.", section_index: 0, difficulty: "medio" };
  assert.equal(gradeQuestion(mcq, "Constantinopla").correct, true);
  assert.equal(gradeQuestion(mcq, "Roma").correct, false);
  assert.deepEqual(Object.keys(publicQuestion(mcq, 3)).sort(), ["index", "options", "prompt", "type"]);
  const tf = { type: "tf" as const, prompt: "Cayó en 1453.", answer: true, explanation: "", section_index: 0, difficulty: "medio" };
  assert.equal(gradeQuestion(tf, true).correct, true);
  assert.equal(gradeQuestion(tf, "true").correct, false, "solo booleanos");
  const written = { type: "written" as const, prompt: "¿Por qué 1453?", answer: "x", rubric: ["Toma de Constantinopla por los otomanos", "Fin de la Edad Media"], explanation: "", section_index: 0, difficulty: "medio" };
  assert.equal(gradeQuestion(written, "Los otomanos tomaron Constantinopla y acabó la Edad Media").correct, true);
  assert.equal(gradeQuestion(written, "No lo sé").correct, false);
  assert.equal(mistakeCard(tf).back, "Verdadero");
  assert.ok(mistakeCard({ ...mcq, prompt: "p".repeat(400) }).front.length <= 300);
});

test("preguntas numéricas (matemáticas): coma o punto, redondeo pequeño, unidad en la corrección", async () => {
  const { gradeQuestion, validateLesson: v, publicQuestion } = await import("../supabase/functions/dream-api/lesson.mjs");
  const q = { type: "numeric", prompt: "Área de un círculo de radio 2 (2 decimales)", answer: 12.57, unit: "cm²", explanation: "π·r²", section_index: 0, difficulty: "medio" } as never;
  assert.equal(gradeQuestion(q, "12,57").correct, true);
  assert.equal(gradeQuestion(q, "12.566").correct, true);
  assert.equal(gradeQuestion(q, " 12,57 cm² ").correct, true);
  assert.equal(gradeQuestion(q, "12,9").correct, false);
  assert.equal(gradeQuestion(q, "").correct, false);
  assert.equal(gradeQuestion(q, "x").correct, false);
  assert.equal(gradeQuestion(q, "1").correct_answer, "12,57 cm²");
  assert.deepEqual(publicQuestion(q, 3), { index: 3, type: "numeric", prompt: "Área de un círculo de radio 2 (2 decimales)", unit: "cm²" });
  const lesson = clone();
  (lesson.quiz as unknown[])[0] = { type: "numeric", prompt: "2+2", answer: "4", explanation: "Suma.", section_index: 0, difficulty: "facil" };
  const r = v(lesson);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.quiz[0].answer, 4);
  (lesson.quiz as unknown[])[0] = { type: "numeric", prompt: "2+2", answer: "cuatro", explanation: "", section_index: 0 };
  assert.deepEqual(v(lesson), { ok: false, reason: "numeric_answer" });
});

test("la instrucción pide variedad, distractores creíbles, pocas negativas y ejemplo resuelto en mates", () => {
  const sys = lessonSystem();
  assert.match(sys, /errores típicos/);
  assert.match(sys, /como mucho UNA pregunta en negativo/);
  assert.match(sys, /nunca «todas las anteriores»/);
  assert.match(sys, /ejemplo resuelto paso a paso/);
  assert.match(sys, /numeric/);
});
