// Cuentas de Fundación Loyola con el dream-api REAL (Supabase falso del arnés,
// Groq simulado): bienvenida una vez, sin ventana de 5 horas y nada del correo
// ni del dominio hacia la IA.
import { assert, assertEquals, assertNotMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const LOYOLA = "00000000-0000-4000-8000-0000000000aa";
const NORMAL = "00000000-0000-4000-8000-0000000000bb";
const CONV = "22222222-2222-4222-8222-222222222222";
const groqBodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    groqBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Vale." } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\ndata: [DONE]\n\n`);
  }
  return realFetch(input, init);
};

const rpcCalls = [];
let welcomeShown = null;
const rpc = new Proxy({}, {
  get: (_t, name) => (args) => {
    rpcCalls.push(String(name));
    if (name === "dream_special_account_mark") return { special: args.p_domain === "fundacionloyola.net", welcome_shown_at: welcomeShown };
    if (name === "dream_ai_usage") return { window: null, usage: [] };
    return { ok: true, attempt_id: crypto.randomUUID() };
  },
});
const loyolaToken = makeToken({ sub: LOYOLA, aal: "aal1" });
const normalToken = makeToken({ sub: NORMAL, aal: "aal1" });
const profile = (id) => profileRow(id, { terms_version: TERMS_VERSION, onboarding_completed: true, nickname: "Luis", birth_date: "2000-01-01" });
const harness = await startHarness({
  users: { [loyolaToken]: goodUser(LOYOLA, "luis@fundacionloyola.net"), [normalToken]: goodUser(NORMAL, "ana@gmail.com") },
  tables: {
    dream_profiles: [profile(LOYOLA), profile(NORMAL)],
    dream_conversations: [{ id: CONV, owner_id: LOYOLA, title: "x" }, { id: CONV, owner_id: NORMAL, title: "x" }],
    dream_messages: [], dream_learning_topics: [], dream_exams: [],
  },
  rpc,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: undefined, CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});

Deno.test("a Loyola account gets the welcome once, and an ordinary account never", async () => {
  const first = await harness.call(loyolaToken, { action: "profile" });
  assertEquals(first.json.special_account, { unlimited: true, welcome: "Eres alumno de Fundación Loyola: no tienes límite de uso en Dream." });
  welcomeShown = "2026-10-26T10:00:00Z";
  assertEquals((await harness.call(loyolaToken, { action: "profile" })).json.special_account.welcome, null);
  const other = await harness.call(normalToken, { action: "profile" });
  assertEquals(other.json.special_account, undefined);
  assertEquals((await harness.call(normalToken, { action: "special_welcome_seen" })).status, 400);
});

Deno.test("a Loyola chat has no 5-hour window, and neither the email nor the domain reaches the AI", async () => {
  rpcCalls.length = 0; groqBodies.length = 0;
  const res = await harness.call(loyolaToken, { action: "chat", conversation_id: CONV, prompt: "hola" });
  assertEquals(res.status, 200, res.text);
  assert(!rpcCalls.includes("dream_ai_window_charge"), rpcCalls.join(","));
  assert(rpcCalls.includes("dream_admit"), "el límite por minuto lo pone dream_admit");
  for (const body of groqBodies) assertNotMatch(JSON.stringify(body), /fundacionloyola|luis@/i);
  const usage = await harness.call(loyolaToken, { action: "ai_usage" });
  assertEquals([usage.json.unlimited, usage.json.blocked, usage.json.messages_left], [true, false, null]);
});

Deno.test("an ordinary chat still goes through the 5-hour window", async () => {
  rpcCalls.length = 0;
  const res = await harness.call(normalToken, { action: "chat", conversation_id: CONV, prompt: "hola" });
  assertEquals(res.status, 200, res.text);
  assert(rpcCalls.includes("dream_ai_window_charge"));
  assert(!rpcCalls.includes("dream_special_account_mark"));
});

Deno.test({ name: "stop harness", fn: () => harness.stop(), sanitizeOps: false, sanitizeResources: false });
