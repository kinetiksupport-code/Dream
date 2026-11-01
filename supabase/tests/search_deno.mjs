// Búsqueda por fecha, a fondo y «si no lo sabe, que lo busque»
// (docs/HABLA_NATURAL.md, «Búsqueda»), con el dream-api REAL: Groq y Tavily
// simulados (nada sale de la máquina) y Supabase falso del arnés.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const CONV = "77777777-7777-4777-8777-777777777777";
const groqBodies = [];
const tavilyBodies = [];
let firstReply = "";
let toolArgs = null;
let tavilyResults = [];

const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    groqBodies.push(body);
    const answering = body.messages.some((m) => m.role === "tool");
    if (!answering && toolArgs && body.tools)
      return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "web_search", arguments: JSON.stringify(toolArgs) } }] } }] }]);
    const text = answering ? "Según una noticia del 30 de octubre, el lanzamiento salió bien. ¿Quieres saber qué estudia?" : firstReply;
    return sse([{ choices: [{ delta: { content: text } }] }]);
  }
  if (url.startsWith("https://api.tavily.com/")) {
    tavilyBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return Response.json({ results: tavilyResults });
  }
  return realFetch(input, init);
};
const rpc = new Proxy({}, { get: (_t, name) => name === "dream_forced_search_budget" ? () => ({ used: 1, cap: 60 }) : () => ({ ok: true, attempt_id: crypto.randomUUID(), lease_id: crypto.randomUUID(), windows: [], used: 0 }) });
const token = makeToken({ sub: USER_ID, aal: "aal1" });
const harness = await startHarness({
  users: { [token]: goodUser() },
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, onboarding_completed: true, birth_date: "2000-01-01" })],
    dream_conversations: [{ id: CONV, owner_id: USER_ID, title: "x", board: null }],
    dream_messages: [], dream_learning_topics: [], dream_exams: [],
  },
  rpc,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: "tvly-test", CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});
const shown = (text) => text.trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.type === "delta").map((e) => e.text).join("");
const item = (n, date) => ({ title: `Resultado ${n}`, url: `https://example.org/${n}`, content: `Texto ${n}.`, ...(date ? { published_date: date } : {}) });
const reset = () => { groqBodies.length = 0; tavilyBodies.length = 0; };

Deno.test("news: the search goes by date first (topic news, this week) and the newest result comes first", async () => {
  reset();
  toolArgs = { query: "lanzamiento cohete Ariane" };
  tavilyResults = [item(1, "2026-10-20"), item(2, "2026-10-30"), item(3)];
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "busca las noticias del lanzamiento del cohete Ariane" });
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyBodies.length, 1);
  assertEquals(tavilyBodies[0].topic, "news");
  assertEquals(tavilyBodies[0].time_range, "week");
  assertEquals(tavilyBodies[0].include_published_date, true);
  assertEquals(tavilyBodies[0].include_domains, undefined);
  // Today's date goes to the planner and to the answer.
  assert(groqBodies[0].messages.some((m) => /^Hoy es \d{4}-\d{2}-\d{2}\.$/.test(m.content)));
  const tool = groqBodies.at(-1).messages.find((m) => m.role === "tool").content;
  const sent = JSON.parse(tool);
  assertEquals(sent.map((r) => r.date ?? null), ["2026-10-30", "2026-10-20", null]);
  assertMatch(shown(res.text), /30 de octubre/);
});

Deno.test("a lot of information: deep search (advanced, 5 results)", async () => {
  reset();
  toolArgs = { query: "causas y consecuencias revolución francesa" };
  tavilyResults = [1, 2, 3, 4, 5, 6].map((n) => item(n));
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "investiga a fondo las causas y consecuencias de la revolución francesa" });
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyBodies[0].search_depth, "advanced");
  assertEquals(tavilyBodies[0].max_results, 5);
  assertEquals(JSON.parse(groqBodies.at(-1).messages.find((m) => m.role === "tool").content).length, 5);
});

Deno.test("few results: a second, wider search (more sites, no date window)", async () => {
  reset();
  toolArgs = { query: "premio nobel química hoy" };
  tavilyResults = [item(9, "2026-10-08")];
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "busca quién ha ganado hoy el nobel de química" });
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyBodies.length, 2);
  assertEquals(tavilyBodies[0].time_range, "day");
  assertEquals(tavilyBodies[1].time_range, undefined);
  assertEquals(tavilyBodies[1].topic, undefined);
  assertEquals(tavilyBodies[1].include_domains, undefined);
});

Deno.test("if the AI says it does not know and did not search, the server searches and answers with the results", async () => {
  reset();
  toolArgs = null;
  firstReply = "No lo sé con seguridad, mis datos pueden estar viejos.";
  tavilyResults = [item(1, "2026-10-30"), item(2, "2026-10-29")];
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "qué misión espacial europea despegó en octubre" });
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyBodies.length, 1);
  const text = shown(res.text);
  assert(!/No lo sé con seguridad/.test(text), text);
  assertMatch(text, /30 de octubre/);
  assertMatch(res.text, /"activity":"searching"/);
  // The doubtful first answer is not passed on as the assistant's words.
  const assistant = groqBodies.at(-1).messages.find((m) => m.tool_calls);
  assertEquals(assistant.content, null);
});

Deno.test("a sure answer does not search", async () => {
  reset();
  toolArgs = null;
  firstReply = "A ver, el sujeto concuerda con el verbo. ¿Cuál es el verbo aquí?";
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt: "ayúdame con el sujeto de «Los niños juegan»" });
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyBodies.length, 0);
});

Deno.test({ name: "stop harness", fn: () => harness.stop(), sanitizeOps: false, sanitizeResources: false });
