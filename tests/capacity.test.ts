import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGroqDuration,
  classifyProviderLimit,
  compactHistory,
  answerTokenBudget,
  SHORT_ANSWER_TOKENS,
  LONG_ANSWER_TOKENS,
} from "../supabase/functions/dream-api/capacity.mjs";
import { createGroqProviderManager } from "../supabase/functions/dream-api/groq.mjs";

test("Groq reset durations parse to seconds", () => {
  assert.equal(parseGroqDuration("7.66s"), 7.66);
  assert.equal(parseGroqDuration("2m59.56s"), 179.56);
  assert.equal(parseGroqDuration("1h2m3s"), 3723);
  assert.equal(parseGroqDuration("120ms"), 0.12);
  assert.equal(parseGroqDuration("soon"), null);
  assert.equal(parseGroqDuration(null), null);
});

test("a short 429 is a per-minute limit, a daily one is not queued", () => {
  assert.deepEqual(classifyProviderLimit({ retryAfter: 12 }), {
    code: "provider_rate_limit",
    retryAfter: 12,
  });
  assert.equal(
    classifyProviderLimit({
      retryAfter: 30,
      body: "Rate limit reached on tokens per day (TPD)",
    }).code,
    "provider_daily_limit",
  );
  const headers: Record<string, string> = {
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "3h0m0s",
  };
  assert.deepEqual(
    classifyProviderLimit({
      retryAfter: 5,
      header: (n: string) => headers[n] ?? null,
    }),
    { code: "provider_daily_limit", retryAfter: 10800 },
  );
  assert.equal(
    classifyProviderLimit({ retryAfter: 3600 }).code,
    "provider_daily_limit",
  );
});

test("history keeps the newest turns whole and shortens older ones", () => {
  const long = "x".repeat(3000);
  const messages = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `${i}:${long}`,
  }));
  const out = compactHistory(messages);
  assert.equal(out.at(-1)?.content, messages.at(-1)?.content);
  assert.ok(out.length >= 2 && out.length < messages.length);
  assert.ok(
    out.slice(0, -4).every((m: { content: string }) => m.content.length <= 401),
  );
  const total = out.reduce(
    (n: number, m: { content: string }) => n + m.content.length,
    0,
  );
  assert.ok(total <= 9000 + 4001, `total ${total}`);
  assert.deepEqual(compactHistory([]), []);
});

test("answers are short unless the student asks for complete notes", () => {
  assert.equal(answerTokenBudget("¿Qué es una derivada?"), SHORT_ANSWER_TOKENS);
  assert.equal(
    answerTokenBudget("Hazme unos apuntes del tema 3"),
    LONG_ANSWER_TOKENS,
  );
  assert.equal(
    answerTokenBudget("Un resumen para imprimir"),
    LONG_ANSWER_TOKENS,
  );
});

test("a Groq 429 cools every key and is never retried on another key", async () => {
  let calls = 0;
  const paused: number[] = [];
  const groq = createGroqProviderManager({
    getEnv: (name: string) =>
      name === "GROQ_API_KEY_1"
        ? "k1"
        : name === "GROQ_API_KEY_2"
          ? "k2"
          : undefined,
    fetchImpl: async () => {
      calls++;
      return new Response(
        '{"error":{"message":"Rate limit reached on requests per day (RPD)"}}',
        {
          status: 429,
          headers: {
            "retry-after": "40",
            "x-ratelimit-remaining-requests": "0",
            "x-ratelimit-reset-requests": "5h",
          },
        },
      );
    },
    logger: { ...console, log: () => {} },
  });
  await assert.rejects(
    groq.request({
      body: {},
      pause: async (_p: string, s: number) => void paused.push(s),
    }),
    (e: { code: string; retryAfter: number }) =>
      e.code === "provider_daily_limit" && e.retryAfter === 18000,
  );
  assert.equal(calls, 1);
  assert.deepEqual(paused, [18000]);
  assert.ok(
    groq
      .healthSnapshot()
      .every((k: { state: string }) => k.state === "cooldown"),
  );
});
