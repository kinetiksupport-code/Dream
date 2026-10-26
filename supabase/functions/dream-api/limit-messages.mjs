// Mensajes para el alumno cuando algo limita la respuesta. Tres casos que
// deben distinguirse (antes todos decían «Se ha alcanzado un límite de
// solicitudes»):
// (a) la IA está saturada: inténtalo en N segundos;
// (b) la búsqueda web no está disponible: se responde sin buscar;
// (c) el alumno ha llegado a su límite de uso de Dream.
import { WINDOW_LIMIT_CODE } from './usage-window.mjs';

// Límites propios del alumno en Dream.
const DREAM_USER_LIMITS = new Set(['dream_rpm', 'dream_daily', 'dream_budget']);
// Dream o el proveedor están ocupados: no es culpa del alumno.
const SATURATED = new Set(['provider_rate_limit', 'all_keys_cooling_down', 'dream_concurrency', 'dream_admission_busy', 'dream_queue']);
const PROVIDERS = new Set(['GroqProviderError', 'CloudflareProviderError']);

export const SEARCH_UNAVAILABLE_NOTICE = 'La búsqueda web no está disponible ahora mismo, así que te respondo sin buscar en internet.';
// Para la IA cuando la búsqueda ha fallado o no está configurada.
export const SEARCH_UNAVAILABLE_PROMPT = 'La búsqueda web no está disponible ahora. Responde sin buscar solo con lo que sepas con seguridad, di que no has podido comprobarlo en internet y, si no estás seguro, di que no lo sabes con claridad. No inventes datos.';

/** «20 segundos», «1 minuto», «3 minutos». */
export function waitText(seconds) {
  const s = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (s < 60) return s === 1 ? '1 segundo' : `${s} segundos`;
  const m = Math.ceil(s / 60);
  return m === 1 ? '1 minuto' : `${m} minutos`;
}

/**
 * ¿Qué tipo de límite es? null si el error no es un límite.
 * @param {any} error
 * @returns {'window'|'provider_daily'|'saturated'|'search'|'dream'|null}
 */
export function limitKind(error) {
  const code = error?.code;
  if (typeof code !== 'string') return null;
  if (error.name === 'TavilyError') return 'search';
  if (code === WINDOW_LIMIT_CODE) return 'window';
  if (code === 'provider_daily_limit') return 'provider_daily';
  if (DREAM_USER_LIMITS.has(code)) return 'dream';
  if (SATURATED.has(code) || (PROVIDERS.has(error.name) && error.status === 429)) return 'saturated';
  return null;
}

/** Mensaje para el alumno, o null si el error no es un límite. @param {any} error */
export function limitMessage(error) {
  const kind = limitKind(error);
  const wait = error?.retryAfter;
  switch (kind) {
    case 'window': return 'Has usado toda tu IA por ahora. Se reinicia al acabar tu ventana de uso de 5 horas.';
    case 'provider_daily': return 'La IA gratis de hoy se ha agotado. Vuelve más tarde.';
    case 'saturated': return `La IA está saturada ahora mismo. Inténtalo de nuevo en ${waitText(wait)}.`;
    case 'search': return 'La búsqueda web no está disponible ahora. Puedo responderte sin buscar: vuelve a enviar tu pregunta sin pedir que busque.';
    case 'dream': return error.code === 'dream_daily'
      ? 'Has alcanzado tu límite de uso de Dream de hoy. Vuelve mañana.'
      : `Has alcanzado tu límite de uso de Dream. Espera ${waitText(wait)} antes de volver a intentarlo.`;
    default: return null;
  }
}

/**
 * ¿Este fallo de la búsqueda deja responder sin buscar? Sí, salvo que el
 * alumno haya cancelado o sea un límite propio de Dream (ese manda).
 * @param {any} error
 */
export function searchCanBeSkipped(error) {
  if (error?.name === 'AdmissionError') return error.code === 'provider_rate_limit' || error.code === 'provider_daily_limit';
  if (error?.name === 'TavilyError') return error.code !== 'aborted';
  return true;
}
