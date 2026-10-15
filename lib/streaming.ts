import type { DreamStreamEvent } from "./types";
export class DreamStreamError extends Error {
  constructor(
    message: string,
    public code = "",
    public retryAfter = 0,
    public reverted = false,
    public position = 0,
  ) {
    super(message);
  }
  get status() {
    return /^(dream_|provider_)/.test(this.code) ? 429 : 503;
  }
}
const streamCodes = new Set([
  "dream_rpm",
  "dream_daily",
  "dream_concurrency",
  "dream_admission_busy",
  "dream_budget",
  "dream_queue",
  "provider_rate_limit",
  "provider_daily_limit",
  "all_keys_cooling_down",
  "budget_unconfigured",
  "lease_expired",
  "vision_budget_unconfigured",
  "stream_failed",
]);
export function parseEvent(line: string): DreamStreamEvent | null {
  if (!line.trim()) return null;
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    throw new Error(
      "La respuesta llegó con un formato incompleto. El texto recibido se conserva.",
    );
  }
  if (!v || typeof v !== "object" || !("type" in v))
    throw new Error("Dream recibió un evento no válido.");
  if (v.type === "delta" && "text" in v && typeof v.text === "string")
    return { type: "delta", text: v.text };
  if (
    v.type === "activity" &&
    "activity" in v &&
    typeof v.activity === "string"
  )
    return { type: "activity", activity: v.activity };
  if (v.type === "complete") return { type: "complete" };
  if (v.type === "error" && "message" in v && typeof v.message === "string")
    return {
      type: "error",
      message: v.message,
      ...("code" in v && typeof v.code === "string" && streamCodes.has(v.code)
        ? { code: v.code }
        : {}),
      ...("retry_after" in v &&
      typeof v.retry_after === "number" &&
      Number.isFinite(v.retry_after) &&
      v.retry_after > 0
        ? { retry_after: Math.ceil(v.retry_after) }
        : {}),
      ...("position" in v &&
      typeof v.position === "number" &&
      Number.isInteger(v.position) &&
      v.position > 0
        ? { position: v.position }
        : {}),
      ...("reverted" in v && v.reverted === true ? { reverted: true } : {}),
    };
  return null;
}
export async function readNDJSON(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: DreamStreamEvent) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  const process = (line: string) => {
    const event = parseEvent(line);
    if (!event) return;
    if (event.type === "error") {
      onEvent(event);
      throw new DreamStreamError(
        event.message,
        event.code,
        event.retry_after,
        event.reverted,
        event.position,
      );
    }
    if (event.type === "complete") complete = true;
    onEvent(event);
  };
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Detenido", "AbortError");
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000)
        throw new Error("Respuesta demasiado grande.");
      let n;
      while ((n = buffer.indexOf("\n")) >= 0) {
        process(buffer.slice(0, n));
        buffer = buffer.slice(n + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) process(buffer);
    if (!complete && !signal?.aborted)
      throw new Error(
        "La conexión se interrumpió. El texto recibido se conserva.",
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
