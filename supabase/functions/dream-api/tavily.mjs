import { retryAfterSeconds } from "./admission.mjs";
// Resultados que se reenvían a la IA: 3 de 700 caracteres (antes 4 de 1.200),
// para que la segunda llamada de la búsqueda gaste menos tokens.
export const SEARCH_RESULTS = 3;
export const RESULT_CHARS = 700;
export class TavilyError extends Error {
  constructor(code, status = 503, retryAfter = 0) {
    super(code);
    this.name = "TavilyError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export function createTavilyManager({
  getEnv = (name) => Deno.env.get(name),
  fetchImpl = fetch,
  now = () => Date.now(),
  logger = console,
} = {}) {
  let blockedUntil = 0;
  const health = new Map();
  const keys = () => {
    const names = ["TAVILY_API_KEY_1", "TAVILY_API_KEY_2"];
    const values = names
      .map((n) => getEnv(n)?.trim())
      .filter((k) => k && !/[\s"']/.test(k));
    if (!values.length) {
      const old = getEnv("TAVILY_API_KEY")?.trim();
      if (old && !/[\s"']/.test(old)) values.push(old);
    }
    return [...new Set(values)];
  };
  return {
    configured: () => keys().length > 0,
    async search(query, { signal, beforeAttempt, pause } = {}) {
      if (typeof query !== "string" || !query.trim() || query.length > 300)
        throw new TavilyError("invalid_query", 400);
      if (blockedUntil > now())
        throw new TavilyError(
          "provider_rate_limit",
          429,
          Math.ceil((blockedUntil - now()) / 1000),
        );
      const available = keys()
        .map((key, slot) => ({ key, slot }))
        .filter((x) => (health.get(x.slot) ?? 0) <= now());
      if (!available.length) throw new TavilyError("web_search_unavailable");
      const overall = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(25000),
      ]);
      let last = new TavilyError("web_search_failed");
      for (const { key, slot } of available) {
        await beforeAttempt?.("tavily", {});
        const start = now();
        try {
          const response = await fetchImpl("https://api.tavily.com/search", {
            method: "POST",
            signal: AbortSignal.any([overall, AbortSignal.timeout(10000)]),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              query: query.trim(),
              search_depth: "basic",
              max_results: SEARCH_RESULTS,
              include_answer: false,
            }),
          });
          logger.log(
            JSON.stringify({
              provider: "tavily",
              status: response.status,
              key_slot: slot + 1,
              duration_ms: now() - start,
            }),
          );
          if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 429) {
              const wait = retryAfterSeconds(
                response.headers.get("retry-after"),
                now(),
              );
              blockedUntil = now() + wait * 1000;
              await pause?.("tavily", wait);
              throw new TavilyError("provider_rate_limit", 429, wait);
            }
            const recoverable =
              [401, 403, 408, 425].includes(response.status) ||
              response.status >= 500;
            if (!recoverable) throw new TavilyError("web_search_failed", 502);
            health.set(
              slot,
              now() + ([401, 403].includes(response.status) ? 900000 : 30000),
            );
            last = new TavilyError("web_search_failed", 503);
            continue;
          }
          const text = await readLimited(response, 100000);
          const data = JSON.parse(text);
          if (!Array.isArray(data.results))
            throw new TavilyError("invalid_search_response", 502);
          const results = data.results
            .slice(0, SEARCH_RESULTS)
            .filter((item) => {
              try {
                return ["https:", "http:"].includes(new URL(item.url).protocol);
              } catch {
                return false;
              }
            })
            .map((item) => ({
              title: String(item.title ?? "").slice(0, 200),
              url: String(item.url).slice(0, 500),
              content: String(item.content ?? "").slice(0, RESULT_CHARS),
            }));
          return JSON.stringify(results);
        } catch (e) {
          if (e?.name === "AdmissionError" || e instanceof TavilyError) throw e;
          if (overall.aborted)
            throw new TavilyError(
              signal?.aborted ? "aborted" : "web_search_timeout",
              503,
            );
          health.set(slot, now() + 30000);
          last = new TavilyError("web_search_failed", 503);
        }
      }
      throw last;
    },
  };
}
async function readLimited(response, max) {
  const reader = response.body?.getReader();
  if (!reader) throw new TavilyError("invalid_search_response", 502);
  let size = 0,
    text = "";
  const d = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + d.decode();
      size += value.byteLength;
      if (size > max) throw new TavilyError("oversized_search_response", 502);
      text += d.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export const tavilyProvider = createTavilyManager();
