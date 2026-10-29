import { retryAfterSeconds } from "./admission.mjs";
// Resultados que se reenvían a la IA: 3 de 700 caracteres (antes 4 de 1.200),
// para que la segunda llamada de la búsqueda gaste menos tokens.
export const SEARCH_RESULTS = 3;
export const RESULT_CHARS = 700;
/**
 * Fuentes (P4, docs/HABLA_NATURAL.md; lista para que la revise Carlos).
 * Preferidas: educativas y oficiales. Con include_domains_mode «prefer»
 * Tavily las pone delante pero sigue buscando en el resto de la web.
 * Excluidas: webs de deberes resueltos y de trabajos copiados.
 */
export const SEARCH_PREFER_DOMAINS = Object.freeze([
  "rae.es", "fundeu.es", "cervantes.es", "cervantesvirtual.com",
  "khanacademy.org", "educacionyfp.gob.es", "intef.es", "boe.es",
  "ine.es", "csic.es", "agenciasinc.es", "es.wikipedia.org", "britannica.com",
  "museodelprado.es", "nasa.gov", "esa.int", "iupac.org",
]);
export const SEARCH_EXCLUDE_DOMAINS = Object.freeze([
  "brainly.com", "brainly.lat", "brainly.in", "quizlet.com", "coursehero.com",
  "chegg.com", "studocu.com", "slader.com", "mathway.com", "symbolab.com",
  "photomath.com", "rincondelvago.com", "buenastareas.com", "clubensayos.com",
  "monografias.com", "gauthmath.com", "solvely.ai",
]);
/** Una misma consulta en 24 h no gasta otra búsqueda (memoria de la función). */
export const CACHE_MS = 24 * 3600 * 1000;
export const CACHE_MAX = 200;
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
  // Caché por consulta (ya limpia de datos del alumno: sanitizeSearchQuery).
  // Vive mientras la función está caliente; nunca guarda nada del alumno.
  /** @type {Map<string, {at: number, value: string}>} */
  const cache = new Map();
  const cacheKey = (q) => q.trim().toLowerCase().replace(/\s+/g, " ");
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
      const hit = cache.get(cacheKey(query));
      if (hit && now() - hit.at < CACHE_MS) {
        logger.log(JSON.stringify({ provider: "tavily", cache: "hit" }));
        return hit.value;
      }
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
      // Esperas de las claves que han dado 429 en esta búsqueda.
      const limited = [];
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
              include_domains: SEARCH_PREFER_DOMAINS,
              include_domains_mode: "prefer",
              exclude_domains: SEARCH_EXCLUDE_DOMAINS,
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
            // Un 429 enfría solo esa clave y se prueba la siguiente.
            if (response.status === 429) {
              const wait = retryAfterSeconds(
                response.headers.get("retry-after"),
                now(),
              );
              health.set(slot, now() + wait * 1000);
              limited.push(wait);
              last = new TavilyError("provider_rate_limit", 429, wait);
              continue;
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
          const value = JSON.stringify(results);
          cache.delete(cacheKey(query));
          cache.set(cacheKey(query), { at: now(), value });
          // La más antigua sale primero (orden de inserción del Map).
          while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
          return value;
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
      // Todas las claves libres dieron 429: solo entonces se bloquea Tavily
      // (y se guarda la pausa) hasta que quede libre la primera.
      if (limited.length && limited.length === available.length) {
        const wait = Math.min(...limited);
        blockedUntil = now() + wait * 1000;
        await pause?.("tavily", wait);
        throw new TavilyError("provider_rate_limit", 429, wait);
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
