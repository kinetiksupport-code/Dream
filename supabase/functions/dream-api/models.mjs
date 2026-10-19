// Modos de la IA de Dream: ÚNICO sitio donde se elige proveedor, modelo,
// límites de salida, historial y presupuesto de cada modo. El alumno solo ve
// «Rápido», «Normal» y «Pensar más»; nunca los nombres de los modelos.
// Explicación de las cifras: docs/MODOS_IA.md.
import { answerTokenBudget } from './capacity.mjs';

// Interruptores (docs/MODOS_IA.md §6). ENCENDIDOS desde el 19/10/2026.
// Se cambian aquí, en el código, para que activarlos pase por revisión y
// despliegue. Encendidos no bastan: sin los secretos CLOUDFLAREAI_API_KEY y
// CLOUDFLARE_ACCOUNT_ID (válidos), «Pensar más» no se ofrece y el respaldo
// sigue apagado en silencio (modeAvailable, fallbackAvailable).
/** @type {Readonly<{thinkMode: boolean, cloudflareFallback: boolean}>} */
export const AI_FLAGS = Object.freeze({
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

// Groq: si retira «qwen/qwen3.8-27b» (está en Preview), cambiar Normal a
// «openai/gpt-oss-120b» AQUÍ (Groq retiró «llama-3.3-70b-versatile» el
// 16/08/2026 en los planes gratis y Developer). Su precio ya está en
// dream_private.model_prices.
// ⚠️ «llama-3.1-8b-instant» (Rápido) también está retirado desde el
// 16/08/2026 salvo con contrato Enterprise. Groq recomienda
// «openai/gpt-oss-20b». Pendiente de decisión de Carlos: docs/MODOS_IA.md §2.
export const GROQ_NORMAL_MODEL = 'qwen/qwen3.8-27b';
export const GROQ_FAST_MODEL = 'llama-3.1-8b-instant';

export const MODE_IDS = Object.freeze(['fast', 'normal', 'think']);
export const DEFAULT_MODE = 'normal';

// budgetTokens: tokens (entrada + salida) por alumno, modo y ventana de 5 h.
// ⚠️ PENDIENTES DE OK DE CARLOS. Cálculo en docs/MODOS_IA.md §3.
export const MODES = Object.freeze({
  fast: Object.freeze({
    id: 'fast',
    label: 'Rápido',
    provider: 'groq',
    model: GROQ_FAST_MODEL,
    maxOutputTokens: 500,
    longOutputTokens: 900,
    temperature: 0.4,
    tools: true,
    history: Object.freeze({ maxMessages: 8, recentFull: 2, recentChars: 1500, olderChars: 200, totalChars: 3000 }),
    attachmentChars: 12_000,
    budgetTokens: 30_000, // PENDIENTE DE OK
    flag: null,
  }),
  normal: Object.freeze({
    id: 'normal',
    label: 'Normal',
    provider: 'groq',
    model: GROQ_NORMAL_MODEL,
    maxOutputTokens: 1200,
    longOutputTokens: 2048,
    temperature: 0.5,
    tools: true,
    history: Object.freeze({ maxMessages: 14, recentFull: 4, recentChars: 3000, olderChars: 300, totalChars: 7000 }),
    attachmentChars: null, // el máximo general de adjuntos
    budgetTokens: 40_000, // PENDIENTE DE OK
    flag: null,
  }),
  think: Object.freeze({
    id: 'think',
    label: 'Pensar más',
    provider: 'cloudflare',
    model: CLOUDFLARE_MODEL,
    maxOutputTokens: 1500,
    longOutputTokens: 2048,
    temperature: 0.3,
    tools: false,
    history: Object.freeze({ maxMessages: 6, recentFull: 2, recentChars: 2000, olderChars: 200, totalChars: 4000 }),
    attachmentChars: 8_000,
    budgetTokens: 12_000, // PENDIENTE DE OK
    flag: 'thinkMode',
  }),
});

// Respaldo con Cloudflare para Rápido y Normal: contexto corto y salida corta.
// Su uso se registra aparte y NO cuenta en el presupuesto del modo.
export const CLOUDFLARE_FALLBACK = Object.freeze({
  provider: 'cloudflare',
  model: CLOUDFLARE_MODEL,
  maxOutputTokens: 700,
  temperature: 0.4,
  history: Object.freeze({ maxMessages: 4, recentFull: 2, recentChars: 1500, olderChars: 150, totalChars: 2500 }),
  attachmentChars: 6_000,
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
