import type { DreamStreamEvent } from "./types";
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
    return { type: "error", message: v.message };
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
    if (event.type === "error") throw new Error(event.message);
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
