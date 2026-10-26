// Modos de la IA de Dream: ÚNICO sitio donde se elige proveedor, modelo,
// límites de salida, historial, el límite conjunto y lo que gasta cada modo. El alumno solo ve
// «Rápido», «Normal» y «Pensar más»; nunca los nombres de los modelos.
// Explicación de las cifras: docs/MODOS_IA.md.
import { answerTokenBudget } from './capacity.mjs';

// Interruptores (docs/MODOS_IA.md §6). ENCENDIDOS desde el 19/10/2026.
// Se cambian aquí, en el código, para que activarlos pase por revisión y
// despliegue. Encendidos no bastan: sin los secretos CLOUDFLAREAI_API_KEY y
// CLOUDFLARE_ACCOUNT_ID (válidos), «Pensar más» no se ofrece y el respaldo
// sigue apagado en silencio (modeAvailable, fallbackAvailable).
/** @type {Readonly<{thinkMode: boolean, cloudflareFallback: boolean, mathCheck: boolean}>} */
export const AI_FLAGS = Object.freeze({
  // Comprobar las operaciones de las respuestas de ciencias antes de enseñarlas
  // (math-tools.mjs). APAGADO hasta medirlo con los evals: quita el «escribir
  // poco a poco» en esas respuestas y puede gastar una llamada más.
  mathCheck: false,
  // «Pensar más» visible y usable (necesita también los secretos de Cloudflare).
  thinkMode: true,
  // Respaldo con Cloudflare Workers AI cuando fallan todas las claves de Groq.
  cloudflareFallback: true,
});

// Ventana de uso por alumno: empieza con el primer mensaje enviado cuando no
// hay otra abierta y dura 5 horas.
export const WINDOW_HOURS = 5;
export const WINDOW_MS = WINDOW_HOURS * 3600_000;

// Comprobado el 19/10/2026 en developers.cloudflare.com/workers-ai/models/
// mistral-small-3.1-24b-instruct/ (no está en la lista de retirados del
// 08/05/2026). Precio en supabase/migrations/20261019143700_verified_model_prices.sql.
export const CLOUDFLARE_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

// Groq, comprobado el 19/10/2026 (docs/MODOS_IA.md §2):
// - Normal: «qwen/qwen3.8-27b» (Preview). Si Groq lo retira, cambiar a
//   «openai/gpt-oss-120b» AQUÍ; su precio ya está en dream_private.model_prices.
// - Rápido: «openai/gpt-oss-20b», el sustituto que Groq recomienda para
//   «llama-3.1-8b-instant» (retirado el 16/08/2026 en Free/Developer).
//   Es un modelo de razonamiento: ver reasoningParams.
export const GROQ_NORMAL_MODEL = 'qwen/qwen3.8-27b';
export const GROQ_FAST_MODEL = 'openai/gpt-oss-20b';

export const MODE_IDS = Object.freeze(['fast', 'normal', 'think']);
export const DEFAULT_MODE = 'normal';

// ---------------------------------------------------------------------------
// LÍMITE CONJUNTO (decisión de Carlos, 19/10/2026; docs/MODOS_IA.md §3).
// «El límite es uno conjunto y los modelos más altos consumen más.»
// - Un solo presupuesto por alumno y ventana de 5 h, compartido por todos los
//   modos, contado en tokens «equivalentes a Normal» (entrada + salida).
// - Cada petición carga ceil(tokens reales × peso del modo); el ajuste final
//   (settle) usa el mismo peso.
// - El respaldo de Cloudflare (kind 'fallback') NO cuenta, como antes.
// Para cambiar el límite o lo que gasta cada modo, toca SOLO estas dos líneas.
export const SHARED_WINDOW_BUDGET = 60_000;
export const MODE_WEIGHTS = Object.freeze({ fast: 0.5, normal: 1, think: 2 });
// Qué cuenta contra el límite del alumno (Bloque 8, 26/10/2026). Antes contaba
// TODO lo enviado: cada mensaje de Normal cargaba ~4.700 tokens de prompt de
// sistema y el límite se acababa en 7 mensajes. Ahora el prompt de sistema y
// la capa pedagógica son coste de Dream, no del alumno: cuenta su mensaje
// nuevo, la respuesta (con el razonamiento oculto) y una fracción del
// historial, de sus apuntes y de los resultados de búsqueda.
export const WINDOW_CONTEXT_SHARE = 0.25;
// Tokens que gasta un mensaje normal con esa cuenta (estimación hasta medir
// una semana: ~40 del alumno + 25 % de ~1.800 de historial + ~600 de salida).
// Solo sirve para decirle «te quedan unos N mensajes».
export const TYPICAL_MESSAGE_TOKENS = 1_100;
// ---------------------------------------------------------------------------

export const MODES = Object.freeze({
  fast: Object.freeze({
    id: 'fast',
    label: 'Rápido',
    provider: 'groq',
    model: GROQ_FAST_MODEL,
    // gpt-oss razona antes de escribir y Groq no documenta si esos tokens
    // entran en el máximo de salida: se deja margen (antes 500/900 con Llama
    // 8B). La respuesta visible sigue corta por el prompt (≤120 palabras).
    maxOutputTokens: 900,
    longOutputTokens: 1400,
    reasoningEffort: 'low',
    temperature: 0.4,
    tools: true,
    history: Object.freeze({ maxMessages: 8, recentFull: 2, recentChars: 1500, olderChars: 200, totalChars: 3000 }),
    attachmentChars: 12_000,
    weight: MODE_WEIGHTS.fast,
    flag: null,
  }),
  normal: Object.freeze({
    id: 'normal',
    label: 'Normal',
    provider: 'groq',
    model: GROQ_NORMAL_MODEL,
    maxOutputTokens: 1200,
    longOutputTokens: 2048,
    reasoningEffort: null, // Qwen 3.8: esfuerzo por defecto (ver reasoningParams)
    temperature: 0.5,
    tools: true,
    history: Object.freeze({ maxMessages: 14, recentFull: 4, recentChars: 3000, olderChars: 300, totalChars: 7000 }),
    attachmentChars: null, // el máximo general de adjuntos
    weight: MODE_WEIGHTS.normal,
    flag: null,
  }),
  think: Object.freeze({
    id: 'think',
    label: 'Pensar más',
    provider: 'cloudflare',
    model: CLOUDFLARE_MODEL,
    maxOutputTokens: 1500,
    longOutputTokens: 2048,
    reasoningEffort: null, // Cloudflare: sin parámetros de razonamiento
    temperature: 0.3,
    tools: false,
    history: Object.freeze({ maxMessages: 6, recentFull: 2, recentChars: 2000, olderChars: 200, totalChars: 4000 }),
    attachmentChars: 8_000,
    weight: MODE_WEIGHTS.think,
    flag: 'thinkMode',
  }),
});

// Respaldo con Cloudflare para Rápido y Normal: contexto corto y salida corta.
// Su uso se registra aparte y NO cuenta en el límite conjunto.
export const CLOUDFLARE_FALLBACK = Object.freeze({
  provider: 'cloudflare',
  model: CLOUDFLARE_MODEL,
  maxOutputTokens: 700,
  temperature: 0.4,
  history: Object.freeze({ maxMessages: 4, recentFull: 2, recentChars: 1500, olderChars: 150, totalChars: 2500 }),
  attachmentChars: 6_000,
});

// Turno con búsqueda web (Rápido y Normal): la primera llamada solo decide la
// consulta y la segunda responde con los resultados. Las dos van con contexto
// corto para quedar muy por debajo de los 8.000 tokens por minuto de Groq.
export const SEARCH_TURN = Object.freeze({
  plannerMaxTokens: 600, // cabe el razonamiento oculto + la llamada a la herramienta
  answerMaxTokens: 1000,
  history: Object.freeze({ maxMessages: 2, recentFull: 2, recentChars: 1200, olderChars: 200, totalChars: 2400 }),
});

export function modeAvailable(id, { flags = AI_FLAGS, cloudflareConfigured = false } = {}) {
  const mode = MODES[id];
  if (!mode) return false;
  if (mode.flag && !flags[mode.flag]) return false;
  if (mode.provider === 'cloudflare' && !cloudflareConfigured) return false;
  return true;
}

// Contexto con el que dream-api decide qué modos ofrece: flags del código +
// si el proveedor de Cloudflare tiene secretos válidos. Lo usan `ai_usage`
// (lo que ve la web) y `chat` (lo que acepta), así nunca discrepan.
/** @param {{configured: () => boolean}} cloudflare */
export function aiContextFor(cloudflare, flags = AI_FLAGS) {
  return { flags, cloudflareConfigured: Boolean(cloudflare?.configured()) };
}

// Parámetros de razonamiento según el modelo REAL que se envía a Groq (el
// secreto GROQ_MODEL puede cambiar el de Normal). Así el razonamiento nunca
// llega al texto de la respuesta (console.groq.com/docs/reasoning):
// - gpt-oss: `reasoning_effort` (low/medium/high) e `include_reasoning: false`.
//   No admite `reasoning_format`.
// - Qwen 3.8: `reasoning_format: 'hidden'` (solo la respuesta final). Sin él,
//   el formato por defecto es `raw`, con <think> dentro del texto.
// Otros modelos: nada. Cloudflare no recibe estos parámetros.
// Además, ai-router.mjs (withoutReasoning) quita cualquier razonamiento que
// llegue igualmente, antes de enviarlo o guardarlo.
/** @param {string} model @param {{reasoningEffort?: string | null}} [mode] */
export function reasoningParams(model, mode = {}) {
  if (typeof model !== 'string') return {};
  if (/^openai\/gpt-oss-/.test(model)) {
    return { ...(mode.reasoningEffort ? { reasoning_effort: mode.reasoningEffort } : {}), include_reasoning: false };
  }
  if (/^qwen\/qwen3\.8-/.test(model)) return { reasoning_format: 'hidden' };
  return {};
}

export function availableModes(ctx = {}) {
  return MODE_IDS.filter((id) => modeAvailable(id, ctx)).map((id) => MODES[id]);
}

// Sin modo (clientes antiguos) se usa Normal. Un modo desconocido o apagado
// devuelve null: el servidor responde 400 en vez de cambiarlo a escondidas.
export function resolveMode(requested, ctx = {}) {
  if (requested === undefined || requested === null || requested === '') return MODES[DEFAULT_MODE];
  return typeof requested === 'string' && modeAvailable(requested, ctx) ? MODES[requested] : null;
}

// El respaldo solo existe para modos servidos por Groq.
export function fallbackAvailable(mode, { flags = AI_FLAGS, cloudflareConfigured = false } = {}) {
  return Boolean(mode && mode.provider === 'groq' && flags.cloudflareFallback && cloudflareConfigured);
}

// Salida limitada por modo; respuesta larga solo si el alumno pide apuntes,
// un resumen o algo para imprimir (misma regla que answerTokenBudget).
export function outputTokensFor(mode, prompt) {
  return answerTokenBudget(prompt, { short: mode.maxOutputTokens, long: mode.longOutputTokens ?? mode.maxOutputTokens });
}

// Lo que gasta un modo frente a Normal, en palabras para el alumno (nunca
// cifras ni tokens). Se calcula del peso, así cambiar MODE_WEIGHTS basta.
/** @param {number} weight @returns {{cost: 'less'|'same'|'more', relative_cost: string}} */
export function relativeCost(weight) {
  const w = Number(weight);
  if (!(w > 0) || w === 1) return { cost: 'same', relative_cost: 'lo normal' };
  const words = { 0.25: 'la cuarta parte', 0.5: 'la mitad', 2: 'el doble', 3: 'el triple', 4: 'el cuádruple' };
  return w < 1
    ? { cost: 'less', relative_cost: words[w] ?? 'menos' }
    : { cost: 'more', relative_cost: words[w] ?? 'más' };
}

// Tokens que se cargan al límite conjunto por un uso real del modo.
/** @param {{weight?: number}|undefined} mode @param {number} tokens */
export function weightedTokens(mode, tokens) {
  const weight = Number(mode?.weight) > 0 ? Number(mode.weight) : 1;
  return Math.ceil(Math.max(0, Number(tokens) || 0) * weight);
}
