import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  foreignCount,
  hasForeignScript,
  readability,
  replyWords,
  robotPhrases,
  scanReply,
  syllables,
} from "../supabase/functions/dream-api/reply-shape.mjs";
import {
  checkCase,
  givesWholeProcedure,
  loadSpeller,
  spellingErrors,
} from "../evals/checks.mjs";

// P1 (docs/HABLA_NATURAL.md): el escáner del servidor y los evals miden lo
// mismo. Respuestas de ejemplo reales en forma (los dos casos de Carlos).

// Caso real de la fracción generatriz (como lo vio Carlos, abreviado).
const TOCHO = `¡Claro! Aquí tienes cómo sacar la fracción generatriz.

**Tipos de decimales:**
1. Decimal exacto: 2,46 = 246/100
2. Periódico puro: 0,4285714… = 3/7
3. Periódico mixto: 1,2333… = 37/30

Paso 1: escribe el número sin coma.
Paso 2: resta la parte que no se repite.
Paso 3: divide entre tantos nueves como cifras periódicas.

Espero que te ayude. ¿Te queda claro?`;

const BIEN =
  "Casi. *Libro* es el núcleo, sí. Pero fíjate en «de la biblioteca»: ahí hay otro grupo. ¿Cuál es su palabra central?";

test("scanReply: counts only, never the text", () => {
  const s = scanReply(TOCHO);
  assert.equal(s.numbered_list, true);
  assert.equal(s.bold, true);
  assert.ok(s.robot >= 3);
  assert.equal(s.questions, 1);
  for (const v of Object.values(s)) assert.ok(typeof v === "number" || typeof v === "boolean");
  const ok = scanReply(BIEN);
  assert.equal(ok.numbered_list, false);
  assert.equal(ok.robot, 0);
  assert.equal(ok.words, replyWords(BIEN));
});

test("robot phrases: the opener counts, «está claro que» does not", () => {
  assert.deepEqual(robotPhrases("¡Claro! Vamos a ello."), ["apertura de relleno"]);
  assert.deepEqual(robotPhrases("Claro, mira."), ["apertura de relleno"]);
  assert.deepEqual(robotPhrases("Está claro que el núcleo es libro."), []);
  assert.ok(robotPhrases("Aquí tienes la explicación").includes("aquí tienes"));
});

test("foreign scripts: Chinese or Cyrillic are caught, Greek and maths are not", () => {
  assert.equal(hasForeignScript("La respuesta es 3/7 因为"), true);
  assert.equal(foreignCount("因为所以"), 4);
  assert.equal(hasForeignScript("Привет"), true);
  assert.equal(hasForeignScript("El área es π·r² y Δx → 0, α + β = 90°"), false);
  assert.equal(hasForeignScript("¿Qué opinas, Sofía? Ñandú, pingüino."), false);
});

test("words: hidden markers and formulas do not inflate the count", () => {
  assert.equal(replyWords("<!--DREAM_SOURCES:[]-->Hola, ¿qué tal?"), 3);
  assert.equal(replyWords("Mira \\(\\frac{246}{100}\\) aquí"), 3);
});

test("Fernández-Huerta: a short natural answer is easier than an encyclopaedia line", () => {
  const easy = readability(BIEN)!;
  const hard = readability(
    "La fracción generatriz es aquella fracción irreducible cuya expresión decimal coincide exactamente con el número decimal periódico considerado, obteniéndose mediante procedimientos algebraicos sistemáticos.",
  )!;
  assert.ok(easy > 70, `${easy}`);
  assert.ok(hard < 40, `${hard}`);
  assert.equal(readability("Hola."), null);
  assert.equal(syllables("río"), 2);
  assert.equal(syllables("leer"), 2);
  assert.equal(syllables("fracción"), 2);
  assert.equal(syllables("biblioteca"), 4);
});

test("spelling (hunspell es): missing accents are errors, quotes and names are skipped", async () => {
  await loadSpeller();
  const bad = spellingErrors("La fraccion generatriz es facil de sacar si sabes como.");
  assert.deepEqual(bad.errors, ["fraccion", "facil"]);
  assert.ok(bad.per100 > 1);
  const good = spellingErrors(`${BIEN} Lucía y Marta lo hicieron en «the library».`);
  assert.deepEqual(good.errors, []);
  assert.equal(good.per100, 0);
});

test("whole procedure: three numbered steps or three lines with «=»", () => {
  assert.equal(givesWholeProcedure(TOCHO), true);
  assert.equal(givesWholeProcedure("x = 2\ny = 3\nz = x + y"), true);
  assert.equal(givesWholeProcedure(BIEN), false);
  assert.equal(givesWholeProcedure("Son tres cosas, vamos una a una. Primero, ¿cuántas cifras hay detrás de la coma?"), false);
});

test("checkCase: the new expectations fail the tocho and pass the good answer", async () => {
  await loadSpeller();
  const expect = { maxWords: 60, noRobot: true, noForeign: true, oneStep: true, minReadability: 55, maxSpelling: 1, noLists: true };
  const bad = checkCase(expect, { answer: TOCHO });
  assert.equal(bad.noRobot, false);
  assert.equal(bad.oneStep, false);
  assert.equal(bad.noLists, false);
  const good = checkCase(expect, { answer: BIEN });
  assert.ok(Object.values(good).every(Boolean), JSON.stringify(good));
});

test("eval files: the cases the brief asks for are there", () => {
  const tutor = JSON.parse(readFileSync("evals/tutor.json", "utf8"));
  const ids = tutor.cases.map((c: { id: string }) => c.id);
  for (const id of ["sintagmas-22-oct", "todos-los-pasos", "generatriz-mixto", "historia", "biologia", "fisica", "quimica", "ingles", "filosofia"])
    assert.ok(ids.includes(id), id);
  const conv = JSON.parse(readFileSync("evals/conversacion.json", "utf8"));
  assert.equal(conv.type, "script");
  assert.deepEqual(conv.cases.map((c: { id: string }) => c.id), ["generatriz-bien", "generatriz-falla-paso-2"]);
  const all = ["tono", "tutor", "no-inventar"].reduce((n, f) => n + JSON.parse(readFileSync(`evals/${f}.json`, "utf8")).cases.length, 0);
  assert.ok(all >= 30, `${all}`);
  const noInvent = readFileSync("evals/no-inventar.json", "utf8");
  for (const r of ["3/7", "123/50", "37/30"]) assert.ok(noInvent.includes(r), r);
});

test("medir-chat.sql never selects message text", () => {
  const sql = readFileSync("scripts/ia/medir-chat.sql", "utf8");
  // Every reference to content is inside an expression that returns a number or a boolean.
  const selects = sql.split(/\bselect\b/i).slice(1).map((s) => s.split(/\bfrom\b/i)[0]);
  for (const s of selects) assert.doesNotMatch(s, /^\s*content\s*(,|$)|,\s*content\s*(,|$)/m);
});
