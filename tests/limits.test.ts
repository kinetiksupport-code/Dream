import test from "node:test";
import assert from "node:assert/strict";
import {
  limitFor,
  shouldRetry,
  waitText,
  dailyText,
  MAX_RETRIES,
} from "../lib/limits";
import { parseEvent } from "../lib/streaming";

const NOON = new Date(2026, 9, 15, 12, 0).getTime();

test("short limits wait, daily limits never queue", () => {
  assert.deepEqual(limitFor("dream_rpm", 40, NOON), {
    kind: "wait",
    seconds: 40,
  });
  assert.deepEqual(limitFor("dream_queue", 39.2, NOON, 12), {
    kind: "wait",
    seconds: 40,
    position: 12,
  });
  assert.deepEqual(limitFor("dream_daily", 3600, NOON), {
    kind: "daily",
    resetAt: NOON + 3_600_000,
    scope: "user",
  });
  assert.equal(limitFor("provider_daily_limit", 60, NOON)?.kind, "daily");
  // A provider pause of hours is the day's quota even with the minute code.
  assert.deepEqual(limitFor("provider_rate_limit", 7200, NOON), {
    kind: "daily",
    resetAt: NOON + 7_200_000,
    scope: "global",
  });
  assert.equal(limitFor("stream_failed", 5, NOON), null);
  assert.equal(limitFor("", 0, NOON), null);
});

test("retries are bounded in count and total wait", () => {
  assert.equal(shouldRetry(0, 0, 40), true);
  assert.equal(shouldRetry(MAX_RETRIES, 0, 1), false);
  assert.equal(shouldRetry(1, 280, 30), false);
});

test("wait and daily texts are short and concrete", () => {
  assert.equal(waitText(39, 12), "Eres el 12º en la cola, unos 40 s.");
  assert.equal(
    waitText(8),
    "Hay mucha gente usando Dream. Lo intento de nuevo en unos 10 s.",
  );
  assert.equal(
    waitText(130),
    "Hay mucha gente usando Dream. Lo intento de nuevo en unos 2 min.",
  );
  const tomorrow = new Date(2026, 9, 16, 2, 0).getTime();
  assert.equal(
    dailyText({ kind: "daily", resetAt: tomorrow, scope: "global" }, NOON),
    "La IA gratis de hoy se ha agotado. Vuelve mañana a las 02:00.",
  );
  assert.equal(
    dailyText(
      { kind: "daily", resetAt: NOON + 3_600_000, scope: "user" },
      NOON,
    ),
    "Has usado toda tu IA gratis de hoy. Vuelve hoy a las 13:00.",
  );
  assert.match(
    dailyText(
      { kind: "daily", resetAt: NOON + 3 * 86_400_000, scope: "global" },
      NOON,
    ),
    /Vuelve el 18 de octubre a las 12:00\.$/,
  );
});

test("stream errors carry queue position and the revert flag only when valid", () => {
  assert.deepEqual(
    parseEvent(
      '{"type":"error","message":"x","code":"dream_queue","retry_after":30,"position":3,"reverted":true}',
    ),
    {
      type: "error",
      message: "x",
      code: "dream_queue",
      retry_after: 30,
      position: 3,
      reverted: true,
    },
  );
  assert.deepEqual(
    parseEvent(
      '{"type":"error","message":"x","code":"evil","position":-1,"reverted":"yes"}',
    ),
    { type: "error", message: "x" },
  );
});
