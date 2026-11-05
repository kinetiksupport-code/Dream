// «Apuntes» (docs/APUNTES-LIMPIOS.md) contra el dream-api REAL, el Supabase
// falso del arnés y una IA simulada: primera página, caché sin gastar IA ni
// cupo, páginas siguientes en orden, fallo sin gastar cupo y solo su dueño.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const CONV = "33333333-3333-4333-8333-333333333333";
const FILE = "66666666-6666-4666-8666-666666666666";
const BAD = "77777777-7777-4777-8777-777777777777";
const para = (n) => `Apartado ${n}\nEn el año 10${n}0 el reino ${n} firmó la paz con sus vecinos del norte. Los campesinos del reino ${n} pagaban tributos al señor cada otoño. ${"Los mercados del reino crecían despacio gracias al comercio con las ciudades. ".repeat(12)}`;
const LONG = [1, 2, 3, 4].map(para).join("\n\n");

// IA simulada: copia las frases de los apuntes que recibe (fiel a sus apuntes).
const groqBodies = [];
let invent = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.groq.com/")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}"));
  groqBodies.push(body);
  const user = body.messages.find((m) => m.role === "user").content;
  const notes = /<<<\n([\s\S]*?)\n>>>/.exec(user)[1];
  const first = !/no es la primera/.test(user);
  const sections = notes.split(/\n\n/).filter((p) => p.startsWith("Apartado")).map((p) => {
    const [heading, ...rest] = p.split("\n");
    const sentences = rest.join(" ").split(/(?<=\.)\s+/).filter(Boolean);
    const unique = [...new Set(sentences)];
    return { heading, period: "", bullets: unique.map((s) => ({ term: "", text: s, quote: s })) };
  });
  const page = invent
    ? { title: "Inventado", sections: [{ heading: "Nada", period: "", bullets: [{ term: "", text: "Un dato de 1999 que no está.", quote: "una frase que no está en los apuntes" }] }], flow: [], key_idea: { text: "", quote: "" }, unreadable: [], doubts: [] }
    : { title: first ? "Los reinos" : "", sections, flow: [], key_idea: { text: "", quote: "" }, unreadable: [], doubts: [] };
  return Response.json({ choices: [{ message: { content: JSON.stringify(page) } }], usage: { prompt_tokens: 900, completion_tokens: 500 } });
};

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const counters = { scope: USER_ID, bucket: today.toISOString(), requests: 0, exams: 0 };
const rpc = new Proxy({
  dream_admit: (b) => { counters.requests++; if (b.p_operation === "test_generate") counters.exams++; return { ok: true }; },
  dream_refund_admission: (b) => { assertEquals(b.p_owner, USER_ID); counters.requests = Math.max(0, counters.requests - 1); if (b.p_exam) counters.exams = Math.max(0, counters.exams - 1); return null; },
}, { get: (t, k) => t[k] ?? (() => ({ ok: true, attempt_id: crypto.randomUUID(), added: 1 })) });
const token = makeToken({ sub: USER_ID, aal: "aal1" });
const harness = await startHarness({
  users: { [token]: goodUser() },
  patchable: true,
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01" })],
    dream_conversations: [{ id: CONV, owner_id: USER_ID, title: "x", updated_at: "2026-11-04T10:00:00Z" }],
    dream_attachments: [
      { id: FILE, owner_id: USER_ID, conversation_id: CONV, status: "processed", file_name: "reinos.md", extracted_text: LONG, created_at: "2026-11-04T10:00:00Z" },
      { id: BAD, owner_id: USER_ID, conversation_id: CONV, status: "processed", file_name: "otro.md", extracted_text: "Apartado 9\nLas abejas fabrican miel en colmenas durante la primavera.", created_at: "2026-11-04T10:01:00Z" },
    ],
    dream_messages: [], dream_clean_notes: [],
  },
  rpc,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: undefined, CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});

let notesId = "";
Deno.test("primera página: se guarda sin los apuntes, con la tarjeta y gastando un test", async () => {
  const res = await harness.call(token, { action: "notes_clean_generate", conversation_id: CONV, attachment_ids: [FILE], context: "Pásame a limpio estos apuntes." });
  assertEquals(res.status, 200, res.text);
  assertEquals(res.json.notes.done, 1);
  assert(res.json.notes.total_pages >= 2);
  assertMatch(res.json.assistant_message, /<!--DREAM_WIDGET:\{"type":"notes"/);
  notesId = res.json.notes.id;
  const row = harness.state.tables.dream_clean_notes[0];
  assertEquals(row.title, "Los reinos");
  assert(!JSON.stringify(row).includes("Los mercados del reino crecían despacio gracias al comercio con las ciudades. Los mercados"), "no guarda los apuntes enteros");
  assertMatch(row.cache_key, /^[0-9a-f]{64}$/);
  assertEquals(groqBodies.length, 1);
  assertEquals(groqBodies[0].max_tokens <= 2400, true);
  assertEquals(counters.exams, 1);
});

Deno.test("páginas siguientes: una por llamada, en orden, sin gastar cupo", async () => {
  const before = { ...counters };
  const res = await harness.call(token, { action: "notes_clean_page", notes_id: notesId });
  assertEquals(res.status, 200, res.text);
  assertEquals(res.json.notes.done, 2);
  assertMatch(groqBodies.at(-1).messages.at(-1).content, /Página 2 de \d \(no es la primera/);
  assertEquals(counters.exams, before.exams);
  assertEquals(counters.requests, before.requests);
});

Deno.test("caché: los mismos apuntes no gastan IA ni cupo", async () => {
  const calls = groqBodies.length;
  const before = { ...counters };
  const res = await harness.call(token, { action: "notes_clean_generate", conversation_id: CONV, attachment_ids: [FILE] });
  assertEquals(res.status, 200, res.text);
  assertEquals(res.json.notes.id, notesId);
  assertEquals(res.json.notes.cached, true);
  assertEquals(groqBodies.length, calls);
  assertEquals(counters.exams, before.exams);
});

Deno.test("si la IA se inventa todo: mensaje claro, nada guardado y sin gastar cupo", async () => {
  invent = true;
  try {
    const before = { ...counters };
    const rows = harness.state.tables.dream_clean_notes.length;
    const res = await harness.call(token, { action: "notes_clean_generate", conversation_id: CONV, attachment_ids: [BAD] });
    assertEquals(res.status, 422, res.text);
    assertEquals(res.json.code, "notes_invalid");
    assertEquals(harness.state.tables.dream_clean_notes.length, rows);
    assertEquals(counters.exams, before.exams);
  } finally { invent = false; }
});

Deno.test("desde la pantalla Apuntes (sin conversación) y solo para su dueño", async () => {
  const res = await harness.call(token, { action: "notes_clean_generate", attachment_ids: [BAD] });
  assertEquals(res.status, 200, res.text);
  assertEquals(res.json.assistant_message, undefined);
  const other = makeToken({ sub: "00000000-0000-4000-8000-000000000002", aal: "aal1" });
  harness.state.users[other] = goodUser("00000000-0000-4000-8000-000000000002", "otro@example.test");
  harness.state.tables.dream_profiles.push(profileRow("00000000-0000-4000-8000-000000000002", { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01" }));
  const got = await harness.call(other, { action: "notes_clean_get", notes_id: notesId });
  assertEquals(got.status, 404);
  const mine = await harness.call(token, { action: "notes_clean_get", notes_id: notesId });
  assertEquals(mine.status, 200);
  const list = await harness.call(token, { action: "dreams_list" });
  assert(list.json.dreams.some((d) => d.type === "notes" && d.id === notesId));
});

Deno.test("sin apuntes: los pide sin gastar cupo", async () => {
  const before = { ...counters };
  const res = await harness.call(token, { action: "notes_clean_generate", attachment_ids: [] });
  assertEquals(res.status, 400);
  assertEquals(res.json.code, "notes_needs_notes");
  assertEquals(counters.exams, before.exams);
});

Deno.test("cierre", async () => { await harness.stop(); });
