import test from "node:test";
import assert from "node:assert/strict";
import { createTavilyManager } from "../supabase/functions/dream-api/tavily.mjs";

const env = (name: string) =>
  ({ TAVILY_API_KEY_1: "synthetic-one", TAVILY_API_KEY_2: "synthetic-two" })[
    name
  ];
const auth = (init?: RequestInit) =>
  String((init?.headers as Record<string, string>).Authorization).replace(
    "Bearer ",
    "",
  );
const ok = () =>
  new Response('{"results":[{"url":"https://example.test","title":"Fuente"}]}');
const limited = (seconds: string) =>
  new Response("", { status: 429, headers: { "Retry-After": seconds } });

function manager(
  fetchImpl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
  now?: () => number,
) {
  const lines: string[] = [];
  const tavily = createTavilyManager({
    getEnv: env,
    now,
    fetchImpl,
    logger: { ...console, log: (line: string) => void lines.push(line) },
  });
  return { tavily, lines };
}

test("Tavily 429 on key 1 cools only key 1 and the search succeeds on key 2", async () => {
  const used: string[] = [];
  const { tavily, lines } = manager(async (_u, init) => {
    used.push(auth(init));
    return used.length === 1 ? limited("30") : ok();
  });
  let paused = false;
  const results = JSON.parse(
    await tavily.search("consulta", {
      pause: async () => {
        paused = true;
      },
    }),
  );
  assert.equal(results.length, 1);
  assert.deepEqual(used, ["synthetic-one", "synthetic-two"]);
  assert.equal(paused, false);
  assert.ok(lines.some((l) => JSON.parse(l).status === 429 && JSON.parse(l).key_slot === 1));
  assert.ok(!lines.join("").includes("synthetic-"));
});

test("Tavily 429 on every key throws provider_rate_limit with the shortest wait", async () => {
  let calls = 0;
  const { tavily } = manager(async () => limited(++calls === 1 ? "60" : "15"));
  const paused: number[] = [];
  await assert.rejects(
    tavily.search("consulta", {
      pause: async (_p: string, s: number) => void paused.push(s),
    }),
    (e: { code: string; status: number; retryAfter: number }) =>
      e.code === "provider_rate_limit" && e.status === 429 && e.retryAfter === 15,
  );
  assert.equal(calls, 2);
  assert.deepEqual(paused, [15]);
});

test("a Tavily key in cooldown is skipped until its wait is over", async () => {
  let clock = 1_000_000;
  const used: string[] = [];
  let calls = 0;
  const { tavily } = manager(
    async (_u, init) => {
      used.push(auth(init));
      return ++calls === 1 ? limited("10") : ok();
    },
    () => clock,
  );
  // Different queries: the same one would come from the 24 h cache (P4).
  await tavily.search("consulta uno");
  used.length = 0;
  await tavily.search("consulta dos");
  assert.deepEqual(used, ["synthetic-two"]);
  clock += 11_000;
  used.length = 0;
  await tavily.search("consulta tres");
  assert.deepEqual(used, ["synthetic-one"]);
});
