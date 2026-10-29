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

// ── P2: corto y paso a paso, garantizado por el servidor ────────────────────
import {
  SIGO,
  WORD_LIMITS,
  completeUnits,
  createReplyGuard,
  firstUnitEnd,
  planText,
  readPlan,
  replyKind,
  shapeReply,
  wantsMore,
} from "../supabase/functions/dream-api/reply-shape.mjs";
import { readBoard, updateBoard } from "../supabase/functions/dream-api/conversation-memory.mjs";
import {
  MODE_SYSTEM_PROMPTS,
  STYLE_REMINDERS,
  TONE_LAYER,
  dynamicContextFor,
  searchAnswerMessages,
} from "../supabase/functions/dream-api/prompts.mjs";
import { MODES, outputTokensFor } from "../supabase/functions/dream-api/models.mjs";

const sentence = (i: number) => `Esta es la frase número ${i} y tiene unas cuantas palabras más.`;
const LONG = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(" ");

/** Pasa un texto por el corte en trozos de tamaño variable, como el streaming. */
function stream(text: string, sizes = [1, 3, 7, 12, 2]) {
  const guard = createReplyGuard();
  let out = "";
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const n = sizes[k++ % sizes.length];
    out += guard.push(text.slice(i, i + n));
    i += n;
    if (guard.stopped) break;
  }
  const end = guard.finish({ complete: i >= text.length });
  return { out: out + end.text, ...end };
}

test("cut: a long answer stops at the last full sentence within 120 words and asks «¿Sigo?»", () => {
  const r = shapeReply(LONG);
  assert.equal(r.cut, true);
  assert.ok(replyWords(r.text) <= 120 + 1, `${replyWords(r.text)}`);
  assert.ok(r.text.endsWith(`\n\n${SIGO}`));
  assert.match(r.text.replace(`\n\n${SIGO}`, ""), /más\.$/);
  // The rest is whole and starts where the shown text stopped.
  assert.ok(r.rest.startsWith(sentence(11)), r.rest.slice(0, 40));
  assert.ok(r.rest.endsWith(sentence(30)));
});

test("cut while streaming: same text shown, generation stops, rest keeps only full sentences", () => {
  const whole = shapeReply(LONG);
  const live = stream(LONG);
  assert.equal(live.out, whole.text);
  assert.equal(live.cut, true);
  // Stopped early (not everything was read) → rest trimmed to complete units.
  const partial = createReplyGuard();
  partial.push(LONG.slice(0, LONG.indexOf(sentence(14)) + 20));
  const end = partial.finish({ complete: false });
  assert.equal(end.rest, sentence(11) + " " + sentence(12) + " " + sentence(13));
});

test("cut: short answers, theory under 260 words and a final question are left alone", () => {
  const short = "Casi. Fíjate en el segundo grupo. ¿Cuál es su núcleo?";
  assert.deepEqual(
    { text: shapeReply(short).text, cut: shapeReply(short).cut },
    { text: short, cut: false },
  );
  const theory = Array.from({ length: 18 }, (_, i) => sentence(i)).join(" ");
  assert.equal(shapeReply(theory, { hard: WORD_LIMITS.theory.hard }).cut, false);
  // Shown part already ends with a question: no «¿Sigo?», the extra text is dropped.
  const asks = `${Array.from({ length: 9 }, (_, i) => sentence(i)).join(" ")} ¿Qué número sale? ${sentence(40)} ${sentence(41)} ${sentence(42)}`;
  const r = shapeReply(asks);
  assert.equal(r.cut, true);
  assert.ok(r.text.endsWith("¿Qué número sale?"), r.text.slice(-30));
  assert.equal(r.rest, "");
});

test("cut: never inside a formula, a hidden mark or a decimal", () => {
  assert.equal(firstUnitEnd("El 2.5 y el 3,7 son"), -1);
  assert.equal(firstUnitEnd("Mira \\(a. b\\) aquí. Y"), "Mira \\(a. b\\) aquí.".length);
  assert.equal(firstUnitEnd("Hola <!--DREAM_PLAN:{\"a\":\"x. y\"}"), -1);
  assert.equal(firstUnitEnd("Fin.»\nOtra"), 5);
  assert.equal(completeUnits("Una. Dos. Tres a medias"), "Una. Dos.");
  // One «sentence» longer than the limit: cut by words with an ellipsis.
  const wall = Array.from({ length: 200 }, () => "palabra").join(" ");
  const r = shapeReply(wall);
  assert.equal(replyWords(r.text.replace(SIGO, "")), 120);
  assert.match(r.text, /…\n\n¿Sigo\?$/);
});

test("plan: the hidden mark is taken out (even split across chunks) and validated", () => {
  const text = 'Vale, vamos uno a uno. ¿Qué cifra se repite?\n<!--DREAM_PLAN:{"tema":"fracción generatriz","pasos":["ver el tipo","quitar la coma","restar","dividir"],"paso":1}-->';
  const r = stream(text, [5]);
  assert.equal(r.out.trim(), "Vale, vamos uno a uno. ¿Qué cifra se repite?");
  assert.doesNotMatch(r.out, /DREAM_PLAN|<!--/);
  assert.deepEqual(r.plan, { tema: "fracción generatriz", pasos: ["ver el tipo", "quitar la coma", "restar", "dividir"], paso: 1 });
  // Junk plans are ignored; an unclosed mark at the end is never shown.
  assert.equal(readPlan('{"tema":"x","pasos":["solo uno"]}'), null);
  assert.equal(readPlan("no json"), null);
  assert.equal(shapeReply("Hola. <!--DREAM_PLAN:{\"tema\"").text, "Hola.");
  // The next turn gets it as data, ≤ 100 tokens, and nothing once finished.
  const data = planText(r.plan);
  assert.match(data, /Ya has explicado hasta el paso 1; sigue con el 2/);
  assert.ok(data.length < 400, `${data.length}`);
  assert.equal(planText({ ...r.plan, paso: 4 }), "");
});

test("foreign script: Chinese characters are removed from what is shown", () => {
  const r = shapeReply("Vale, 3/7 因为 es la fracción. ¿La ves?");
  assert.equal(r.text, "Vale, 3/7 es la fracción. ¿La ves?");
  assert.equal(r.foreign, 2);
  assert.equal(shapeReply("Se dice 你好 en chino.", { allowForeign: true }).text, "Se dice 你好 en chino.");
});

test("kinds and «sí, sigue»", () => {
  assert.equal(replyKind("deberes: resuelve 2x + 6 = 14"), "homework");
  assert.equal(replyKind("hazme un resumen del tema 3"), "theory");
  assert.equal(replyKind("explícame la teoría de la evolución"), "theory");
  assert.equal(replyKind("no entiendo la fotosíntesis"), "chat");
  for (const yes of ["sí", "Si", "sí, sigue", "vale", "dale", "sigue porfa", "Venga!", "ok", "continúa"]) assert.equal(wantsMore(yes), true, yes);
  for (const no of ["sí pero no entiendo el paso 2", "no", "¿y eso por qué?", "vale, ¿y la b?"]) assert.equal(wantsMore(no), false, no);
});

test("board keeps the rest and the plan; a new message clears the rest", () => {
  const plan = { tema: "t", pasos: ["a", "b"], paso: 1 };
  const b = readBoard({ rest: "Lo que faltaba.\nOtra línea.", plan, junk: 1 });
  assert.equal(b.rest, "Lo que faltaba.\nOtra línea.");
  assert.deepEqual(b.plan, plan);
  assert.equal(readBoard({ rest: "x".repeat(9000) }).rest.length, 4000);
  const after = updateBoard(b, { prompt: "otra cosa" });
  assert.equal(after.rest, "");
  assert.deepEqual(after.plan, plan);
  // The rest never goes to the AI in the board text.
  assert.equal(readBoard({}).rest, "");
});

test("output tokens: chat and homework get the short cap, theory the long one", () => {
  assert.equal(outputTokensFor(MODES.normal, "hola", "chat"), 800);
  assert.equal(outputTokensFor(MODES.normal, "deberes", "homework"), 800);
  assert.equal(outputTokensFor(MODES.normal, "resumen", "theory"), 2048);
  assert.equal(outputTokensFor(MODES.fast, "hola", "chat"), 700);
  // Without a kind (internal calls), the old rule.
  assert.equal(outputTokensFor(MODES.normal, "hola"), 1200);
});

// ── P3: el prompt habla en positivo, con cifras y sin el estilo de manual ───

test("tone layer: numbers, one step, prose, the cases of Carlos, no shouting", () => {
  for (const must of ["80 palabras", "120", "50", "«¿Sigo?»", "sin numerarlos", "una sola pregunta", "0,45", "1,2333", "biblioteca", "DREAM_PLAN"])
    assert.ok(TONE_LAYER.includes(must), must);
  assert.equal((TONE_LAYER.match(/^Mal: /gm) ?? []).length, 2);
  // Prose: no bullet lines, no capitalised words except the heading and the mark.
  assert.doesNotMatch(TONE_LAYER, /^\s*[-*•]\s/m);
  const shouting = (TONE_LAYER.replace(/^CÓMO HABLAS Y ESCRIBES/, "").replace(/DREAM_PLAN/g, "").match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) ?? []);
  assert.deepEqual(shouting, []);
  for (const prompt of Object.values(MODE_SYSTEM_PROMPTS)) {
    assert.ok(prompt.includes(TONE_LAYER));
    assert.doesNotMatch(prompt, /250 palabras|350 palabras|Usa Markdown/);
  }
  assert.ok(searchAnswerMessages()[0].content.includes(TONE_LAYER));
  assert.doesNotMatch(searchAnswerMessages()[0].content, /250 palabras/);
  // The «practice exercise at the end» no longer adds a second block.
  assert.doesNotMatch(dynamicContextFor(), /Propón un ejercicio de práctica al final/);
});

test("style reminder goes right before the student's message, per kind", () => {
  assert.match(STYLE_REMINDERS.chat, /80 palabras.*120/);
  assert.match(STYLE_REMINDERS.homework, /50 palabras/);
  assert.match(STYLE_REMINDERS.theory, /¿Sigo\?/);
  const index = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  assert.match(index, /\.\.\.priorMessages, reminder, \{ role: 'user', content: prompt \}/);
  assert.match(index, /\.\.\.fallbackHistory, reminder, \{ role: 'user', content: prompt \}/);
});

test("dream-api: the cut wraps every path that shows AI text, and «sí» is served without AI", () => {
  const index = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  assert.match(index, /else if \(say\(delta\)\) break;/);
  assert.equal((index.match(/if \(say\(delta\)\) break;/g) ?? []).length, 2);
  assert.match(index, /say\(final\);/);
  assert.match(index, /say\(supported \? held : NOT_IN_SOURCES_REPLY\)/);
  assert.match(index, /const shaped = guard\.finish\(\{ complete: !cutWhileStreaming \}\)/);
  // «sí» after «¿Sigo?» is answered before the usage window is even read.
  const served = index.indexOf("savedBoard.rest && wantsMore(prompt)");
  assert.ok(served > 0 && served < index.indexOf("const limiter = special.on"));
  // Only counters are logged.
  assert.match(index, /event: 'dream_reply_shape'[^\n]*\.\.\.scanReply\(answer\)/);
});
