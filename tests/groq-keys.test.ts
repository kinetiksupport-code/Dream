import test from "node:test";
import assert from "node:assert/strict";
import {
  createGroqProviderManager,
  inspectGroqKeys,
} from "../supabase/functions/dream-api/groq.mjs";

const keys: Record<string, string> = {
  GROQ_API_KEY_1: "synthetic-one",
  GROQ_API_KEY_2: "synthetic-two",
  GROQ_API_KEY_3: "synthetic-three",
  GROQ_API_KEY_4: "synthetic-four",
};
const env = (overrides: Record<string, string | undefined> = {}) => (name: string) =>
  name in overrides ? overrides[name] : keys[name];
const auth = (init?: RequestInit) =>
  String((init?.headers as Record<string, string>).Authorization).replace(
    "Bearer ",
    "",
  );
const ok = () => new Response('{"choices":[]}');
const limited = (seconds: string) =>
  new Response("", { status: 429, headers: { "Retry-After": seconds } });

function manager(
  fetchImpl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
  options: { getEnv?: (name: string) => string | undefined; now?: () => number } = {},
) {
  const lines: Record<string, unknown>[] = [];
  const groq = createGroqProviderManager({
    getEnv: options.getEnv ?? env(),
    now: options.now,
    fetchImpl,
    logger: { ...console, log: (line: string) => void lines.push(JSON.parse(line)) },
  });
  return { groq, lines };
}

test("429 on key 1 cools only key 1 and the same request succeeds on key 2", async () => {
  const used: string[] = [];
  const { groq, lines } = manager(async (_u, init) => {
    used.push(auth(init));
    return used.length === 1 ? limited("30") : ok();
  });
  let paused = false;
  const response = await groq.request({
    body: {},
    pause: async () => {
      paused = true;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(used, ["synthetic-one", "synthetic-two"]);
  assert.equal(paused, false); // one key limited is not a Groq pause
  const states = groq.healthSnapshot();
  assert.equal(states[0].state, "cooldown");
  assert.ok(states.slice(1).every((k: { state: string }) => k.state === "healthy"));
  // The 429 leaves its own log line, without the key value.
  const line = lines.find((l) => l.result === "rate_limit");
  assert.equal(line?.key_slot, 1);
  assert.equal(line?.retry_after, 30);
  assert.ok(!JSON.stringify(lines).includes("synthetic-"));
});

test("429 on every key throws provider_rate_limit with the shortest wait, then pauses Groq", async () => {
  const waits = ["50", "20", "35", "90"];
  let calls = 0;
  const { groq } = manager(async () => limited(waits[calls++]));
  const paused: number[] = [];
  await assert.rejects(
    async () => {
      for await (const _ of groq.stream({
        body: {},
        pause: async (_p: string, s: number) => void paused.push(s),
      }))
        void _;
    },
    (e: { code: string; status: number; retryAfter: number }) =>
      e.code === "provider_rate_limit" && e.status === 429 && e.retryAfter === 20,
  );
  assert.equal(calls, 4);
  assert.deepEqual(paused, [20]);
});

test("requests are spread across keys in turn", async () => {
  const used: string[] = [];
  const { groq } = manager(async (_u, init) => {
    used.push(auth(init));
    return ok();
  });
  for (let i = 0; i < 8; i++) await groq.request({ body: {} });
  assert.deepEqual(used, [
    "synthetic-one", "synthetic-two", "synthetic-three", "synthetic-four",
    "synthetic-one", "synthetic-two", "synthetic-three", "synthetic-four",
  ]);
});

test("a key in cooldown is skipped until its wait is over", async () => {
  let clock = 1_000_000;
  const used: string[] = [];
  const { groq } = manager(
    async (_u, init) => {
      used.push(auth(init));
      return used.length === 1 ? limited("10") : ok();
    },
    { now: () => clock },
  );
  await groq.request({ body: {} }); // key 1 → 429, key 2 answers
  used.length = 0;
  for (let i = 0; i < 6; i++) await groq.request({ body: {} });
  assert.ok(!used.includes("synthetic-one"));
  clock += 11_000;
  used.length = 0;
  for (let i = 0; i < 4; i++) await groq.request({ body: {} });
  assert.ok(used.includes("synthetic-one"));
});

test("the second call of a search turn can use another key", async () => {
  const used: string[] = [];
  const { groq } = manager(async (_u, init) => {
    used.push(auth(init));
    // The first call works; the second gets a 429 on the key it starts with.
    return used.length === 2 ? limited("30") : ok();
  });
  await groq.request({ body: {} });
  assert.equal(used[0], "synthetic-one");
  const second = await groq.request({ body: {} });
  assert.equal(second.status, 200);
  assert.equal(used.length, 3);
  assert.notEqual(used[2], used[1]);
});

test("401/403 keep the long cooldown of that key and fail over", async () => {
  const used: string[] = [];
  const { groq } = manager(async (_u, init) => {
    used.push(auth(init));
    return used.length === 1 ? new Response("", { status: 401 }) : ok();
  });
  await groq.request({ body: {} });
  assert.equal(groq.healthSnapshot()[0].state, "unavailable");
  assert.equal(used.length, 2);
});

test("start-up log says which slots are discarded and why, never the values", () => {
  const report = inspectGroqKeys(
    env({
      GROQ_API_KEY_2: "  ",
      GROQ_API_KEY_3: '"synthetic-three"',
      GROQ_API_KEY_4: "synthetic-one",
    }),
  );
  assert.deepEqual(report.keys.map((k) => k.slot), [1]);
  assert.deepEqual(report.discarded, [
    { slot: 2, reason: "empty" },
    { slot: 3, reason: "invalid_format" },
    { slot: 4, reason: "duplicate", duplicate_of: 1 },
  ]);
  const { groq, lines } = manager(async () => ok(), {
    getEnv: env({ GROQ_API_KEY_4: undefined }),
  });
  assert.equal(groq.configuredKeyCount(), 3);
  groq.configuredKeyCount();
  const startup = lines.filter((l) => l.event === "groq_keys");
  assert.equal(startup.length, 1); // once per instance
  assert.equal(startup[0].groq_key_slots, 3);
  assert.deepEqual(startup[0].discarded, [{ slot: 4, reason: "empty" }]);
  assert.ok(!JSON.stringify(lines).includes("synthetic-"));
  assert.deepEqual(groq.keyReport(), {
    groq_key_slots: 3,
    discarded: [{ slot: 4, reason: "empty" }],
  });
});
