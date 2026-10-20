import test from "node:test";
import assert from "node:assert/strict";
import {
  chatSystemMessages,
  COMMON_RULES,
  searchAnswerMessages,
  searchPlannerMessages,
} from "../supabase/functions/dream-api/prompts.mjs";
import { compactHistory } from "../supabase/functions/dream-api/capacity.mjs";
import { MODES, SEARCH_TURN } from "../supabase/functions/dream-api/models.mjs";
import { estimateWindowTokens } from "../supabase/functions/dream-api/usage-window.mjs";
import { createTavilyManager } from "../supabase/functions/dream-api/tavily.mjs";

const logger = { ...console, log: () => {} };
const prompt = "búscame en internet las operaciones con fracciones";
// Long stored conversation: every message at its maximum.
const stored = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  content: "x".repeat(6000),
}));
const memory = Array.from({ length: 5 }, () => ({
  subject: "Matemáticas",
  topic: "Fracciones",
  concept: "Suma",
  status: "learning",
  evidence_count: 4,
  correct_count: 2,
}));

async function tavilyResult() {
  const results = Array.from({ length: 6 }, (_, i) => ({
    title: "t".repeat(400),
    url: `https://example.test/${i}`,
    content: "c".repeat(5000),
  }));
  const tavily = createTavilyManager({
    getEnv: (n: string) => (n === "TAVILY_API_KEY_1" ? "synthetic" : undefined),
    logger,
    fetchImpl: async () => new Response(JSON.stringify({ results })),
  });
  return tavily.search("operaciones con fracciones");
}

test("Tavily sends at most 3 results of 700 characters to the AI", async () => {
  const parsed = JSON.parse(await tavilyResult());
  assert.equal(parsed.length, 3);
  assert.ok(parsed.every((r: { content: string }) => r.content.length === 700));
});

test("each call of a search turn stays well under Groq's 8,000 tokens per minute", async () => {
  const history = compactHistory(
    stored.slice(-SEARCH_TURN.history.maxMessages),
    SEARCH_TURN.history,
  );
  const plan = estimateWindowTokens({
    messages: [...searchPlannerMessages(), ...history, { role: "user", content: prompt }],
    max_tokens: SEARCH_TURN.plannerMaxTokens,
  });
  const answer = estimateWindowTokens({
    messages: [
      ...searchAnswerMessages({ academicMemory: memory }),
      ...history,
      { role: "user", content: prompt },
      { role: "assistant", content: null },
      { role: "tool", content: await tavilyResult() },
    ],
    max_tokens: SEARCH_TURN.answerMaxTokens,
  });
  // Both together fit in one minute of one key, with room for other students.
  assert.ok(plan < 2500, `plan ${plan}`);
  assert.ok(answer < 3500, `answer ${answer}`);
  assert.ok(plan + answer < 5500, `total ${plan + answer}`);
  // Before: the full Normal prompt went in both calls.
  const before = estimateWindowTokens({
    messages: [
      ...chatSystemMessages("normal", { search: true, academicMemory: memory }),
      ...compactHistory(stored.slice(-MODES.normal.history.maxMessages), MODES.normal.history),
      { role: "user", content: prompt },
    ],
    max_tokens: MODES.normal.maxOutputTokens,
  });
  assert.ok(before > 2 * plan, `before ${before}`);
});

test("both search calls keep Dream's common rules", () => {
  assert.equal(searchPlannerMessages()[0].content.startsWith(COMMON_RULES), true);
  assert.equal(searchAnswerMessages()[0].content.startsWith(COMMON_RULES), true);
});
