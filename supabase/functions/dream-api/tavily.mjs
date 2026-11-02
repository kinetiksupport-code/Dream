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
  "rae.es",
  "fundeu.es",
  "cervantes.es",
  "cervantesvirtual.com",
  "khanacademy.org",
  "educacionyfp.gob.es",
  "intef.es",
  "boe.es",
  "ine.es",
  "csic.es",
  "agenciasinc.es",
  "es.wikipedia.org",
  "britannica.com",
  "museodelprado.es",
  "nasa.gov",
  "esa.int",
  "iupac.org",
]);
export const SEARCH_EXCLUDE_DOMAINS = Object.freeze([
  "brainly.com",
  "brainly.lat",
  "brainly.in",
  "quizlet.com",
  "coursehero.com",
  "chegg.com",
  "studocu.com",
  "slader.com",
  "mathway.com",
  "symbolab.com",
  "photomath.com",
  "rincondelvago.com",
  "buenastareas.com",
  "clubensayos.com",
  "monografias.com",
  "gauthmath.com",
  "solvely.ai",
]);
/** Una misma consulta en 24 h no gasta otra búsqueda (memoria de la función). */
export const CACHE_MS = 24 * 3600 * 1000;
/** Noticias y cosas de hoy o de esta semana caducan antes: 1 h. */
export const NEWS_CACHE_MS = 3600 * 1000;
/** Búsqueda a fondo (search_depth «advanced», 2 créditos): más resultados. */
export const DEEP_RESULTS = 5;
export const DEEP_RESULT_CHARS = 600;
/** Con menos resultados que esto se busca otra vez, más amplio. */
export const MIN_RESULTS = 2;
/**
 * Cuerpo de la petición a Tavily (docs/HABLA_NATURAL.md, «Búsqueda»).
 * - Noticias: topic «news», sin las fuentes educativas preferidas.
 * - Reciente: time_range (day, week, month, year) y fecha de cada resultado.
 * - A fondo: search_depth «advanced» y 5 resultados.
 * - `wide`: segunda vuelta más amplia (sin ventana de fecha ni preferidas).
 */
/**
 * @param {string} query
 * @param {{topic?: string, timeRange?: string|null, deep?: boolean}} [options]
 * @param {boolean} [wide]
 */
export function searchBody(
  query,
  { topic = "general", timeRange = null, deep = false } = {},
  wide = false,
) {
  const news = topic === "news" && !wide;
  return {
    query: query.trim(),
    search_depth: deep ? "advanced" : "basic",
    max_results: deep ? DEEP_RESULTS : SEARCH_RESULTS,
    include_answer: false,
    ...(news ? { topic: "news" } : {}),
    ...(timeRange && !wide ? { time_range: timeRange } : {}),
    ...(news || wide
      ? {}
      : {
          include_domains: SEARCH_PREFER_DOMAINS,
          include_domains_mode: "prefer",
        }),
    exclude_domains: SEARCH_EXCLUDE_DOMAINS,
    include_published_date: true,
  };
}
const dateOf = (item) => {
  const d = new Date(String(item.published_date ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
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
    /**
     * @param {string} query
     * @param {{signal?: AbortSignal, beforeAttempt?: Function, pause?: Function, topic?: string, timeRange?: string|null, deep?: boolean}} [options]
     */
    async search(
      query,
      {
        signal,
        beforeAttempt,
        pause,
        topic = "general",
        timeRange = null,
        deep = false,
      } = {},
    ) {
      if (typeof query !== "string" || !query.trim() || query.length > 300)
        throw new TavilyError("invalid_query", 400);
      const opts = { topic, timeRange, deep };
      const key = `${cacheKey(query)}|${topic}|${timeRange ?? ""}|${deep ? 1 : 0}`;
      const ttl =
        topic === "news" || ["day", "week"].includes(timeRange)
          ? NEWS_CACHE_MS
          : CACHE_MS;
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttl) {
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
      const raw = await attempt(searchBody(query, opts), available);
      let items = raw;
      // Pocos resultados con fecha o noticias (o ninguno): otra vuelta más
      // amplia, en más sitios y sin ventana de fecha. Gasta otro crédito.
      if (!raw.length || (raw.length < MIN_RESULTS && (topic === "news" || timeRange))) {
        try {
          const more = await attempt(searchBody(query, opts, true), available);
          const seen = new Set(raw.map((r) => r.url));
          items = [...raw, ...more.filter((r) => !seen.has(r.url))];
          logger.log(
            JSON.stringify({
              provider: "tavily",
              widened: true,
              before: raw.length,
              after: items.length,
            }),
          );
        } catch (e) {
          if (e?.name === "AdmissionError" || signal?.aborted) throw e;
        }
      }
      const max = deep ? DEEP_RESULTS : SEARCH_RESULTS;
      const chars = deep ? DEEP_RESULT_CHARS : RESULT_CHARS;
      let results = items.map((item) => ({ ...item, date: dateOf(item) }));
      // Por fecha: lo más nuevo primero (lo que no tiene fecha, al final).
      if (topic === "news" || timeRange)
        results = results
          .map((r, i) => ({ r, i }))
          .sort(
            (a, b) =>
              (b.r.date ?? "").localeCompare(a.r.date ?? "") || a.i - b.i,
          )
          .map((x) => x.r);
      const value = JSON.stringify(
        results.slice(0, max).map((item) => ({
          title: String(item.title ?? "").slice(0, 200),
          url: String(item.url).slice(0, 500),
          ...(item.date ? { date: item.date } : {}),
          content: String(item.content ?? "").slice(0, chars),
        })),
      );
      cache.delete(key);
      cache.set(key, { at: now(), value });
      // La más antigua sale primero (orden de inserción del Map).
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return value;

      async function attempt(body, available) {
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
              body: JSON.stringify(body),
            });
            logger.log(
              JSON.stringify({
                provider: "tavily",
                status: response.status,
                key_slot: slot + 1,
                duration_ms: now() - start,
                depth: body.search_depth,
                topic: body.topic ?? "general",
                time_range: body.time_range ?? null,
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
            return data.results.slice(0, body.max_results).filter((item) => {
              try {
                return ["https:", "http:"].includes(new URL(item.url).protocol);
              } catch {
                return false;
              }
            });
          } catch (e) {
            if (e?.name === "AdmissionError" || e instanceof TavilyError)
              throw e;
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
      }
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
