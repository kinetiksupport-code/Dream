export class AdmissionError extends Error {
  constructor(code, status = 429, retryAfter = 5) {
    super(code);
    this.name = "AdmissionError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export const consumingActions = new Set([
  "chat",
  "attachment_upload",
  "test_generate",
  "test_check_answer",
  "test_submit",
  "exam_prepare",
  "exam_session_create",
  "exam_session_submit",
]);
export async function checkedRPC(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new AdmissionError("admission_unavailable", 503, 60);
  if (data?.ok === false)
    throw new AdmissionError(data.code, data.status, data.retry_after);
  return data;
}
export function createAdmission(db, owner, requestId) {
  const ids = { p_owner: owner, p_request: requestId };
  return {
    admit: (operation) =>
      checkedRPC(db, "dream_admit", { ...ids, p_operation: operation }),
    beforeAttempt: async (provider, body) => {
      // UTF-8 bytes bound text tokens conservatively. Images also count their full encoded size:
      // refuse contexts beyond the configured ceiling rather than silently underbudget vision.
      let images = 0;
      const serialized = JSON.stringify(body.messages ?? [], (key, value) => {
        if (
          key === "url" &&
          typeof value === "string" &&
          value.startsWith("data:image/")
        ) {
          images++;
          return "[image]";
        }
        return value;
      });
      const ceiling = Number(
        globalThis.Deno?.env.get("DREAM_VISION_INPUT_TOKEN_CEILING") ?? 0,
      );
      if (
        images &&
        (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 300000)
      )
        throw new AdmissionError("vision_budget_unconfigured", 503, 60);
      const input =
        provider === "groq"
          ? new TextEncoder().encode(serialized).length + images * ceiling
          : 0;
      const output =
        provider === "groq"
          ? Number(body.max_tokens ?? body.max_completion_tokens ?? 2048)
          : 0;
      if (
        input + output > 400000 ||
        !Number.isInteger(output) ||
        output < 0 ||
        output > 4096
      )
        throw new AdmissionError("context_budget", 413, 0);
      await checkedRPC(db, "dream_reserve", {
        ...ids,
        p_provider: provider,
        p_tokens: input + output,
      });
    },
    pause: (provider, seconds) =>
      checkedRPC(db, "dream_provider_pause", {
        p_provider: provider,
        p_seconds: seconds,
      }),
    release: () => checkedRPC(db, "dream_release", ids),
  };
}
export function retryAfterSeconds(value, now = Date.now()) {
  if (!value) return 60;
  const n = Number(value);
  // Never shorten an explicit provider cooldown. Unknown/oversized values fail closed for the maximum representable interval.
  if (Number.isFinite(n))
    return Math.min(2147483647, Math.max(1, Math.ceil(n)));
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(2147483647, Math.max(1, Math.ceil((date - now) / 1000)))
    : 60;
}
export async function readBoundedBody(req, maxBytes) {
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new AdmissionError("body_too_large", 413, 0);
  const reader = req.body?.getReader();
  if (!reader) throw new AdmissionError("invalid_body", 400, 0);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  req.signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (req.signal.aborted)
        throw new AdmissionError("request_timeout", 408, 5);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new AdmissionError("body_too_large", 413, 0);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    req.signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
