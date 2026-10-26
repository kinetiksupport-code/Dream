import test from "node:test";
import assert from "node:assert/strict";
import {
  DREAM_FEATURES,
  activeFeatures,
  selfKnowledge,
} from "../supabase/functions/dream-api/features.mjs";
import {
  MODE_SYSTEM_PROMPTS,
  NO_INVENT_LAYER,
  TONE_LAYER,
  searchAnswerMessages,
} from "../supabase/functions/dream-api/prompts.mjs";
import {
  copiesStatement,
  isStemPrompt,
  needsVerification,
  sanitizeSearchQuery,
} from "../supabase/functions/dream-api/fact-check.mjs";
import {
  checkCase,
  hasDuplicatedNumbers,
  wordCount,
} from "../evals/checks.mjs";
import tutor from "../evals/tutor.json" with { type: "json" };
import { texToPlain } from "../lib/math";

// Token budgets checked by size, so CI needs no tokenizer download. Caps in
// characters, set from the real Qwen3 tokenizer on 26/10/2026
// (scripts/ia/medir-tokens.py): tone 821 chars = 277 tokens (≤ 200 + 80 for
// the example), no-invent 483 = 142 (≤ 150), self-knowledge 752 = 229 (≤ 250).
const CHAR_CAPS = { tone: 840, noInvent: 500, self: 790 };

test("self-knowledge lists only features whose flag is on", () => {
  const off = selfKnowledge({ memory: false });
  assert.doesNotMatch(off, /Lo que Dream recuerda/);
  assert.match(off, /no guardas recuerdos entre chats/);
  const on = selfKnowledge({ memory: true });
  assert.match(on, /Ajustes > Lo que Dream recuerda/);
  for (const f of activeFeatures({ memory: false }))
    assert.ok(off.includes(f.name), f.name);
  assert.equal(
    activeFeatures({}).length,
    DREAM_FEATURES.filter((f) => !f.flag).length,
  );
});

test("self-knowledge never names the model or the AI company", () => {
  for (const text of [selfKnowledge({ memory: true }), selfKnowledge({})])
    assert.doesNotMatch(
      text,
      /\b(qwen|llama|gpt|openai|groq|mistral|cloudflare|anthropic|claude|gemini|meta|alibaba)\b/i,
    );
  assert.ok(selfKnowledge({ memory: true }).length <= CHAR_CAPS.self);
});

test("tone and no-invent layers stay within their token budget and reach every mode", () => {
  assert.ok(TONE_LAYER.length <= CHAR_CAPS.tone, "tono ≤ 200 + ejemplo ≤ 80");
  assert.ok(NO_INVENT_LAYER.length <= CHAR_CAPS.noInvent);
  for (const prompt of Object.values(MODE_SYSTEM_PROMPTS)) {
    assert.ok(prompt.includes(TONE_LAYER));
    assert.ok(prompt.includes(NO_INVENT_LAYER));
  }
  assert.match(searchAnswerMessages()[0].content, /NO INVENTES/);
});

test("the server asks for a check on concepts, dates, rules and methods", () => {
  for (const p of [
    "explícame la fracción generatriz",
    "¿qué es la ley de Ohm?",
    "cómo se calcula la fracción generatriz de 1,2333",
    "¿quién escribió La Regenta?",
    "¿en qué año se aprobó la Constitución de Cádiz?",
    "¿qué dice el artículo 27 de la Constitución?",
    "qué entra en la PAU de historia",
  ])
    assert.equal(needsVerification(p), true, p);
  for (const p of [
    "hola",
    "gracias",
    "¿qué pasó en el examen de mi clase de ayer?",
    "¿qué es Dream?",
    "cuéntame un chiste",
    "estoy agobiado",
  ])
    assert.equal(needsVerification(p), false, p);
  // With notes attached, the notes are the source.
  assert.equal(
    needsVerification("explícame esto", { attachments: 1 }),
    false,
  );
  assert.equal(isStemPrompt("fracción generatriz de 2,46"), true);
  assert.equal(isStemPrompt("quién escribió La Regenta"), false);
});

test("the query sent to the search engine carries no student data", () => {
  const profile = {
    nickname: "Luci",
    display_name: "Lucía Pérez",
    interests: ["fútbol", "Real Madrid"],
  };
  const q = sanitizeSearchQuery(
    "{{APODO}} Lucía Pérez lucia@example.com 612 345 678 fracción generatriz Real Madrid fútbol https://x.y/z",
    { profile },
  );
  assert.equal(q, "fracción generatriz");
  assert.equal(sanitizeSearchQuery("Luci", { profile }), "");
  // A pasted statement keeps only a few words.
  const prompt =
    "un tren sale de Valladolid a 90 km/h y otro sale de Madrid a 110 km/h por la misma vía en sentido contrario";
  assert.equal(copiesStatement(prompt, prompt), true);
  assert.ok(sanitizeSearchQuery(prompt, { prompt }).split(" ").length <= 6);
  assert.equal(
    copiesStatement("problemas de encuentro de dos móviles", prompt),
    false,
  );
});

test("the sintagmas case: the real bad answer fails and the expected one passes", () => {
  const file = tutor as unknown as {
    defaults: Record<string, unknown>;
    cases: { id: string; expect: Record<string, unknown> }[];
  };
  const c = file.cases.find((x) => x.id === "sintagmas-22-oct")!;
  const expect = {
    ...file.defaults,
    ...c.expect,
    forbidden: file.defaults.forbidden,
  } as Parameters<typeof checkCase>[0];
  const good =
    "Casi. *Libro* es el núcleo del grupo entero, sí. Pero fíjate en «de la biblioteca»: ahí dentro hay otro grupo nominal más pequeño. ¿Cuál sería su palabra central?";
  const bad = `Has identificado bien que libro es el núcleo del sintagma nominal. Sin embargo, hay que analizar también el complemento:

1. El determinante «el» va bajo Det.
2. «de la biblioteca» es un SPrep: «de» es el enlace y «la biblioteca» es un SN.
3. Dentro de ese SN, «biblioteca» es el núcleo, así que bajo libro pondríamos N y bajo biblioteca también N (o Nc si tu profesor usa esa notación).

Así el análisis completo queda con dos núcleos nominales, uno en cada grupo, y el SPrep funciona como complemento del nombre. ¿Te queda claro cómo se analiza el SPrep?`;
  const okGood = checkCase(expect, { answer: good });
  assert.ok(
    Object.values(okGood).every(Boolean),
    JSON.stringify(okGood),
  );
  const okBad = checkCase(expect, { answer: bad });
  for (const k of ["maxWords", "noLists", "forbidden", "mustNotMatch"])
    assert.equal(okBad[k], false, k);
  assert.ok(wordCount(good) <= 35);
});

test("duplicated fraction text is detected and formulas copy as plain text", () => {
  assert.equal(hasDuplicatedNumbers("es 246100100246"), true);
  assert.equal(hasDuplicatedNumbers("es 1235050123"), true);
  assert.equal(hasDuplicatedNumbers("246/100 = 123/50"), false);
  assert.equal(texToPlain("\\frac{246}{100}"), "246/100");
  assert.equal(texToPlain("\\dfrac{123 - 12}{90}"), "(123 - 12)/90");
  assert.equal(texToPlain("\\sqrt{2}"), "√2");
  assert.equal(texToPlain("\\sqrt[3]{x+1}"), "3√(x+1)");
  assert.equal(texToPlain("x^{2} + y_1"), "x^2 + y_1");
  assert.equal(texToPlain("a^{n+1}"), "a^(n+1)");
  assert.equal(texToPlain("2 \\cdot \\pi r"), "2 · π r");
});

test("the copy button text turns every formula into plain text", async () => {
  const { plainMath } = await import("../lib/math");
  assert.equal(
    plainMath("Es \\(\\frac{246}{100}\\) y $$\\frac{37}{30}$$ pero `\\frac{a}{b}` no"),
    "Es 246/100 y 37/30 pero `\\frac{a}{b}` no",
  );
});
