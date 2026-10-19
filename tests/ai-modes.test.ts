// Modos de IA (Parte G) y respaldo con Cloudflare (Parte H). Sin llamadas
// reales: todos los proveedores y la base de datos son simulados.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_FLAGS,
  CLOUDFLARE_MODEL,
  DEFAULT_MODE,
  MODES,
  WINDOW_MS,
  aiContextFor,
  availableModes,
  fallbackAvailable,
  modeAvailable,
  outputTokensFor,
  resolveMode,
} from "../supabase/functions/dream-api/models.mjs";
import {
  WINDOW_LIMIT_CODE,
  actualTokens,
  createWindowLimiter,
  estimateWindowTokens,
  modeBlocked,
  percentUsed,
  usageSummary,
  windowState,
} from "../supabase/functions/dream-api/usage-window.mjs";
import {
  createAttemptTracker,
  shouldFallback,
  streamWithFallback,
} from "../supabase/functions/dream-api/ai-router.mjs";
import {
  CloudflareProviderError,
  cloudflareEndpoint,
  createCloudflareProvider,
  secondsToUtcMidnight,
} from "../supabase/functions/dream-api/cloudflare.mjs";
import {
  GroqProviderError,
  createGroqProviderManager,
} from "../supabase/functions/dream-api/groq.mjs";
import { AdmissionError } from "../supabase/functions/dream-api/admission.mjs";
import { alternativeMode, parseUsage, pickMode } from "../lib/ai-modes";
import {
  COMMON_RULES,
  DREAM_SYSTEM_PROMPT,
  MODE_SYSTEM_PROMPTS,
  chatSystemMessages,
  systemPromptFor,
} from "../supabase/functions/dream-api/prompts.mjs";

type Chunk = { choices: { delta: { content?: string } }[] };
const logger = { ...console, log: () => {} };
const T0 = Date.parse("2026-10-16T10:00:00Z");
const HOUR = 3600_000;
const cfEnv = (name: string) =>
  (
    ({
      CLOUDFLAREAI_API_KEY: "synthetic-cloudflare-token-0123456789",
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    }) as Record<string, string>
  )[name];
const groqEnv = (name: string) =>
  (
    ({
      GROQ_API_KEY_1: "synthetic-one",
      GROQ_API_KEY_2: "synthetic-two",
      GROQ_API_KEY_3: "synthetic-three",
      GROQ_API_KEY_4: "synthetic-four",
    }) as Record<string, string>
  )[name];
const sse = (...texts: string[]) =>
  new Response(
    texts
      .map(
        (t) =>
          `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`,
      )
      .join("") +
      `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
async function collect(stream: AsyncIterable<Chunk>) {
  let text = "";
  for await (const c of stream) text += c?.choices?.[0]?.delta?.content ?? "";
  return text;
}

// ---------------------------------------------------------------- Modos
const OFF = { thinkMode: false, cloudflareFallback: false };
const cfOn = () => createCloudflareProvider({ getEnv: cfEnv, logger });
const cfOff = () => createCloudflareProvider({ getEnv: () => undefined, logger });

test("flags are on in the code: «Pensar más» and the fallback only need the Cloudflare secrets", () => {
  assert.equal(DEFAULT_MODE, "normal");
  assert.equal(AI_FLAGS.thinkMode, true);
  assert.equal(AI_FLAGS.cloudflareFallback, true);
  assert.deepEqual(aiContextFor(cfOn()), { flags: AI_FLAGS, cloudflareConfigured: true });
  assert.deepEqual(aiContextFor(cfOff()), { flags: AI_FLAGS, cloudflareConfigured: false });
  assert.deepEqual(
    availableModes(aiContextFor(cfOn())).map((m) => m.id),
    ["fast", "normal", "think"],
  );
  assert.equal(resolveMode(undefined)?.id, "normal");
  assert.equal(resolveMode("fast")?.id, "fast");
  assert.equal(resolveMode("think", aiContextFor(cfOn()))?.id, "think");
  assert.equal(resolveMode("turbo", aiContextFor(cfOn())), null);
  // A flag switched off in the code still hides «Pensar más», even with secrets.
  assert.deepEqual(
    availableModes({ flags: OFF, cloudflareConfigured: true }).map((m) => m.id),
    ["fast", "normal"],
  );
  assert.equal(resolveMode("think", { flags: OFF, cloudflareConfigured: true }), null);
  for (const m of availableModes(aiContextFor(cfOn())))
    assert.doesNotMatch(m.label, /llama|qwen|mistral|groq|cloudflare/i);
});

test("each mode maps to one provider and model in the single config", () => {
  assert.equal(MODES.fast.provider, "groq");
  assert.equal(MODES.fast.model, "llama-3.1-8b-instant");
  assert.equal(MODES.normal.provider, "groq");
  assert.equal(MODES.normal.model, "qwen/qwen3.8-27b");
  assert.equal(MODES.think.provider, "cloudflare");
  assert.equal(MODES.think.model, CLOUDFLARE_MODEL);
  for (const m of Object.values(MODES)) assert.ok(m.budgetTokens > 0);
  assert.ok(MODES.fast.maxOutputTokens < MODES.normal.maxOutputTokens);
  assert.equal(outputTokensFor(MODES.fast, "¿Qué es un átomo?"), 500);
  assert.equal(
    outputTokensFor(MODES.normal, "Hazme un resumen del tema"),
    2048,
  );
});

test("without Cloudflare secrets the fallback and «Pensar más» switch off silently", () => {
  const off = cfOff();
  assert.equal(off.configured(), false);
  const bad = createCloudflareProvider({
    getEnv: (n: string) =>
      n === "CLOUDFLARE_ACCOUNT_ID" ? "not-an-id" : "x".repeat(40),
    logger,
  });
  assert.equal(bad.configured(), false);
  const onlyKey = createCloudflareProvider({
    getEnv: (n: string) => (n === "CLOUDFLAREAI_API_KEY" ? cfEnv(n) : undefined),
    logger,
  });
  assert.equal(onlyKey.configured(), false);
  for (const provider of [off, bad, onlyKey]) {
    const ctx = aiContextFor(provider);
    assert.equal(modeAvailable("think", ctx), false);
    assert.equal(resolveMode("think", ctx), null); // chat answers 400 mode_unavailable
    assert.equal(fallbackAvailable(MODES.fast, ctx), false);
    assert.equal(fallbackAvailable(MODES.normal, ctx), false);
    // Rápido and Normal keep working exactly as before.
    assert.equal(resolveMode("fast", ctx)?.provider, "groq");
    assert.equal(resolveMode(undefined, ctx)?.id, "normal");
  }
  assert.equal(fallbackAvailable(MODES.normal, aiContextFor(cfOn())), true);
  assert.equal(fallbackAvailable(MODES.fast, aiContextFor(cfOn())), true);
  // Flag off in the code: no fallback even with secrets.
  assert.equal(
    fallbackAvailable(MODES.normal, { flags: OFF, cloudflareConfigured: true }),
    false,
  );
  // «Pensar más» never falls back.
  assert.equal(fallbackAvailable(MODES.think, aiContextFor(cfOn())), false);
});

test("ai_usage → web: the browser learns about «Pensar más» only from the modes the server lists", () => {
  // Same steps as dream-api `ai_usage` (availableModes(aiContextFor(cloudflareProvider)))
  // followed by the web's parser (lib/ai-modes.ts).
  const served = (provider: ReturnType<typeof createCloudflareProvider>) => ({
    ...usageSummary({}, { now: T0, modes: availableModes(aiContextFor(provider)) }),
    default_mode: DEFAULT_MODE,
  });
  const withSecrets = parseUsage(JSON.parse(JSON.stringify(served(cfOn()))));
  assert.deepEqual(withSecrets.modes.map((m) => m.id), ["fast", "normal", "think"]);
  assert.equal(withSecrets.modes.find((m) => m.id === "think")?.label, "Pensar más");
  assert.equal(pickMode(withSecrets, "think"), "think");

  const without = parseUsage(JSON.parse(JSON.stringify(served(cfOff()))));
  assert.deepEqual(without.modes.map((m) => m.id), ["fast", "normal"]);
  // A device that remembered «Pensar más» goes back to Normal, never sends «think».
  assert.equal(pickMode(without, "think"), "normal");
  assert.equal(alternativeMode(without, "normal")?.id, "fast");
  // The payload never names a provider, a model or a secret.
  for (const body of [served(cfOn()), served(cfOff())])
    assert.doesNotMatch(
      JSON.stringify(body),
      /llama|qwen|mistral|groq|cloudflare|@cf|api_key|account/i,
    );
});

// ------------------------------------------------------- Ventana de 5 h
test("5-hour window: opens with a start, expires after five hours, and no window means 0 %", () => {
  assert.equal(WINDOW_MS, 5 * HOUR);
  assert.deepEqual(windowState(null, T0), {
    open: false,
    startedAt: null,
    endsAt: null,
  });
  const row = {
    started_at: new Date(T0).toISOString(),
    ends_at: new Date(T0 + 5 * HOUR).toISOString(),
  };
  assert.equal(windowState(row, T0 + HOUR).open, true);
  assert.equal(windowState(row, T0 + 5 * HOUR - 1).open, true);
  assert.equal(windowState(row, T0 + 5 * HOUR).open, false);
  const empty = usageSummary(
    { window: null, usage: [] },
    { now: T0, modes: availableModes() },
  );
  assert.equal(empty.window, null);
  assert.ok(
    empty.modes.every(
      (m) => m.percent === 0 && !m.blocked && m.resets_at === null,
    ),
  );
  // Usage rows from an expired window count as nothing.
  const expired = usageSummary(
    { window: row, usage: [{ mode: "normal", kind: "mode", tokens: 99999 }] },
    { now: T0 + 6 * HOUR, modes: availableModes() },
  );
  assert.ok(expired.modes.every((m) => m.percent === 0 && !m.blocked));
});

test("percentages are whole numbers and only reach 100 when the mode is spent", () => {
  assert.equal(percentUsed(0, 40000), 0);
  assert.equal(percentUsed(25200, 40000), 63);
  assert.equal(percentUsed(39999, 40000), 99);
  assert.equal(percentUsed(40000, 40000), 100);
  assert.equal(percentUsed(90000, 40000), 100);
  assert.equal(modeBlocked(39999, 40000), false);
  assert.equal(modeBlocked(40000, 40000), true);
});

test("a spent mode is blocked until the window ends; the others keep going and fallback use is not counted", () => {
  const row = {
    started_at: new Date(T0).toISOString(),
    ends_at: new Date(T0 + 5 * HOUR).toISOString(),
  };
  const summary = usageSummary(
    {
      window: row,
      usage: [
        { mode: "normal", kind: "mode", tokens: MODES.normal.budgetTokens },
        { mode: "fast", kind: "mode", tokens: MODES.fast.budgetTokens * 0.85 },
        { mode: "fast", kind: "fallback", tokens: 10 ** 9 },
      ],
    },
    { now: T0 + 2 * HOUR, modes: availableModes() },
  );
  const normal = summary.modes.find((m) => m.id === "normal")!;
  const fast = summary.modes.find((m) => m.id === "fast")!;
  assert.equal(normal.percent, 100);
  assert.equal(normal.blocked, true);
  assert.equal(normal.resets_at, new Date(T0 + 5 * HOUR).toISOString());
  assert.equal(fast.percent, 85);
  assert.equal(fast.blocked, false);
  assert.ok(!("tokens" in normal));
  assert.equal(JSON.stringify(summary).includes(MODES.normal.model), false);
});

test("window charges go through one atomic RPC and blocked modes surface as dream_mode_limit", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "dream_ai_window_charge" && args.p_mode === "normal")
        return {
          data: {
            ok: false,
            status: 429,
            code: WINDOW_LIMIT_CODE,
            retry_after: 7800,
          },
          error: null,
        };
      return { data: { ok: true }, error: null };
    },
  };
  const limiter = createWindowLimiter(db, "owner");
  const charge = await limiter.charge({
    mode: "fast",
    kind: "mode",
    provider: "groq",
    tokens: 1234.2,
  });
  assert.equal(calls[0].name, "dream_ai_window_charge");
  assert.equal(calls[0].args.p_tokens, 1235);
  assert.equal(calls[0].args.p_budget, MODES.fast.budgetTokens);
  await charge.settle(300);
  await charge.settle(999); // idempotent
  assert.equal(
    calls.filter((c) => c.name === "dream_ai_window_settle").length,
    1,
  );
  await assert.rejects(
    limiter.charge({
      mode: "normal",
      kind: "mode",
      provider: "groq",
      tokens: 10,
    }),
    (e: unknown) =>
      e instanceof AdmissionError &&
      e.code === WINDOW_LIMIT_CODE &&
      e.status === 429 &&
      e.retryAfter === 7800,
  );
  // RPC missing (migration not applied): fail closed, never skip the limit.
  const broken = createWindowLimiter(
    { rpc: async () => ({ data: null, error: { message: "missing" } }) },
    "owner",
  );
  await assert.rejects(
    broken.read(),
    (e: unknown) =>
      e instanceof AdmissionError && e.code === "admission_unavailable",
  );
});

test("token estimate and actual usage", () => {
  const body = {
    messages: [{ role: "user", content: "x".repeat(350) }],
    max_tokens: 500,
  };
  assert.equal(estimateWindowTokens(body), 100 + 4 + 500);
  assert.equal(actualTokens({ prompt_tokens: 90, completion_tokens: 10 }), 100);
  assert.equal(actualTokens(null), null);
});

// ---------------------------------------------- Proveedor y respaldo
test("fallback only for Groq failures that leave no text: 5xx, 429 on every key, outage or a stored pause", () => {
  assert.equal(
    shouldFallback(
      new GroqProviderError("all_keys_cooling_down", {
        status: 503,
        retryable: true,
      }),
    ),
    true,
  );
  assert.equal(
    shouldFallback(
      new GroqProviderError("provider_rate_limit", { status: 429 }),
    ),
    true,
  );
  assert.equal(
    shouldFallback(
      new GroqProviderError("provider_daily_limit", { status: 429 }),
    ),
    true,
  );
  assert.equal(
    shouldFallback(
      new GroqProviderError("http_500", { status: 500, retryable: true }),
    ),
    true,
  );
  assert.equal(
    shouldFallback(
      new GroqProviderError("network_or_timeout", { retryable: true }),
    ),
    true,
  );
  assert.equal(
    shouldFallback(new AdmissionError("provider_rate_limit", 429, 30)),
    true,
  );
  assert.equal(
    shouldFallback(
      new GroqProviderError("stream_interrupted", { emittedContent: true }),
    ),
    false,
  );
  assert.equal(shouldFallback(new GroqProviderError("aborted")), false);
  assert.equal(
    shouldFallback(new GroqProviderError("http_400", { status: 400 })),
    false,
  );
  assert.equal(
    shouldFallback(new AdmissionError("dream_mode_limit", 429, 30)),
    false,
  );
  assert.equal(
    shouldFallback(new AdmissionError("dream_budget", 429, 30)),
    false,
  );
});

test("Groq goes first; when every key fails Cloudflare answers before the queue", async () => {
  const groqCalls: string[] = [];
  const groq = createGroqProviderManager({
    getEnv: groqEnv,
    logger,
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      groqCalls.push(
        String((init?.headers as Record<string, string>).Authorization),
      );
      return new Response("{}", { status: 503 });
    },
  });
  let cfUrl = "";
  const cloudflare = createCloudflareProvider({
    getEnv: cfEnv,
    logger,
    fetchImpl: async (url: string | URL | Request) => {
      cfUrl = String(url);
      return sse("Pista: ", "¿qué ocurre si despejas x?");
    },
  });
  const providers: string[] = [];
  const beforeAttempt = async (p: string) => {
    providers.push(p);
  };
  let fellBack = false;
  const text = await collect(
    streamWithFallback({
      primary: () =>
        groq.stream({ body: { model: MODES.normal.model }, beforeAttempt }),
      fallback: () =>
        cloudflare.stream({ body: { model: CLOUDFLARE_MODEL }, beforeAttempt }),
      onFallback: () => (fellBack = true),
    }),
  );
  assert.equal(text, "Pista: ¿qué ocurre si despejas x?");
  assert.equal(fellBack, true);
  assert.equal(groqCalls.length, 4); // every Groq key tried once, then Cloudflare
  assert.deepEqual(providers, ["groq", "groq", "groq", "groq", "cloudflare"]);
  assert.equal(cfUrl, cloudflareEndpoint("0123456789abcdef0123456789abcdef"));
});

test("a Groq 429 stops at the first key (no rotating organisations) and then tries Cloudflare", async () => {
  let groqCalls = 0;
  const groq = createGroqProviderManager({
    getEnv: groqEnv,
    logger,
    fetchImpl: async () => {
      groqCalls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "20" },
      });
    },
  });
  const cloudflare = createCloudflareProvider({
    getEnv: cfEnv,
    logger,
    fetchImpl: async () => sse("Hola"),
  });
  const text = await collect(
    streamWithFallback({
      primary: () => groq.stream({ body: {} }),
      fallback: () => cloudflare.stream({ body: {} }),
    }),
  );
  assert.equal(text, "Hola");
  assert.equal(groqCalls, 1);
});

test("without fallback, or once text has arrived, the Groq error reaches the queue as before", async () => {
  const failing = async function* (): AsyncGenerator<Chunk> {
    throw new GroqProviderError("all_keys_cooling_down", {
      status: 503,
      retryable: true,
      retryAfter: 30,
    });
  };
  await assert.rejects(
    collect(streamWithFallback({ primary: failing, fallback: null })),
    (e: unknown) => e instanceof GroqProviderError,
  );
  let fallbackUsed = false;
  const partial = async function* (): AsyncGenerator<Chunk> {
    yield { choices: [{ delta: { content: "Primera parte" } }] };
    throw new GroqProviderError("http_500", { status: 500, retryable: true });
  };
  await assert.rejects(
    collect(
      streamWithFallback({
        primary: partial,
        fallback: async function* () {
          fallbackUsed = true;
          yield { choices: [{ delta: { content: "otra" } }] };
        },
      }),
    ),
  );
  assert.equal(fallbackUsed, false);
});

test("Cloudflare provider: same interface, 429 pauses until UTC midnight, errors are typed", async () => {
  let paused = 0;
  const now = () => Date.parse("2026-10-16T22:00:00Z");
  const cf = createCloudflareProvider({
    getEnv: cfEnv,
    logger,
    now,
    fetchImpl: async () => new Response("", { status: 429 }),
  });
  await assert.rejects(
    collect(
      cf.stream({
        body: {},
        pause: async (_p: string, s: number) => void (paused = s),
      }),
    ),
    (e: unknown) =>
      e instanceof CloudflareProviderError &&
      e.status === 429 &&
      e.code === "provider_daily_limit",
  );
  assert.equal(paused, 7200);
  assert.equal(secondsToUtcMidnight(now()), 7200);
  const ok = createCloudflareProvider({
    getEnv: cfEnv,
    logger,
    fetchImpl: async (_u: string | URL | Request, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.stream, false);
      assert.match(
        String((init?.headers as Record<string, string>).Authorization),
        /^Bearer synthetic/,
      );
      return Response.json({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    },
  });
  const response = await ok.request({ body: { messages: [] } });
  assert.equal(response.status, 200);
  assert.equal(typeof ok.stream, "function");
  assert.equal(ok.configured(), true);
});

// ---------------------------------------- Uso: modo frente a respaldo
function fakeLimiter() {
  const charges: {
    mode: string;
    kind: string;
    provider: string;
    tokens: number;
    settledTo?: number | null;
  }[] = [];
  return {
    charges,
    limiter: {
      charge: async (input: {
        mode: string;
        kind: "mode" | "fallback";
        provider: string;
        tokens: number;
      }) => {
        const entry: (typeof charges)[number] = { ...input };
        charges.push(entry);
        let done = false;
        return {
          settle: async (t: number | null) => {
            if (done) return;
            done = true;
            entry.settledTo = t;
          },
        };
      },
    },
  };
}
const admission = {
  beforeAttempt: async () => ({ reconcile: async () => {} }),
};

test("mode use is charged to the mode; the Cloudflare fallback is recorded apart; failed attempts are refunded", async () => {
  const { charges, limiter } = fakeLimiter();
  const tracker = createAttemptTracker({
    admission,
    limiter,
    mode: MODES.normal,
  });
  const body = {
    messages: [{ role: "user", content: "hola" }],
    max_tokens: 100,
  };
  await tracker.reserveFirst("groq", body);
  // The first Groq attempt reuses the reservation made before saving the message.
  await tracker.beforeAttempt("groq", body);
  assert.equal(charges.length, 1);
  // Second key: the first one failed without text and is refunded.
  await tracker.beforeAttempt("groq", body);
  assert.equal(charges[0].settledTo, 0);
  // Every Groq key failed: Cloudflare answers as fallback.
  const fb = await tracker.beforeAttempt("cloudflare", body);
  assert.equal(charges[1].settledTo, 0);
  assert.deepEqual(
    charges.map((c) => [c.kind, c.provider]),
    [
      ["mode", "groq"],
      ["mode", "groq"],
      ["fallback", "cloudflare"],
    ],
  );
  await fb.reconcile({ prompt_tokens: 50, completion_tokens: 25 });
  assert.equal(charges[2].settledTo, 75);
  await tracker.finish({ answered: true });
});

test("«Pensar más» is charged to its own budget on Cloudflare; an unanswered turn costs nothing", async () => {
  const { charges, limiter } = fakeLimiter();
  const tracker = createAttemptTracker({
    admission,
    limiter,
    mode: MODES.think,
  });
  await tracker.reserveFirst("cloudflare", { messages: [], max_tokens: 10 });
  assert.deepEqual(
    [charges[0].mode, charges[0].kind, charges[0].provider],
    ["think", "mode", "cloudflare"],
  );
  await tracker.finish({ answered: false });
  assert.equal(charges[0].settledTo, 0);
});

// ------------------------------- Regla: nunca dar el ejercicio resuelto
test("the three system prompts share ONE common block with the non-negotiable rules", () => {
  assert.match(COMMON_RULES, /Nunca des el ejercicio resuelto/);
  assert.match(COMMON_RULES, /pistas y preguntas/);
  assert.match(COMMON_RULES, /Responde siempre en español/);
  assert.match(COMMON_RULES, /Estás hablando con una IA/);
  for (const id of ["fast", "normal", "think"] as const) {
    const prompt = MODE_SYSTEM_PROMPTS[id];
    assert.ok(
      prompt.startsWith(COMMON_RULES),
      `${id} empieza por el bloque común`,
    );
    assert.equal(
      prompt.split(COMMON_RULES).length - 1,
      1,
      `${id} lo incluye una sola vez`,
    );
  }
  // Normal keeps the full tutor prompt verbatim.
  assert.ok(MODE_SYSTEM_PROMPTS.normal.includes(DREAM_SYSTEM_PROMPT));
  // Each mode is tuned to its model: different prompts and lengths.
  assert.ok(MODE_SYSTEM_PROMPTS.fast.length < MODE_SYSTEM_PROMPTS.think.length);
  assert.ok(
    MODE_SYSTEM_PROMPTS.think.length < MODE_SYSTEM_PROMPTS.normal.length,
  );
  assert.equal(
    systemPromptFor("normal", { fallback: true }),
    MODE_SYSTEM_PROMPTS.think,
  );
});

test("every mode and the Cloudflare fallback go through the same message builder with the rule first", () => {
  const parts = {
    academicMemory: [],
    skillPrompt: "Habilidad educativa",
    attachmentContext: "a".repeat(20000),
  };
  const variants = [
    chatSystemMessages("fast", {
      ...parts,
      search: true,
      attachmentChars: MODES.fast.attachmentChars,
    }),
    chatSystemMessages("normal", { ...parts, search: true }),
    chatSystemMessages("think", {
      ...parts,
      attachmentChars: MODES.think.attachmentChars,
    }),
    chatSystemMessages("normal", {
      ...parts,
      fallback: true,
      attachmentChars: 6000,
    }),
  ];
  for (const messages of variants) {
    assert.ok(messages[0].content.startsWith(COMMON_RULES));
    // Same conversation policy (evaluable work: next step, never the result)
    // and the same test-answer rule in every variant.
    assert.ok(
      messages.some((m) => /sin dar directamente el resultado/.test(m.content)),
    );
    assert.ok(
      messages.some((m) =>
        /No escribas respuestas correctas de un test activo/.test(m.content),
      ),
    );
  }
  // Shorter context for the small models.
  const att = (ms: { content: string }[]) =>
    ms.find((m) => m.content.startsWith("Contexto de archivos"))!.content
      .length;
  assert.ok(att(variants[2]) < att(variants[1]));
  assert.ok(att(variants[3]) < att(variants[2]));
  // Cloudflare never gets the web search tool prompt.
  assert.ok(!variants[2].some((m) => /web_search/.test(m.content)));
  assert.ok(!variants[3].some((m) => /web_search/.test(m.content)));
});
