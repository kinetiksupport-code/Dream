import { GROQ_NORMAL_MODEL } from "./models.mjs";

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
  "exam_route_regenerate",
]);
export const DEFAULT_GROQ_MODEL = GROQ_NORMAL_MODEL;
// Proveedores de IA que se cuentan en tokens (mismo formato de petición).
const TOKEN_PROVIDERS = new Set(["groq", "cloudflare"]);

export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const bytes = new TextEncoder().encode(text).length;
  const chars = Array.from(text).length;
  return Math.max(bytes, Math.ceil(chars / 2)) + 8;
}

export function estimateRequest(provider, body) {
  if (!TOKEN_PROVIDERS.has(provider)) return { input: 0, output: 0, images: 0, model: null };
  let images = 0;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const serialized = JSON.stringify(messages, (key, value) => {
    if (key === "url" && typeof value === "string" && value.startsWith("data:image/")) {
      images++;
      return "[image]";
    }
    return value;
  });
  const ceiling = Number(globalThis.Deno?.env?.get("DREAM_VISION_INPUT_TOKEN_CEILING") ?? 0);
  if (images && (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 300000)) {
    throw new AdmissionError("vision_budget_unconfigured", 503, 60);
  }
  const input = estimateTokens(serialized) + messages.length * 8 + images * ceiling;
  const output = Number(body?.max_tokens ?? body?.max_completion_tokens ?? 2048);
  if (input + output > 400000 || !Number.isInteger(output) || output < 0 || output > 4096) {
    throw new AdmissionError("context_budget", 413, 0);
  }
  return {
    input,
    output,
    images,
    model: typeof body?.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_GROQ_MODEL,
  };
}

export async function checkedRPC(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new AdmissionError("admission_unavailable", 503, 60);
  if (data?.ok === false) throw new AdmissionError(data.code, data.status, data.retry_after);
  return data;
}

export function createAdmission(db, owner, requestId) {
  const ids = { p_owner: owner, p_request: requestId };
  return {
    admit: (operation) => checkedRPC(db, "dream_admit", { ...ids, p_operation: operation }),
    beforeAttempt: async (provider, body = {}) => {
      const estimate = estimateRequest(provider, body);
      const attemptId = crypto.randomUUID();
      await checkedRPC(db, "dream_reserve", {
        ...ids,
        p_provider: provider,
        p_tokens: estimate.input + estimate.output,
        p_attempt: attemptId,
        p_model: estimate.model,
        p_input: estimate.input,
        p_output: estimate.output,
      });
      return {
        attemptId,
        reconcile: (usage) =>
          checkedRPC(db, "dream_reconcile", {
            p_owner: owner,
            p_attempt: attemptId,
            p_input: Number.isInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null,
            p_output: Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : null,
          }),
      };
    },
    pause: (provider, seconds) =>
      checkedRPC(db, "dream_provider_pause", { p_provider: provider, p_seconds: seconds }),
    release: () => checkedRPC(db, "dream_release", ids),
  };
}

export function retryAfterSeconds(value, now = Date.now()) {
  if (!value) return 60;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.min(2147483647, Math.max(1, Math.ceil(n)));
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
  const abort = () => { void reader.cancel().catch(() => {}); };
  req.signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (req.signal.aborted) throw new AdmissionError("request_timeout", 408, 5);
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
