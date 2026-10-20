import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LABELS,
  PHASE_RULE,
  acceptSentence,
  compareAnalysis,
  crosses,
  displayLabel,
  flatten,
  fullName,
  hintFor,
  nextLevel,
  nextPhase,
  normalizeLabel,
  sanitizeConventions,
  sanitizeMarks,
  sessionSummary,
  spanFeedback,
  suggestLabels,
  tokenize,
  treeErrors,
  treeFromMarks,
  treeFromText,
  weakestLabel,
} from "../supabase/functions/dream-api/sintagmas.mjs";
import {
  DREAM_SYSTEM_PROMPT,
  SYNTAX_GUIDE,
  dynamicContextFor,
  syntaxAnalyzeMessages,
  syntaxConventionsMessages,
  syntaxExplainMessages,
  syntaxGenerateMessages,
} from "../supabase/functions/dream-api/prompts.mjs";
import { consumingActions } from "../supabase/functions/dream-api/admission.mjs";

const evals = JSON.parse(readFileSync("evals/sintagmas.json", "utf8")) as {
  sentences: { id: number; text: string; analysis: unknown; doubtful?: string }[];
};
const perro = acceptSentence({
  text: "El perro de mi vecino ladra.",
  analysis: evals.sentences.find((s) => s.id === 8)!.analysis,
})!;

test("tokenize drops punctuation and keeps accents", () => {
  assert.deepEqual(tokenize("¿Llegó él, ayer?"), ["Llegó", "él", "ayer"]);
  assert.deepEqual(tokenize("  "), []);
});

test("labels: variants, no accents, brackets, full names and teacher names", () => {
  for (const [typed, label] of [
    ["sn", "SN"], ["GN", "SN"], ["(SN)", "SN"], ["Sintagma nominal", "SN"], ["grupo nominal", "SN"],
    ["sprep", "SPrep"], ["SP", "SPrep"], ["s. prep.", "SPrep"], ["sintagma preposicional", "SPrep"],
    ["SAdj", "SAdj"], ["SA", "SAdj"], ["sadv", "SAdv"], ["núcleo", "N"], ["NUCLEO", "N"],
    ["det", "Det"], ["enlace", "E"], ["Sintagma verbal", "SV"],
  ] as const)
    assert.equal(normalizeLabel(typed), label, typed);
  assert.equal(normalizeLabel("xyz"), null);
  assert.equal(normalizeLabel(""), null);
  assert.equal(displayLabel("SN", { SN: "GN" }), "GN");
  assert.equal(fullName("SN", { SN: "GN" }), "grupo nominal");
  assert.equal(fullName("SPrep"), "sintagma preposicional");
});

test("autocomplete: «s» suggests the phrases, recent ones first", () => {
  assert.deepEqual(suggestLabels("s").slice(0, 5), ["SN", "SV", "SAdj", "SAdv", "SPrep"]);
  assert.deepEqual(suggestLabels("s", {}, ["SPrep"]).slice(0, 2), ["SPrep", "SN"]);
  assert.equal(suggestLabels("sintagma prep")[0], "SPrep");
  assert.equal(suggestLabels("nu")[0], "N");
  assert.equal(suggestLabels("g", { SN: "GN" })[0], "SN");
  assert.deepEqual(suggestLabels("zz"), []);
  assert.deepEqual(suggestLabels(""), LABELS);
});

test("teacher conventions keep only known variants of the same label", () => {
  assert.deepEqual(sanitizeConventions({ names: { SN: "GN", SV: "SV", N: "Núcleo", E: "SN", Det: "<b>" } }, "notes"), {
    names: { SN: "GN", N: "Núcleo" },
    source: "notes",
  });
  assert.deepEqual(sanitizeConventions(null), { names: {}, source: "standard" });
});

test("the 40 hand-analysed sentences pass every mechanical rule", () => {
  assert.equal(evals.sentences.length, 40);
  for (const s of evals.sentences) assert.ok(acceptSentence({ text: s.text, analysis: s.analysis }), `#${s.id} ${s.text}`);
  assert.ok(evals.sentences.some((s) => s.doubtful), "dudosas señaladas para revisión");
});

test("mechanical rules reject gaps, crossings, two nuclei and a split preposition", () => {
  const words = tokenize("El perro ladra");
  const ok = treeFromText(words, [
    { label: "SN", text: "El perro", children: [{ label: "Det", text: "El" }, { label: "N", text: "perro" }] },
    { label: "SV", text: "ladra", children: [{ label: "N", text: "ladra" }] },
  ])!;
  assert.deepEqual(treeErrors(3, ok), []);
  // Hueco: falta «ladra».
  assert.ok(treeErrors(3, ok.slice(0, 1)).length);
  // Dos núcleos en el SN.
  const twoN = structuredClone(ok);
  twoN[0].children![0].label = "N";
  assert.ok(treeErrors(3, twoN).some((e) => e.startsWith("un_nucleo")));
  // SPrep sin enlace.
  const prep = treeFromText(tokenize("Vive en Madrid"), [
    { label: "SV", text: "Vive en Madrid", children: [
      { label: "N", text: "Vive" },
      { label: "SPrep", text: "en Madrid", children: [{ label: "SN", text: "en Madrid", children: [{ label: "N", text: "en" }, { label: "N", text: "Madrid" }] }] },
    ] },
  ])!;
  assert.ok(treeErrors(3, prep).includes("sprep_enlace_termino"));
  // Un texto que no está en la frase no se convierte.
  assert.equal(treeFromText(words, [{ label: "SN", text: "El gato" }]), null);
  // Sin SV no hay oración.
  assert.ok(treeErrors(2, [{ label: "SN", start: 0, end: 2, children: [{ label: "Det", start: 0, end: 1 }, { label: "N", start: 1, end: 2 }] }]).includes("un_sv"));
  assert.equal(crosses({ start: 0, end: 2 }, { start: 1, end: 3 }), true);
  assert.equal(crosses({ start: 0, end: 3 }, { start: 1, end: 2 }), false);
});

test("an unsure or invalid AI sentence is never shown", () => {
  const analysis = evals.sentences[0].analysis;
  assert.equal(acceptSentence({ text: "El perro ladra.", analysis, confidence: "baja" }), null);
  assert.ok(acceptSentence({ text: "El perro ladra.", analysis, confidence: "alta" }));
  assert.equal(acceptSentence({ text: "El perro ladra.", analysis: [] }), null);
  assert.equal(acceptSentence("nada"), null);
});

test("marks: sanitised, nested by containment, crossing rejected", () => {
  assert.equal(sanitizeMarks([{ start: 0, end: 2, label: "SN" }, { start: 1, end: 3, label: "SV" }], 3), null);
  assert.equal(sanitizeMarks([{ start: 0, end: 9, label: "SN" }], 3), null);
  assert.equal(sanitizeMarks([{ start: 0, end: 1, label: "XX" }], 3), null);
  assert.deepEqual(sanitizeMarks([{ start: 0, end: 2, label: "gn" }, { start: 0, end: 2, label: "SN" }], 3), [{ label: "SN", start: 0, end: 2 }]);
  const marks = flatten(perro.analysis).map(({ label, start, end }) => ({ label, start, end }));
  assert.deepEqual(treeErrors(perro.words.length, treeFromMarks([...marks].reverse())), []);
});

test("compare: correct, wrong label, missing and extra", () => {
  const all = flatten(perro.analysis).map(({ label, start, end }) => ({ label, start, end }));
  const full = compareAnalysis(perro.analysis, all);
  assert.equal(full.perfect, true);
  assert.equal(full.score, 1);
  assert.equal(full.total, 10);

  const marks = all.filter((m) => !(m.label === "Det" && m.start === 3)); // falta «mi»
  marks.find((m) => m.label === "SPrep")!.label = "SN"; // etiqueta equivocada
  marks.push({ label: "SAdv", start: 5, end: 6 }); // sobra
  const r = compareAnalysis(perro.analysis, marks);
  assert.equal(r.perfect, false);
  assert.equal(r.spans.find((s) => s.start === 2 && s.end === 5)!.status, "wrong_label");
  assert.equal(r.spans.find((s) => s.label === "Det" && s.start === 3)!.status, "missing");
  assert.deepEqual(r.extra, [{ label: "SAdv", start: 5, end: 6 }]);
  assert.deepEqual(r.byLabel.Det, { ok: 1, total: 2 });
  assert.match(spanFeedback(r.spans.find((s) => s.status === "wrong_label")!, perro.words), /«de mi vecino» es un SPrep \(sintagma preposicional\), no SN\./);
  assert.match(spanFeedback(r.spans.find((s) => s.status === "missing")!, perro.words, { Det: "D" }), /Faltaba marcar «mi» como D/);
});

test("hints: first where and what kind, then how the label starts", () => {
  const one = hintFor(perro.analysis, [], 1);
  assert.deepEqual([one.start, one.end], [0, 5]);
  assert.equal(one.text, "Aquí falta un sintagma.");
  const two = hintFor(perro.analysis, [], 2, { SN: "GN" });
  assert.equal(two.text, "Aquí falta un sintagma: su etiqueta empieza por «G…».");
  const all = flatten(perro.analysis).map(({ label, start, end }) => ({ label, start, end }));
  assert.equal(hintFor(perro.analysis, all, 1).text, "Lo tienes todo. ¡Pulsa Comprobar!");
  const prep = hintFor(perro.analysis, all.filter((m) => m.label !== "SPrep"), 2);
  assert.equal(prep.text, "Aquí falta un sintagma: su etiqueta empieza por «SP…».");
});

test("phase rule: 80 % over the last 5 moves up, under 50 % moves back", () => {
  assert.deepEqual(PHASE_RULE, { window: 5, up: 0.8, down: 0.5 });
  assert.equal(nextPhase("options", [1, 1, 1, 1]), "options");
  assert.equal(nextPhase("options", [0.2, 1, 0.8, 0.8, 0.8, 0.8]), "write");
  assert.equal(nextPhase("options", [1, 1, 0.5, 0.5, 0.8]), "options");
  assert.equal(nextPhase("write", [0.4, 0.4, 0.5, 0.4, 0.6]), "options");
  assert.equal(nextPhase("write", [0.5, 0.5, 0.5, 0.5, 0.5]), "write");
});

test("level: up after 3 good sentences, down after 2 bad, within 1–5", () => {
  assert.equal(nextLevel(1, [0.9, 1, 0.8]), 2);
  assert.equal(nextLevel(5, [1, 1, 1]), 5);
  assert.equal(nextLevel(2, [0.1, 0.4]), 1);
  assert.equal(nextLevel(1, [0, 0]), 1);
  assert.equal(nextLevel(3, [1, 0.3]), 3);
});

test("weakest label and the end summary", () => {
  const history = [
    { SPrep: { ok: 0, total: 2 }, SN: { ok: 3, total: 3 } },
    { SPrep: { ok: 1, total: 2 }, SN: { ok: 2, total: 2 }, N: { ok: 1, total: 1 } },
  ];
  assert.equal(weakestLabel(history), "SPrep");
  assert.equal(weakestLabel([{ SN: { ok: 0, total: 1 } }]), null);
  const summary = sessionSummary(history);
  assert.deepEqual(summary.mastered, ["SN", "N"]);
  assert.deepEqual(summary.review, ["SPrep"]);
});

test("prompts: guide ≤ 700 tokens, only sentence and conventions go to the AI", () => {
  assert.ok(SYNTAX_GUIDE.length / 3.5 <= 700, `${SYNTAX_GUIDE.length} caracteres`);
  const gen = JSON.stringify(syntaxGenerateMessages({ count: 3, minWords: 2, maxWords: 4, focus: "SPrep", names: { SN: "GN" }, noteSentences: ["El sol brilla."] }));
  assert.match(gen, /SN→GN/);
  assert.match(gen, /El sol brilla/);
  assert.match(gen, /confidence/);
  const explain = JSON.stringify(syntaxExplainMessages({ text: "El perro ladra.", official: [], student: [], wrong: [] }));
  assert.match(explain, /valid_alternative/);
  assert.doesNotMatch(gen + explain, /@|correo|email/i);
  assert.match(JSON.stringify(syntaxConventionsMessages("<material_del_alumno>")), /found/);
  assert.match(JSON.stringify(syntaxAnalyzeMessages("Hola")), /"Hola/);
  // El chat no recibe la guía (límite de tokens), solo la señal.
  assert.doesNotMatch(DREAM_SYSTEM_PROMPT, /GUÍA DE SINTAGMAS/);
  assert.match(DREAM_SYSTEM_PROMPT, /<!--DREAM_ACTION:SINTAGMAS-->/);
  assert.match(dynamicContextFor(), /<!--DREAM_ACTION:SINTAGMAS-->/);
});

test("the new AI actions count against the usage limits", () => {
  for (const action of ["syntax_conventions", "syntax_next", "syntax_check"]) assert.ok(consumingActions.has(action), action);
  for (const action of ["syntax_state", "syntax_settings", "syntax_hint"]) assert.equal(consumingActions.has(action), false, action);
});

// --- Web (lib/sintagmas.ts) -------------------------------------------------
import {
  DESKTOP_ONLY_MESSAGE,
  DESKTOP_QUERY,
  commit,
  emptyHistory,
  markRows,
  phaseMessage,
  readTutorialHidden,
  redo,
  uncovered,
  undo,
  wouldCross,
  writeTutorialHidden,
  type Mark,
} from "../lib/sintagmas";

const m = (id: string, start: number, end: number, label: Mark["label"]): Mark => ({ id, start, end, label });

test("rows: outer phrase on top, its parts below, same span phrase above part", () => {
  const rows = markRows([m("n", 0, 1, "N"), m("sn", 0, 2, "SN"), m("det", 0, 1, "Det"), m("sv", 2, 3, "SV"), m("solo", 2, 3, "N")]);
  assert.equal(rows.get("sn"), 0);
  assert.equal(rows.get("sv"), 0);
  assert.equal(rows.get("solo"), 1);
  assert.equal(rows.get("det"), 1);
  assert.equal(rows.get("n"), 1);
  // Una raya gris (sin etiqueta) puede tener otras dentro.
  const grey = markRows([m("g", 0, 3, null), m("in", 1, 2, "N")]);
  assert.deepEqual([grey.get("g"), grey.get("in")], [0, 1]);
});

test("crossing, uncovered words and undo/redo", () => {
  const marks = [m("a", 0, 2, "SN")];
  assert.equal(wouldCross(marks, { start: 1, end: 3 }), true);
  assert.equal(wouldCross(marks, { start: 0, end: 3 }), false);
  assert.equal(wouldCross(marks, { start: 1, end: 3 }, "a"), false);
  assert.deepEqual(uncovered(4, [m("a", 0, 2, "SN"), m("b", 2, 3, "N")]), [2, 3]);
  let h = commit(emptyHistory(), marks);
  h = commit(h, [...marks, m("b", 2, 3, "SV")]);
  assert.equal(h.present.length, 2);
  h = undo(h);
  assert.equal(h.present.length, 1);
  h = redo(h);
  assert.equal(h.present.length, 2);
  assert.equal(undo(undo(undo(h))).present.length, 0);
  assert.equal(redo(h), h);
});

test("desktop only, positive phase messages, tolerant local backup", () => {
  assert.equal(DESKTOP_ONLY_MESSAGE, "Esta experiencia solo se puede usar en un ordenador");
  assert.match(DESKTOP_QUERY, /pointer: fine/);
  assert.match(phaseMessage("write"), /^¡/);
  assert.match(phaseMessage("options"), /afianzar/);
  // Sin window (o con el almacenamiento bloqueado) no rompe.
  assert.equal(readTutorialHidden(), false);
  assert.doesNotThrow(() => writeTutorialHidden(true));
});
