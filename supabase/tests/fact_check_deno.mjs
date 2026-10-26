// «Si no lo sabes, búscalo» (Bloque 2 bis), con el dream-api REAL: Groq y
// Tavily simulados (nada sale de la máquina), Supabase falso del arnés.
// Comprueba que el servidor lanza la búsqueda él, que la consulta que sale
// hacia Tavily no lleva datos del alumno y que, sin cupo, no se busca y se
// le dice a la IA que no puede comprobarlo.
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";
import { TERMS_VERSION } from "../functions/dream-api/onboarding.mjs";
import { USER_ID, goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const CONV = "11111111-1111-4111-8111-111111111111";
const groqBodies = [];
const tavilyQueries = [];
let planQuery = "Lucía Pérez lucia@example.com fracción generatriz decimal periódico";

const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.groq.com/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    groqBodies.push(body);
    if (body.tool_choice === "required")
      return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: planQuery }) } }] } }] },
        { choices: [], usage: { prompt_tokens: 400, completion_tokens: 30, total_tokens: 430 } }]);
    return sse([{ choices: [{ delta: { content: "Vale, {{APODO}}. Mira este decimal: ¿cuántas cifras se repiten?" } }] },
      { choices: [], usage: { prompt_tokens: 1400, completion_tokens: 40, total_tokens: 1440 } }]);
  }
  if (url.startsWith("https://api.tavily.com/")) {
    tavilyQueries.push(JSON.parse(String(init?.body ?? "{}")).query);
    return Response.json({ results: [{ title: "Fracción generatriz", url: "https://example.edu/generatriz", content: "Numerador: el número sin coma menos la parte anterior al periodo." }] });
  }
  return realFetch(input, init);
};

// Cualquier RPC de admisión, ventana o reserva responde «ok».
const okRpc = new Proxy({}, {
  get: (_t, name) => name === "dream_forced_search_budget" ? () => budget : () => ({ ok: true, attempt_id: crypto.randomUUID(), lease_id: crypto.randomUUID(), windows: [], used: 0 }),
});
let budget = { used: 3, cap: 60 };

const token = makeToken({ sub: USER_ID, aal: "aal1" });
const harness = await startHarness({
  users: { [token]: goodUser() },
  tables: {
    dream_profiles: [profileRow(USER_ID, { terms_version: TERMS_VERSION, nickname: "Lucía", display_name: "Lucía Pérez", interests: ["fútbol"], onboarding_completed: true, birth_date: "2000-01-01", age_band: "18_plus" })],
    dream_conversations: [{ id: CONV, owner_id: USER_ID, title: "x" }],
    dream_messages: [],
    dream_learning_topics: [],
  },
  rpc: okRpc,
  env: { GROQ_API_KEY_1: "gsk_test_key", TAVILY_API_KEY_1: "tvly-test", CLOUDFLAREAI_API_KEY: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
});

async function chat(prompt) {
  groqBodies.length = 0; tavilyQueries.length = 0;
  const res = await harness.call(token, { action: "chat", conversation_id: CONV, prompt });
  return res;
}

Deno.test("an «explícame» question triggers the search on the server, with a clean query", async () => {
  const res = await chat("explícame la fracción generatriz");
  assertEquals(res.status, 200, res.text);
  assertEquals(groqBodies[0].tool_choice, "required", "el servidor fuerza la búsqueda");
  assertEquals(tavilyQueries.length, 1);
  assertEquals(tavilyQueries[0], "fracción generatriz decimal periódico");
  // El apodo llega al alumno, nunca al proveedor.
  assertMatch(res.text, /Vale, Lucía\./);
  for (const body of groqBodies) assertNotMatch(JSON.stringify(body), /Lucía|lucia@example/);
  // La segunda llamada lleva la capa de no inventar.
  assertMatch(JSON.stringify(groqBodies[1].messages), /NO INVENTES/);
});

Deno.test("a greeting is not checked and gets no search", async () => {
  const res = await chat("hola!");
  assertEquals(res.status, 200, res.text);
  assertEquals(tavilyQueries.length, 0);
  assert(groqBodies.every((b) => b.tool_choice !== "required"));
});

Deno.test("without daily search budget the AI is told it cannot check, and nothing is searched", async () => {
  budget = { used: 60, cap: 60 };
  try {
    const res = await chat("¿quién escribió La Regenta?");
    assertEquals(res.status, 200, res.text);
    assertEquals(tavilyQueries.length, 0);
    assert(groqBodies.every((b) => b.tool_choice !== "required"));
    assertMatch(JSON.stringify(groqBodies[0].messages), /no has podido comprobarlo/);
    assertMatch(res.text, /La búsqueda web no está disponible/);
  } finally { budget = { used: 3, cap: 60 }; }
});

Deno.test("a pasted statement never reaches the search engine whole", async () => {
  planQuery = "un tren sale de Valladolid a 90 km/h y otro sale de Madrid a 110 km/h por la misma vía";
  try {
    const res = await chat("Deberes: un tren sale de Valladolid a 90 km/h y otro sale de Madrid a 110 km/h por la misma vía, ¿cuándo se cruzan? explícame cómo se hace");
    assertEquals(res.status, 200, res.text);
    assertEquals(tavilyQueries.length, 1);
    assert(tavilyQueries[0].split(" ").length <= 6, tavilyQueries[0]);
  } finally { planQuery = "fracción generatriz"; }
});

Deno.test({ name: "stop harness", fn: () => harness.stop(), sanitizeOps: false, sanitizeResources: false });
