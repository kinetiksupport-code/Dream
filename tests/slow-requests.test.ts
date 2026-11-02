import test from "node:test";
import assert from "node:assert/strict";
import {
  RETRY_DELAYS_SECONDS,
  isReadAction,
  retryDelay,
  retryText,
  slowNotice,
} from "../lib/slow-requests";

const http = (status: number, retryAfter = 0) =>
  Object.assign(new Error("x"), { status, retryAfter });

test("only reads are retried on their own: never AI or writes", () => {
  for (const a of [
    "profile",
    "conversations",
    "messages",
    "exam_get",
    "dreams_list",
  ])
    assert.equal(isReadAction(a), true, a);
  for (const a of [
    "chat",
    "test_generate",
    "test_submit",
    "exam_create",
    "conversation_delete",
    "account_delete",
    "attachment_upload",
    "scheme_generate",
  ])
    assert.equal(isReadAction(a), false, a);
});

test("transient failures retry after 10 s then 20 s, and then stop", () => {
  assert.deepEqual([...RETRY_DELAYS_SECONDS], [10, 20]);
  const offline = new TypeError("Failed to fetch");
  assert.equal(retryDelay(offline, 0), 10);
  assert.equal(retryDelay(offline, 1), 20);
  assert.equal(retryDelay(offline, 2), null);
  assert.equal(retryDelay(http(503), 0), 10);
  assert.equal(retryDelay(http(502), 1), 20);
  assert.equal(retryDelay(http(504), 0), 10);
});

test("short 429 waits for the server's Retry-After, a long one is the daily quota", () => {
  assert.equal(retryDelay(http(429, 25), 0), 25);
  assert.equal(retryDelay(http(429, 3), 0), 10);
  assert.equal(retryDelay(http(429, 3600), 0), null);
  assert.equal(retryDelay(http(503, 120), 0), null);
});

test("errors that retrying cannot fix are shown at once", () => {
  for (const status of [400, 401, 403, 404, 409, 413, 428])
    assert.equal(retryDelay(http(status), 0), null, String(status));
  assert.equal(retryDelay(new TypeError("x"), 0, true), null);
  const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
  assert.equal(retryDelay(timeout, 0), null);
});

test("the notice shows slow requests and the countdown, and retryNow skips the wait", async () => {
  assert.equal(slowNotice.get(), null);
  const end = slowNotice.slowStarted();
  assert.deepEqual(slowNotice.get(), { kind: "slow" });
  const waiting = slowNotice.wait(60);
  assert.equal(slowNotice.get()?.kind, "retry");
  slowNotice.retryNow();
  await waiting;
  assert.deepEqual(slowNotice.get(), { kind: "slow" });
  end();
  end();
  assert.equal(slowNotice.get(), null);
});

test("an aborted wait ends and clears the notice", async () => {
  const controller = new AbortController();
  const waiting = slowNotice.wait(60, controller.signal);
  assert.equal(slowNotice.get()?.kind, "retry");
  controller.abort();
  await waiting;
  assert.equal(slowNotice.get(), null);
});

test("countdown text", () => {
  assert.equal(retryText(9.2), "No se pudo conectar. Reintento en 10 s.");
  assert.equal(retryText(0), "No se pudo conectar. Reintento en 1 s.");
});
