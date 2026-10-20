import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_USAGE,
  alternativeMode,
  costSentence,
  formatResetIn,
  modeHint,
  parseUsage,
  pickMode,
} from "../lib/ai-modes";
import { limitFor } from "../lib/limits";
import { parseEvent } from "../lib/streaming";

const NOON = new Date(2026, 9, 16, 12, 0).getTime();
const resets = new Date(NOON + 2 * 3600_000 + 10 * 60_000).toISOString();

test("usage from the server keeps only modes, percentages and reset time", () => {
  const usage = parseUsage({
    window: { started_at: new Date(NOON).toISOString(), ends_at: resets },
    modes: [
      {
        id: "fast",
        label: "llama",
        percent: 12.4,
        blocked: false,
        resets_at: resets,
        tokens: 999,
      },
      { id: "normal", percent: 140, blocked: true, resets_at: resets },
      { id: "secret-model", percent: 1 },
    ],
    default_mode: "normal",
  });
  assert.deepEqual(
    usage.modes.map((m) => [m.id, m.label, m.percent, m.blocked]),
    [
      ["fast", "Rápido", 12, false],
      ["normal", "Normal", 100, true],
    ],
  );
  assert.ok(!JSON.stringify(usage).includes("999"));
  // Old server or a mocked {ok:true}: Rápido and Normal at 0 %.
  assert.deepEqual(parseUsage({ ok: true }), FALLBACK_USAGE);
  assert.deepEqual(
    FALLBACK_USAGE.modes.map((m) => m.id),
    ["fast", "normal"],
  );
});

test("the shared limit comes on top; every mode waits when it is spent", () => {
  const usage = parseUsage({
    window: { started_at: new Date(NOON).toISOString(), ends_at: resets },
    percent: 100,
    blocked: true,
    resets_at: resets,
    modes: [
      {
        id: "fast",
        percent: 100,
        blocked: true,
        resets_at: resets,
        cost: "less",
        relative_cost: "la mitad",
      },
      {
        id: "normal",
        percent: 100,
        blocked: true,
        resets_at: resets,
        cost: "same",
        relative_cost: "lo normal",
      },
      {
        id: "think",
        percent: 100,
        blocked: true,
        resets_at: resets,
        cost: "more",
        relative_cost: "el doble",
      },
    ],
    default_mode: "normal",
  });
  assert.deepEqual(
    [usage.percent, usage.blocked, usage.resets_at],
    [100, true, resets],
  );
  assert.equal(alternativeMode(usage, "think"), null);
  assert.equal(
    costSentence(usage.modes),
    "Rápido gasta la mitad, Normal lo normal y Pensar más el doble.",
  );
  assert.equal(modeHint(usage.modes[0]), "Respuestas cortas, gasta menos");
  assert.equal(modeHint(usage.modes[1]), "Equilibrado");
  assert.equal(modeHint(usage.modes[2]), "Más cuidadoso, gasta más");
  // Without «Pensar más».
  assert.equal(
    costSentence(usage.modes.slice(0, 2)),
    "Rápido gasta la mitad y Normal lo normal.",
  );
  // Odd cost words from the server are ignored (no numbers, no names).
  const odd = parseUsage({
    percent: 5,
    modes: [{ id: "fast", percent: 5, relative_cost: "50 % gpt-oss" }],
  });
  assert.equal(odd.modes[0].relative_cost, "la mitad");
  assert.equal(odd.percent, 5);
});

test("an old server (one limit per mode) still parses: the most used mode leads", () => {
  const usage = parseUsage({
    modes: [
      { id: "fast", percent: 20, blocked: false, resets_at: resets },
      { id: "normal", percent: 100, blocked: true, resets_at: resets },
    ],
  });
  assert.deepEqual([usage.percent, usage.blocked], [100, true]);
  // The old server still leaves another mode free: it is offered.
  assert.equal(alternativeMode(usage, "normal")?.id, "fast");
});

test("the chosen mode survives only while the server offers it", () => {
  assert.equal(pickMode(FALLBACK_USAGE, null), "normal");
  assert.equal(pickMode(FALLBACK_USAGE, "fast"), "fast");
  assert.equal(pickMode(FALLBACK_USAGE, "think"), "normal");
  const spent = parseUsage({
    modes: [
      { id: "fast", percent: 100, blocked: true },
      { id: "normal", percent: 100, blocked: true },
    ],
  });
  assert.equal(alternativeMode(spent, "normal"), null);
  const one = parseUsage({
    modes: [
      { id: "fast", percent: 10, blocked: false },
      { id: "normal", percent: 100, blocked: true },
    ],
  });
  assert.equal(alternativeMode(one, "normal")?.id, "fast");
});

test("reset countdown reads like «2 h 10 min»", () => {
  assert.equal(formatResetIn(2 * 3600_000 + 10 * 60_000), "2 h 10 min");
  assert.equal(formatResetIn(3 * 3600_000), "3 h");
  assert.equal(formatResetIn(45 * 60_000), "45 min");
  assert.equal(formatResetIn(10_000), "1 min");
  assert.equal(formatResetIn(0), "menos de 1 min");
});

test("a spent mode is its own limit kind: no queue, no daily message", () => {
  assert.deepEqual(limitFor("dream_mode_limit", 600, NOON), {
    kind: "mode",
    resetAt: NOON + 600_000,
  });
  const event = parseEvent(
    '{"type":"error","message":"x","code":"dream_mode_limit","retry_after":600,"reverted":true}',
  );
  assert.equal(event?.type === "error" && event.code, "dream_mode_limit");
});
