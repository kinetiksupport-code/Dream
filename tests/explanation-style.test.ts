// Formato de las explicaciones (prompt «explicar bien», Parte A) y evals fijos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPLANATION_STYLE,
  cleanWhyWrong,
  explanationProblems,
  explanationWords,
  interestsLine,
  tidyExplanation,
} from "../supabase/functions/dream-api/explanation-style.mjs";
import { gradeQuestion, lessonContext, lessonSystem, validateLesson } from "../supabase/functions/dream-api/lesson.mjs";
import { SOLUTION_MAX, gradingSystem, mockQuestionsSystem, validateGrading, validateMockQuestions } from "../supabase/functions/dream-api/mock.mjs";
import { caseProblems } from "../evals/explicaciones.mjs";

const evals = JSON.parse(readFileSync(new URL("../evals/explicaciones.json", import.meta.url), "utf8"));
const interests = evals.profile.interests as string[];

test("los 6 casos fijos de referencia cumplen el formato (evals/explicaciones.json)", () => {
  assert.equal(evals.cases.length, 6);
  for (const c of evals.cases) assert.deepEqual(caseProblems(c, c.reference), [], c.id);
});

test("el comprobador caza las explicaciones malas de antes", () => {
  const visigodos = evals.cases[0];
  const bad = (explanation: string, why_wrong = visigodos.reference.why_wrong) => caseProblems(visigodos, { explanation, why_wrong });
  assert.ok(bad("Correcto. Has aplicado bien el concepto.").includes("no_empieza_es_correcta"));
  assert.ok(bad("Es correcta porque Toledo. ¿Te queda claro?").includes("te_queda_claro"));
  assert.ok(bad("Es correcta porque los visigodos se fueron a Toledo.").includes("sin_negrita"));
  assert.ok(bad(`Es correcta porque en **507** ${"pasaron muchas cosas ".repeat(20)}`).includes("mas_de_60_palabras"));
  assert.ok(bad("Es correcta porque en **507** perdieron. Es como un ejército de hormigas que se muda.").includes("ejemplo_sin_aficion"));
  assert.ok(bad(visigodos.reference.explanation, {}).includes("sin_why_wrong"));
});

test("las palabras no cuentan los pasos de mates ni las fórmulas", () => {
  const text = "Es correcta porque se despeja la **x**:\n1. $2x = 8$\n2. $x = 4$\nResultado: **4**.";
  assert.ok(explanationWords(text) < 15);
  assert.deepEqual(explanationProblems(`${text}\n3. a\n4. b\n5. c`, { math: true }), ["mas_de_4_pasos"]);
});

test("why_wrong: solo opciones incorrectas que existen, cortas y sin muletillas", () => {
  const options = ["Toledo", "Tolosa", "Roma"];
  const out = cleanWhyWrong({ Tolosa: "No es esa: fue antes. ¿Te queda claro?", Toledo: "es la buena", Madrid: "no existe" }, options, "Toledo");
  assert.deepEqual(out, { Tolosa: "No es esa: fue antes." });
  assert.deepEqual(cleanWhyWrong("texto", options, "Toledo"), {});
});

test("las aficiones van sin nombre ni apodo y rotan", () => {
  const profile = { interests: ["fútbol", "videojuegos"], nickname: "Lu", display_name: "Lucía Pérez" };
  const a = interestsLine(profile, 0);
  const b = interestsLine(profile, 1);
  assert.match(a, /Si pones ejemplo, usa: fútbol/);
  assert.match(b, /Si pones ejemplo, usa: videojuegos/);
  assert.doesNotMatch(a + b, /Lu\b|Lucía/);
  assert.equal(interestsLine({ interests: [] }), "");
  assert.equal(interestsLine(null), "");
});

test("tidyExplanation quita «¿Te queda claro?» y corta en una frase", () => {
  assert.equal(tidyExplanation("Es correcta porque sí. ¿Te queda claro?"), "Es correcta porque sí.");
  const long = `${"Frase corta de prueba. ".repeat(40)}`;
  assert.ok(tidyExplanation(long, 100).endsWith("."));
  assert.ok(tidyExplanation(long, 100).length <= 100);
});

test("la lección pide el formato, why_wrong y lleva las aficiones (no el nombre)", () => {
  const system = lessonSystem();
  assert.ok(system.includes(EXPLANATION_STYLE));
  assert.match(system, /why_wrong/);
  const ctx = lessonContext({ topic: "Visigodos", subject: "Historia", interests: interestsLine({ interests }) });
  assert.match(ctx, /fútbol/);
});

const lessonRaw = (whyWrong: unknown) => ({
  reading: {
    sections: [0, 1, 2].map((i) => ({ title: `T${i}`, body_markdown: "Texto **corto**.", check: { statement: "Afirmación", is_true: true, explanation: "Es correcta porque **sí**." } })),
    sources: [],
  },
  quiz: Array.from({ length: 8 }, (_, i) => ({ type: "mcq", prompt: `P${i}`, options: ["A", "B", "C", "D"], answer: "A", why_wrong: whyWrong, explanation: "Es correcta porque **A**. ¿Te queda claro?", section_index: i % 3 })),
  cards: Array.from({ length: 8 }, (_, i) => ({ front: `F${i}`, back: `B${i}`, section_index: 0 })),
});

test("validateLesson guarda why_wrong limpio y la explicación sin muletillas", () => {
  const r = validateLesson(lessonRaw({ B: "No es esa: B es otra cosa.", A: "no" }));
  assert.ok(r.ok);
  if (!r.ok) return;
  const q = r.value.quiz[0] as { why_wrong?: Record<string, string>; explanation: string };
  assert.deepEqual(q.why_wrong, { B: "No es esa: B es otra cosa." });
  assert.equal(q.explanation, "Es correcta porque **A**.");
  // Sin why_wrong la lección sigue valiendo.
  assert.ok(validateLesson(lessonRaw(undefined)).ok);
});

test("respuesta escrita: qué ideas ya tenía y cuáles le faltan", () => {
  const q = { type: "written", prompt: "Causa", answer: "", rubric: ["alianzas entre países", "atentado de Sarajevo"], explanation: "", section_index: 0, difficulty: "medio" } as const;
  const g = gradeQuestion(q as never, "Las alianzas entre países europeos") as { ideas_have: string[]; ideas_missing: string[] };
  assert.deepEqual(g.ideas_have, ["alianzas entre países"]);
  assert.deepEqual(g.ideas_missing, ["atentado de Sarajevo"]);
});

test("simulacro: solución corta (≤ 1.500), resumen + pasos + por qué no valen las otras", () => {
  assert.equal(SOLUTION_MAX, 1500);
  for (const system of [mockQuestionsSystem(), gradingSystem()]) {
    assert.match(system, /resumen de 1 frase/);
    assert.match(system, /como mucho 5 pasos/);
    assert.match(system, /No es esa/);
    assert.match(system, /En tus apuntes/);
  }
  const long = "Es correcta porque **x**. " + "Paso largo. ".repeat(400);
  const q = validateMockQuestions({ questions: [{ type: "tf", prompt: "P", answer: true, explanation: long }] }, { mcq: 0, tf: 1, written: 0 });
  assert.ok((q.value ?? [])[0].explanation.length <= 1500);
  const g = validateGrading({ items: [{ id: "a", solution: long, cause: "concepto" }] }, [], ["a"]);
  assert.ok(g.ok && (g.value as Record<string, { solution: string }>).a.solution.length <= 1500);
});
