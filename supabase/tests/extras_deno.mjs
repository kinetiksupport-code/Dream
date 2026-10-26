// Ahorro sin IA y «Descargar mis datos», con el dream-api REAL (Groq simulado,
// Supabase falso del arnés).
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const CONV = "66666666-6666-4666-8666-666666666666";
const OTHER = "00000000-0000-4000-8000-0000000000ff";
const groqBodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    groqBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Vale." } }] })}\n\ndata: [DONE]\n\n`);
  }
  return realFetch(input, init);
};
const ok = new Proxy({}, { get: () => () => ({ ok: true, attempt_id: crypto.randomUUID(), used: 0, cap: 60 }) });
const token = makeToken({ sub: USER_ID, aal: "aal1" });
const older = Array.from({ length: 30 }, (_, i) => ({ conversation_id: CONV, owner_id: USER_ID, role: i % 2 ? "assistant" : "user", content: i % 2 ? "respuesta" : `pregunta antigua ${i}`, created_at: `2026-10-26T10:${String(i).padStart(2, "0")}:00Z` }));
const harness = await startHarness({
  users: { [token]: goodUser() },
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01" })],
    dream_conversations: [{ id: CONV, owner_id: USER_ID, title: "x" }],
    dream_messages: [...older, { conversation_id: "77777777-7777-4777-8777-777777777777", owner_id: OTHER, role: "user", content: "secreto de otro" }],
    dream_learning_topics: [], dream_exams: [],
  },
  rpc: ok,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: undefined, CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});

Deno.test("a question about how to use Dream gets a fixed answer, without the AI", async () => {
  groqBodies.length = 0;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "¿dónde subo mis apuntes?" });
  assertEquals(res.status, 200, res.text);
  assertMatch(res.text, /Apuntes/);
  assertMatch(res.text, /"type":"complete"/);
  assertEquals(groqBodies.length, 0);
  assert(!harness.requests.some((r) => r.path === "/rest/v1/rpc/dream_ai_window_charge"), "no gasta del límite");
});

Deno.test("a long chat: older questions go as a short summary; every 5 turns, a reminder", async () => {
  groqBodies.length = 0;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "y ahora otra cosa" });
  assertEquals(res.status, 200, res.text);
  const system = JSON.stringify(groqBodies[0].messages.filter((m) => m.role === "system"));
  assertMatch(system, /Antes, en esta misma conversación, el alumno preguntó/);
  assertMatch(system, /pregunta antigua/);
});

Deno.test("«Descargar mis datos» returns only the student's own rows", async () => {
  const res = await harness.call(token, { action: "data_export" });
  assertEquals(res.status, 200, res.text);
  assert(res.json.data.tablas.dream_messages.length >= 30);
  assertNotMatch(res.text, /secreto de otro/);
  assertEquals(res.json.data.perfil.id, USER_ID);
  // A second one within a minute waits.
  assertEquals((await harness.call(token, { action: "data_export" })).status, 429);
});

Deno.test({ name: "stop harness", fn: () => harness.stop(), sanitizeOps: false, sanitizeResources: false });
