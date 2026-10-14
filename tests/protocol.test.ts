import test from "node:test";
import assert from "node:assert/strict";
import { readNDJSON } from "../lib/streaming";
import { parseDreamContent } from "../lib/widgets";
import { normalizeMath } from "../lib/math";
import type { DreamStreamEvent } from "../lib/types";
function chunks(bytes: Uint8Array, step = 1) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let n = 0; n < bytes.length; n += step)
        controller.enqueue(bytes.slice(n, n + step));
      controller.close();
    },
  });
}
test("NDJSON preserves split UTF-8, CRLF and final line without newline", async () => {
  const events: DreamStreamEvent[] = [];
  await readNDJSON(
    chunks(
      new TextEncoder().encode(
        '{"type":"activity","activity":"searching"}\r\n{"type":"delta","text":"Una idea: π 🪴"}\n{"type":"complete"}',
      ),
    ),
    (e) => events.push(e),
  );
  assert.deepEqual(events, [
    { type: "activity", activity: "searching" },
    { type: "delta", text: "Una idea: π 🪴" },
    { type: "complete" },
  ]);
});
test("cut stream preserves emitted text and reports interruption", async () => {
  let text = "";
  await assert.rejects(
    readNDJSON(
      chunks(new TextEncoder().encode('{"type":"delta","text":"Recibido"}\n')),
      (e) => {
        if (e.type === "delta") text += e.text;
      },
    ),
    /interrumpió/,
  );
  assert.equal(text, "Recibido");
});
test("server errors and malformed NDJSON fail explicitly", async () => {
  await assert.rejects(
    readNDJSON(
      chunks(
        new TextEncoder().encode(
          '{"type":"error","message":"Servicio no disponible"}\n',
        ),
      ),
      () => {},
    ),
    /Servicio no disponible/,
  );
  await assert.rejects(
    readNDJSON(chunks(new TextEncoder().encode("not-json\n")), () => {}),
  );
});
test("abort stops reading without fabricating complete", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readNDJSON(
      chunks(new TextEncoder().encode('{"type":"complete"}')),
      () => {},
      controller.signal,
    ),
    { name: "AbortError" },
  );
});
test("widget comments are hidden even with invalid JSON or partial stream", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const parsed = parseDreamContent(
    `Antes <!--DREAM_WIDGET:{"type":"quiz","testId":"${id}","title":"Conceptos"}--> después <!--DREAM_WIDGET:broken--> <!--DREAM_ACTION:TEST-->`,
  );
  assert.equal(parsed.widgets.length, 1);
  assert.equal(parsed.requestTest, true);
  assert.ok(!parsed.text.includes("DREAM_"));
  assert.equal(
    parseDreamContent('Hola <!--DREAM_WIDGET:{"type":').text,
    "Hola ",
  );
});
test("LaTeX conversion respects code and ordinary parentheses", () => {
  assert.equal(
    normalizeMath("\\(x^2\\) y \\[a+b\\]"),
    "$x^2$ y \n$$\na+b\n$$\n",
  );
  assert.equal(
    normalizeMath("Texto (normal) y `\\(codigo\\)`"),
    "Texto (normal) y `\\(codigo\\)`",
  );
});
test("stream quotas retain safe retry metadata and preserve received text", async () => {
  const events: DreamStreamEvent[] = [];
  await assert.rejects(
    readNDJSON(
      chunks(
        new TextEncoder().encode(
          '{"type":"delta","text":"Ya recibido"}\n{"type":"error","message":"Espera","code":"dream_budget","retry_after":60}\n',
        ),
      ),
      (e) => events.push(e),
    ),
    (error: unknown) =>
      error instanceof Error &&
      "retryAfter" in error &&
      error.retryAfter === 60,
  );
  assert.equal(events.length, 2);
});
test("request deadline propagates cancellation without relying on newer Safari signal APIs", async () => {
  const { requestAbort } = await import("../lib/request-abort");
  const parent = new AbortController();
  const life = requestAbort(parent.signal, 1000);
  parent.abort();
  assert.equal(life.signal.aborted, true);
  life.dispose();
  const expired = requestAbort(undefined, 5);
  await new Promise<void>((resolve) =>
    expired.signal.addEventListener("abort", () => resolve(), { once: true }),
  );
  assert.equal(expired.signal.reason.name, "TimeoutError");
  expired.dispose();
});
