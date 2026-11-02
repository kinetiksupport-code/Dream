// Ruta de estudio (Entrega 1) con el dream-api REAL: Groq simulado (respuestas
// con la forma exacta de las reales, también malformadas y con error) y el
// Supabase falso del arnés. Nada sale de la máquina.
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const EXAM = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";
const UNIT2 = "33333333-3333-4333-8333-333333333333";
const OTHER_EXAM = "44444444-4444-4444-8444-444444444444";
const OTHER_UNIT = "55555555-5555-4555-8555-555555555555";
const OTHER = "99999999-9999-4999-8999-999999999999";

const section = (t, s, v) => ({ title: t, body_markdown: `**${t}**: explicación corta.`, why_it_matters: "Importa.", check: { statement: s, is_true: v, explanation: "Por la sección." } });
const goodLesson = {
  reading: { sections: [section("Bizancio", "Era la parte oriental.", true), section("Justiniano", "Construyó la Alhambra.", false), section("1453", "Cayó en 1453.", true)], sources: ["De tus apuntes"] },
  quiz: Array.from({ length: 9 }, (_, i) => i % 3 === 0
    ? { type: "mcq", prompt: `Pregunta ${i}`, options: ["A", "B", "C"], answer: "B", explanation: "x", section_index: i % 3, difficulty: "medio" }
    : i % 3 === 1 ? { type: "tf", prompt: `V/F ${i}`, answer: true, explanation: "x", section_index: i % 3, difficulty: "facil" }
      : { type: "written", prompt: `Explica ${i}`, answer: "x", rubric: ["idea 1", "idea 2"], explanation: "x", section_index: i % 3, difficulty: "dificil" }),
  cards: Array.from({ length: 10 }, (_, i) => ({ front: `Concepto ${i}`, back: `Idea ${i}`, section_index: i % 3 })),
};
let replies = [];
const groqBodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    groqBodies.push(JSON.parse(String(init?.body ?? "{}")));
    const next = replies.shift() ?? { json: goodLesson };
    if (next.status) return new Response("{}", { status: next.status });
    return Response.json({ choices: [{ message: { content: typeof next.json === "string" ? next.json : JSON.stringify(next.json) } }], usage: { prompt_tokens: 1800, completion_tokens: 2400 } });
  }
  return realFetch(input, init);
};

let quota = { ok: true, used: 0, cap: 6, unlimited: false };
const rpc = new Proxy({}, { get: (_t, name) => name === "dream_study_quota" ? () => quota : () => ({ ok: true, attempt_id: crypto.randomUUID(), lease_id: crypto.randomUUID(), windows: [], used: 0 }) });
const token = makeToken({ sub: USER_ID, aal: "aal1" });
const harness = await startHarness({
  patchable: true,
  users: { [token]: goodUser() },
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01", academic_level: "2.º ESO" })],
    dream_exams: [{ id: EXAM, owner_id: USER_ID, subject: "Historia", exam_date: "2026-11-20" }, { id: OTHER_EXAM, owner_id: OTHER, subject: "Mates", exam_date: "2026-11-21" }],
    dream_exam_units: [
      { id: UNIT, exam_id: EXAM, owner_id: USER_ID, title: "El Imperio bizantino", topic: "Bizancio", summary: "Entender Bizancio", status: "pending" },
      { id: UNIT2, exam_id: EXAM, owner_id: USER_ID, title: "Los reinos cristianos", topic: "Reinos", summary: "Reinos", status: "pending" },
      { id: OTHER_UNIT, exam_id: OTHER_EXAM, owner_id: OTHER, title: "Ajena", topic: "Ajena", summary: "x", status: "pending" },
    ],
    dream_exam_materials: [{ exam_id: EXAM, owner_id: USER_ID, attachment_id: "66666666-6666-4666-8666-666666666666" }],
    dream_attachments: [{ id: "66666666-6666-4666-8666-666666666666", owner_id: USER_ID, file_name: "tema3.pdf", extracted_text: "Bizancio fue la parte oriental del Imperio romano con capital en Constantinopla.\n\nLa fotosíntesis no tiene nada que ver." }],
    dream_unit_content: [], dream_unit_progress: [], dream_cards: [], dream_card_reviews: [], dream_error_bank: [],
  },
  rpc,
  env: { GROQ_API_KEY_1: "gsk_test_key", DREAM_STUDY_STEPS_ENABLED: "true", TAVILY_API_KEY_1: undefined, CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});
const call = (body) => harness.call(token, body);
const logs = [];
const realLog = console.log, realErr = console.error;
console.log = (...a) => { logs.push(a.join(" ")); realLog(...a); };
console.error = (...a) => { logs.push(a.join(" ")); realErr(...a); };

Deno.test("abrir una lección por primera vez la genera, la guarda y devuelve la lectura sin las respuestas", async () => {
  groqBodies.length = 0;
  const res = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT, difficulty: "dificil" });
  assertEquals(res.status, 200, res.text);
  assertEquals(res.json.status, "ready");
  assertEquals(res.json.reading.sections.length, 3);
  assertEquals(res.json.reading.sections[1].check.is_true, undefined, "la respuesta no va al navegador");
  assertNotMatch(res.text, /"quiz"|"answer"/);
  // Una sola llamada, con tope de salida, sin datos personales y con los apuntes de la unidad.
  assertEquals(groqBodies.length, 1);
  assertEquals(groqBodies[0].max_tokens, 3500);
  const prompt = groqBodies[0].messages.map((m) => m.content).join("\n");
  assertMatch(prompt, /Tema: Bizancio/);
  assertMatch(prompt, /Constantinopla/);
  assertNotMatch(prompt, /fotosíntesis/);
  assertMatch(prompt, /Difícil/);
  assertNotMatch(prompt, /test@example|Lucía|qa@/i);
  const row = harness.state.tables.dream_unit_content.find((r) => r.unit_id === UNIT);
  assertEquals(row.status, "ready");
  assert(row.tokens_in > 0 && row.tokens_out > 0);
  assertEquals(harness.state.tables.dream_cards.filter((c) => c.unit_id === UNIT && c.origin === "ai").length, 10);
  // Volver a abrirla no vuelve a llamar a la IA.
  const again = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT });
  assertEquals(again.json.status, "ready");
  assertEquals(groqBodies.length, 1);
  // Sin contenido de la lección en los registros.
  assertNotMatch(logs.join("\n"), /Justiniano|Constantinopla|Alhambra|Concepto 3/);
});

Deno.test("respuesta malformada: un reintento; si vuelve a fallar, «Reintentar» y no se cobra", async () => {
  groqBodies.length = 0;
  replies = [{ json: "no es json" }, { json: { reading: { sections: [] }, quiz: [], cards: [] } }];
  const res = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT2 });
  assertEquals(res.json.status, "failed");
  assertMatch(res.json.message, /Reintentar/);
  assertEquals(groqBodies.length, 2);
  assertEquals(harness.state.tables.dream_unit_content.find((r) => r.unit_id === UNIT2).status, "failed");
  // Reintentar con una buena respuesta: lista.
  replies = [{ json: goodLesson }];
  const retry = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT2 });
  assertEquals(retry.json.status, "ready");
});

Deno.test("tope diario: sin cupo no se genera (y no se llama a la IA); una lección de otro alumno no existe", async () => {
  harness.state.tables.dream_unit_content = harness.state.tables.dream_unit_content.filter((r) => r.unit_id !== UNIT2);
  quota = { ok: false, used: 6, cap: 6, unlimited: false };
  groqBodies.length = 0;
  const res = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT2 });
  assertEquals(res.json, { status: "limit", used: 6, cap: 6 });
  assertEquals(groqBodies.length, 0);
  quota = { ok: true, used: 0, cap: 6, unlimited: false };
  const other = await call({ action: "unit_content_get", exam_id: OTHER_EXAM, unit_id: OTHER_UNIT });
  assertEquals(other.status, 404);
});

Deno.test("mini-pregunta V/F: la corrige el servidor después de contestar y guarda el progreso", async () => {
  const wrong = await call({ action: "unit_progress_save", exam_id: EXAM, unit_id: UNIT, reading_section: 2, check: { section: 1, answer: true } });
  assertEquals(wrong.status, 200, wrong.text);
  assertEquals(wrong.json.check, { correct: false, is_true: false, explanation: "Por la sección." });
  const done = await call({ action: "unit_progress_save", exam_id: EXAM, unit_id: UNIT, reading_section: 3, felt_difficulty: "bien" });
  assertEquals(done.json.ok, true);
  const p = harness.state.tables.dream_unit_progress.filter((r) => r.unit_id === UNIT);
  assertEquals(p.length, 1, "upsert, una fila");
  assertEquals(p[0].reading_section, 3);
  assert(p[0].reading_done_at);
  const bad = await call({ action: "unit_progress_save", exam_id: EXAM, unit_id: UNIT, check: { section: 9, answer: true } });
  assertEquals(bad.status, 400);
});

Deno.test("tarjetas: repaso con FSRS en el servidor, sin duplicados por review_id; crear, editar, importar y ocultar", async () => {
  const card = harness.state.tables.dream_cards.find((c) => c.unit_id === UNIT);
  Object.assign(card, { id: "77777777-7777-4777-8777-777777777777", stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 0, last_review: null, suspended: false });
  const reviewId = crypto.randomUUID();
  const first = await call({ action: "card_review", card_id: card.id, rating: 3, review_id: reviewId });
  assertEquals(first.status, 200, first.text);
  assertEquals(first.json.duplicate, false);
  assert(Date.parse(card.due) > Date.now() + 23 * 3600 * 1000, "Bien: al menos un día");
  assertEquals(card.reps, 1);
  const dup = await call({ action: "card_review", card_id: card.id, rating: 1, review_id: reviewId });
  assertEquals(dup.json.duplicate, true);
  assertEquals(card.reps, 1, "el mismo repaso no cuenta dos veces");
  assertEquals((await call({ action: "card_review", card_id: card.id, rating: 7, review_id: crypto.randomUUID() })).status, 400);

  const created = await call({ action: "card_create", exam_id: EXAM, front: "¿Capital de Bizancio?", back: "Constantinopla" });
  assertEquals(created.json.created, 1);
  assertEquals((await call({ action: "card_create", exam_id: EXAM, front: "x".repeat(301), back: "y" })).status, 400);
  assertEquals((await call({ action: "card_create", exam_id: OTHER_EXAM, front: "x", back: "y" })).status, 404);
  const imported = await call({ action: "cards_import", exam_id: EXAM, rows: [{ front: "a", back: "b" }, { front: "c", back: "d" }] });
  assertEquals(imported.json.created, 2);
  assertEquals((await call({ action: "cards_import", exam_id: EXAM, rows: Array.from({ length: 501 }, () => ({ front: "a", back: "b" })) })).status, 400);
  const own = harness.state.tables.dream_cards.find((c) => c.origin === "own");
  own.id = "88888888-8888-4888-8888-888888888888";
  const edited = await call({ action: "card_update", card_id: own.id, front: "¿Capital?", back: "Constantinopla" });
  assertEquals(edited.json.card.front, "¿Capital?");
  await call({ action: "card_report", card_id: own.id });
  assertEquals(own.suspended, true);
  assert(own.reported_at);
  await call({ action: "card_delete", card_id: own.id });
  assertEquals(harness.state.tables.dream_cards.some((c) => c.id === own.id), false);
});

Deno.test("con el flag apagado, las acciones no existen", async () => {
  Deno.env.set("DREAM_STUDY_STEPS_ENABLED", "false");
  const res = await call({ action: "cards_due" });
  assertEquals(res.status, 404);
  Deno.env.set("DREAM_STUDY_STEPS_ENABLED", "true");
});

Deno.test("IA saturada al generar: el error de Dream de siempre y la lección no queda bloqueada", async () => {
  harness.state.tables.dream_unit_content = harness.state.tables.dream_unit_content.filter((r) => r.unit_id !== UNIT2);
  replies = [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }];
  const res = await call({ action: "unit_content_get", exam_id: EXAM, unit_id: UNIT2 });
  assert(res.status >= 500 || res.json.status === "failed", res.text);
  const row = harness.state.tables.dream_unit_content.find((r) => r.unit_id === UNIT2);
  assertEquals(row.status, "failed");
  replies = [];
});

Deno.test({ name: "stop harness", fn: () => { console.log = realLog; console.error = realErr; return harness.stop(); }, sanitizeOps: false, sanitizeResources: false });
