import test from "node:test";
import assert from "node:assert/strict";
import {
  createGroqProviderManager,
  parseSSE,
} from "../supabase/functions/dream-api/groq.mjs";
import { createTavilyManager } from "../supabase/functions/dream-api/tavily.mjs";
import {
  AdmissionError,
  readBoundedBody,
  retryAfterSeconds,
} from "../supabase/functions/dream-api/admission.mjs";
import {
  assertBase64,
  validateOfficeArchive,
} from "../supabase/functions/dream-api/archive.mjs";
const logger = { ...console, log: () => {} };
const env = (name: string) =>
  (
    ({
      GROQ_API_KEY_1: "synthetic-one",
      GROQ_API_KEY_2: "synthetic-two",
      TAVILY_API_KEY_1: "synthetic-one",
      TAVILY_API_KEY_2: "synthetic-two",
    }) as Record<string, string>
  )[name];
for (const status of [401, 403, 408, 425, 500, 503])
  test(`Groq bounded failover ${status}`, async () => {
    let calls = 0;
    const manager = createGroqProviderManager({
      getEnv: env,
      logger,
      fetchImpl: async () =>
        new Response("{}", { status: ++calls === 1 ? status : 200 }),
    });
    await manager.request({ body: {}, beforeAttempt: async () => {} });
    assert.equal(calls, 2);
  });
test("Groq 429 on every key pauses with the shortest Retry-After", async () => {
  let calls = 0;
  let pause = 0;
  const manager = createGroqProviderManager({
    getEnv: env,
    logger,
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": calls === 1 ? "125" : "40" },
      });
    },
  });
  await assert.rejects(
    manager.request({
      body: {},
      pause: async (_p: string, s: number) => {
        pause = s;
      },
    }),
    (e: unknown) =>
      !!e && typeof e === "object" && "retryAfter" in e && e.retryAfter === 40,
  );
  // Both keys are cooling down now: no new call until one is free.
  await assert.rejects(manager.request({ body: {} }));
  assert.equal(calls, 2);
  assert.equal(pause, 40);
});
test("admission failure never becomes provider failover", async () => {
  let calls = 0;
  const manager = createGroqProviderManager({
    getEnv: env,
    logger,
    fetchImpl: async () => {
      calls++;
      return new Response("{}");
    },
  });
  await assert.rejects(
    manager.request({
      body: {},
      beforeAttempt: async () => {
        throw new AdmissionError("dream_budget");
      },
    }),
  );
  assert.equal(calls, 0);
});
test("Groq preserves partial streaming without retry and cancels reader", async () => {
  let calls = 0;
  let text = "";
  const manager = createGroqProviderManager({
    getEnv: env,
    logger,
    fetchImpl: async () => {
      calls++;
      return new Response(
        'data: {"choices":[{"delta":{"content":"Recibido"}}]}\n',
      );
    },
  });
  await assert.rejects(async () => {
    for await (const chunk of manager.stream({ body: {} }))
      text += chunk.choices[0].delta.content;
  });
  assert.equal(text, "Recibido");
  assert.equal(calls, 1);
});
test("SSE oversized frame is rejected", async () => {
  await assert.rejects(async () => {
    for await (const _ of parseSSE(new Response("x".repeat(270000)).body!)) {
      void _;
    }
  });
});
test("Tavily new keys fail over on authentication, not 429", async () => {
  let calls = 0;
  const manager = createTavilyManager({
    getEnv: env,
    logger,
    fetchImpl: async () =>
      ++calls === 1
        ? new Response("", { status: 401 })
        : new Response(
            '{"results":[{"url":"javascript:alert(1)"},{"url":"https://example.test","title":"Fuente"}]}',
          ),
  });
  const results = JSON.parse(await manager.search("consulta"));
  assert.equal(calls, 2);
  assert.equal(results.length, 1);
  let limitedCalls = 0;
  let pause = 0;
  const limited = createTavilyManager({
    getEnv: env,
    logger,
    fetchImpl: async () => {
      limitedCalls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "75" },
      });
    },
  });
  await assert.rejects(
    limited.search("consulta", {
      pause: async (_p: string, n: number) => {
        pause = n;
      },
    }),
  );
  await assert.rejects(limited.search("consulta"));
  assert.equal(limitedCalls, 1);
  assert.equal(pause, 75);
});
test("Tavily all keys fail explicitly and caller abort is respected", async () => {
  let calls = 0;
  const manager = createTavilyManager({
    getEnv: env,
    logger,
    fetchImpl: async () => {
      calls++;
      return new Response("", { status: 503 });
    },
  });
  await assert.rejects(manager.search("consulta"));
  assert.equal(calls, 2);
});
test("body size is bounded while reading, UTF8 length and reader canceled", async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("πππ"));
    },
    cancel() {
      canceled = true;
    },
  });
  const req = new Request("https://example.test", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readBoundedBody(req, 5));
  assert.equal(canceled, true);
});
test("base64 rejects malformed data and retry dates preserve provider waits", () => {
  assertBase64("aGVsbG8=");
  assert.throws(() => assertBase64("invalid==="));
  assert.equal(retryAfterSeconds("125"), 125);
  assert.equal(
    retryAfterSeconds(
      "Thu, 08 Oct 2026 12:02:00 GMT",
      Date.parse("2026-10-08T12:00:00Z"),
    ),
    120,
  );
});
test("ZIP malformed metadata rejected before extraction", () => {
  assert.throws(() => validateOfficeArchive(new Uint8Array(30)));
});
test("ZIP directory bounds reject bombs and encrypted entries before inflation", () => {
  const bytes = new Uint8Array(101),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(8, 8, true);
  v.setUint16(26, 1, true);
  bytes[30] = 97;
  v.setUint32(32, 0x02014b50, true);
  v.setUint16(42, 8, true);
  v.setUint32(52, 1, true);
  v.setUint32(56, 10, true);
  v.setUint16(60, 1, true);
  bytes[78] = 97;
  v.setUint32(79, 0x06054b50, true);
  v.setUint16(87, 1, true);
  v.setUint16(89, 1, true);
  v.setUint32(91, 47, true);
  v.setUint32(95, 32, true);
  assert.equal(validateOfficeArchive(bytes).entries, 1);
  v.setUint32(56, 5 * 1024 * 1024, true);
  assert.throws(() => validateOfficeArchive(bytes), /archive_limits/);
  v.setUint32(56, 10, true);
  v.setUint16(40, 1, true);
  assert.throws(() => validateOfficeArchive(bytes));
});
test("Groq timeouts fail over only within the bounded attempt set", async () => {
  let calls = 0;
  const manager = createGroqProviderManager({
    getEnv: env,
    logger,
    fetchImpl: async (_url: RequestInfo | URL, options?: RequestInit) => {
      calls++;
      if (calls === 2) return new Response("{}");
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timeout", "AbortError")),
          { once: true },
        );
      });
    },
  });
  // Keep event loop alive for native AbortSignal timeout (unref'ed by Node).
  const interval = setInterval(() => {}, 20);
  try {
    await manager.request({ body: {}, timeoutMs: 10 });
    assert.equal(calls, 2);
  } finally {
    clearInterval(interval);
  }
});
test("incomplete or duplicate AI grades are never silently marked incorrect", async () => {
  const { validateEvaluations } =
    await import("../supabase/functions/dream-api/grading.mjs");
  assert.throws(() => validateEvaluations([], ["q1"]));
  assert.throws(() =>
    validateEvaluations(
      [
        { question_id: "q1", is_correct: true, feedback: "ok" },
        { question_id: "q1", is_correct: true, feedback: "ok" },
      ],
      ["q1", "q2"],
    ),
  );
  assert.equal(
    validateEvaluations(
      [{ question_id: "q1", is_correct: false, feedback: "Razón" }],
      ["q1"],
    ).length,
    1,
  );
});
