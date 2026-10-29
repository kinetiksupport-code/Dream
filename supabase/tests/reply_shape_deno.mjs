// Respuestas cortas garantizadas por el servidor (docs/HABLA_NATURAL.md, P2),
// con el dream-api REAL: Groq simulado en streaming y Supabase falso del arnés.
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const CONV = "88888888-8888-4888-8888-888888888888";
const CONV_REST = "99999999-9999-4999-8999-999999999999";
const sentence = (i) => `Esta es la frase número ${i} y tiene unas cuantas palabras más.`;
const LONG = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(" ");
const PLAN = '<!--DREAM_PLAN:{"tema":"fracción generatriz","pasos":["ver el tipo","quitar la coma","restar"],"paso":1}-->';

let reply = LONG;
const groqBodies = [];
let chunksRead = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    groqBodies.push(JSON.parse(String(init?.body ?? "{}")));
    // Streaming de verdad: trozos de 8 caracteres, uno por lectura.
    const parts = reply.match(/[\s\S]{1,8}/g) ?? [];
    let i = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (i < parts.length) {
          chunksRead++;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`));
        } else {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }
  return realFetch(input, init);
};
const ok = new Proxy({}, { get: () => () => ({ ok: true, attempt_id: crypto.randomUUID(), used: 0, cap: 60 }) });
const token = makeToken({ sub: USER_ID, aal: "aal1" });
const harness = await startHarness({
  users: { [token]: goodUser() },
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01" })],
    dream_conversations: [
      { id: CONV, owner_id: USER_ID, title: "x", board: null },
      { id: CONV_REST, owner_id: USER_ID, title: "y", board: { v: 1, rest: `${sentence(50)} ${sentence(51)}` } },
    ],
    dream_messages: [],
    dream_learning_topics: [], dream_exams: [],
  },
  rpc: ok,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: undefined, TAVILY_API_KEY_2: undefined, CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});

/** Texto que ve el alumno (deltas unidos). */
const shown = (text) => text.trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.type === "delta").map((e) => e.text).join("");
const words = (t) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const boardPatches = () => harness.requests.filter((r) => r.method === "PATCH" && r.path === "/rest/v1/dream_conversations" && r.body?.board);

Deno.test("a long answer is cut at 120 words in a full sentence, generation stops and the rest is kept", async () => {
  reply = LONG;
  groqBodies.length = 0;
  chunksRead = 0;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "cuéntame cosas de tu día" });
  assertEquals(res.status, 200, res.text);
  const text = shown(res.text);
  assert(words(text) <= 121, `${words(text)} palabras`);
  assertMatch(text, /más\.\n\n¿Sigo\?$/);
  assertMatch(res.text, /"type":"complete"/);
  // Groq stopped being read soon after the limit: not the whole answer.
  assert(chunksRead < LONG.length / 8, `${chunksRead} trozos leídos`);
  // The saved message is what the student saw; the rest is in the board.
  const saved = harness.state.tables.dream_messages.filter((m) => m.conversation_id === CONV && m.role === "assistant").at(-1);
  assertEquals(saved.content, text);
  const board = boardPatches().at(-1).body.board;
  assert(board.rest.startsWith(sentence(11)), board.rest.slice(0, 30));
  // The style reminder goes right before the student's message.
  const messages = groqBodies[0].messages;
  assertEquals(messages.at(-1).role, "user");
  assertMatch(messages.at(-2).content, /^Recuerda: unas 80 palabras/);
  // Short output cap for a normal chat turn.
  assertEquals(groqBodies[0].max_tokens, 800);
});

Deno.test("«sí» after «¿Sigo?» gets the rest without calling the AI", async () => {
  groqBodies.length = 0;
  const before = harness.requests.length;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV_REST, prompt: "sí, sigue" });
  assertEquals(res.status, 200, res.text);
  assertEquals(shown(res.text), `${sentence(50)} ${sentence(51)}`);
  assertEquals(groqBodies.length, 0);
  assert(!harness.requests.slice(before).some((r) => r.path.startsWith("/rest/v1/rpc/dream_ai_window")), "no gasta del límite");
  assertEquals(boardPatches().at(-1).body.board.rest, "");
});

Deno.test("the hidden plan never reaches the student and is saved; Chinese characters are removed", async () => {
  reply = `Vale, vamos uno a uno 因为. ¿Qué cifra se repite?\n${PLAN}`;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "cómo saco la fracción generatriz de 1,2333" });
  assertEquals(res.status, 200, res.text);
  const text = shown(res.text);
  assertEquals(text.trim(), "Vale, vamos uno a uno. ¿Qué cifra se repite?");
  assertNotMatch(res.text, /DREAM_PLAN|因为/);
  const board = boardPatches().at(-1).body.board;
  assertEquals(board.plan.tema, "fracción generatriz");
  assertEquals(board.plan.paso, 1);
});

Deno.test({ name: "stop harness", fn: () => harness.stop(), sanitizeOps: false, sanitizeResources: false });
