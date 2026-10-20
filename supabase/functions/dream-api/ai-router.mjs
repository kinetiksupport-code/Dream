// Elección de proveedor y respaldo para el chat.
// - Rápido y Normal van primero a Groq. Si TODAS las claves de Groq fallan
//   (5xx, caída o 429 en cada una), se prueba Cloudflare antes de mandar al
//   alumno a la cola. Solo si el respaldo está activado.
// - «Pensar más» va directo a Cloudflare, sin respaldo.
// - Nada de esto reintenta cuando ya ha llegado texto al alumno.
import { estimateWindowTokens, actualTokens } from './usage-window.mjs';

const FALLBACK_CODES = new Set([
  'all_keys_cooling_down', 'provider_unavailable', 'network_or_timeout',
  'empty_stream', 'incomplete_stream', 'malformed_stream',
]);

// ¿Este fallo de Groq justifica probar Cloudflare?
export function shouldFallback(error) {
  if (!error || error.emittedContent) return false;
  // Pausa compartida de Groq guardada en Postgres (tras un 429 reciente).
  if (error.name === 'AdmissionError') return error.code === 'provider_rate_limit';
  if (error.name !== 'GroqProviderError') return false;
  if (error.code === 'aborted' || error.code === 'missing_key' || error.code === 'stream_interrupted') return false;
  if (error.status === 429 || error.status >= 500) return true;
  return FALLBACK_CODES.has(error.code) || (error.retryable === true && /^http_/.test(error.code));
}

const producedOutput = (chunk) => {
  const delta = chunk?.choices?.[0]?.delta;
  return Boolean((typeof delta?.content === 'string' && delta.content) || delta?.tool_calls?.length);
};

/**
 * Lee del proveedor principal y, si falla antes de producir nada y el fallo
 * lo permite, del respaldo.
 * @param {{primary: () => AsyncIterable<any>, fallback?: (() => AsyncIterable<any>) | null, canFallback?: (e: unknown) => boolean, onFallback?: (e: unknown) => void}} options
 */
export async function* streamWithFallback({ primary, fallback = null, canFallback = shouldFallback, onFallback = undefined }) {
  let produced = false;
  try {
    for await (const chunk of primary()) {
      if (producedOutput(chunk)) produced = true;
      yield chunk;
    }
    return;
  } catch (error) {
    if (produced || !fallback || !canFallback(error)) throw error;
    onFallback?.(error);
  }
  yield* fallback();
}

/**
 * Une la admisión existente (cupos diarios y coste) con la ventana de 5 h.
 * - Cada intento enviado a un proveedor reserva en la admisión y carga la
 *   ventana: en el límite conjunto (con el peso del modo) si lo sirve el proveedor del modo, o
 *   aparte («fallback») si lo sirve el respaldo.
 * - Al terminar con éxito se ajusta al uso real; un intento que falla sin
 *   producir texto se devuelve a 0, así el alumno no paga las caídas.
 * @param {{admission: {beforeAttempt: (provider: string, body: Record<string, unknown>) => Promise<any>}, limiter: {charge: (input: {mode: string, kind: 'mode'|'fallback', provider: string, tokens: number}) => Promise<any>}, mode: {id: string, provider: string}}} options
 */
export function createAttemptTracker({ admission, limiter, mode }) {
  const pending = new Set();
  let reserved = null;
  async function refundPending() {
    for (const charge of [...pending]) {
      pending.delete(charge);
      await charge.settle(0).catch(() => {});
    }
  }
  async function charge(provider, body) {
    await refundPending();
    const reservation = await admission.beforeAttempt(provider, body);
    const windowCharge = await limiter.charge({
      mode: mode.id, kind: provider === mode.provider ? 'mode' : 'fallback', provider,
      tokens: estimateWindowTokens(body),
    });
    pending.add(windowCharge);
    return {
      reconcile: async (usage) => {
        await reservation?.reconcile?.(usage).catch(() => {});
        pending.delete(windowCharge);
        await windowCharge.settle(actualTokens(usage)).catch(() => {});
      },
    };
  }
  return {
    /** Reserva el primer intento ANTES de guardar el mensaje: si el límite conjunto está agotado, no se guarda nada. */
    reserveFirst: async (provider, body) => { reserved = { provider, attempt: await charge(provider, body) }; },
    beforeAttempt: async (provider, body) => {
      if (reserved && reserved.provider === provider) { const { attempt } = reserved; reserved = null; return attempt; }
      reserved = null;
      return charge(provider, body);
    },
    /** answered: si llegó texto al alumno, lo pendiente se queda con la estimación. */
    finish: async ({ answered }) => {
      if (answered) { for (const c of pending) await c.settle(null).catch(() => {}); pending.clear(); }
      else await refundPending();
    },
  };
}

// ---------------------------------------------------------------------------
// El razonamiento de un modelo nunca llega al alumno ni se guarda.
// Los parámetros de models.mjs (reasoningParams) ya lo piden así a Groq; esto
// es la segunda barrera, por si un proveedor lo devuelve igualmente:
// - campos aparte (`reasoning`, `reasoning_content`): se descartan;
// - texto entre <think> y </think> dentro de `content`: se quita, también si
//   las etiquetas llegan partidas entre fragmentos.
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

// Cuántos caracteres del final de `text` pueden ser el principio de `tag`.
function partialTagLength(text, tag) {
  for (let k = Math.min(tag.length - 1, text.length); k > 0; k--) {
    if (tag.startsWith(text.slice(-k))) return k;
  }
  return 0;
}

export function createReasoningFilter() {
  let inside = false;
  let pending = '';
  let trimStart = false; // quita los saltos de línea que siguen a </think>
  const visible = (text) => {
    if (!trimStart) return text;
    const out = text.replace(/^\s+/, '');
    if (out) trimStart = false;
    return out;
  };
  return {
    /** @param {string} text */
    push(text) {
      let buf = pending + text;
      pending = '';
      let out = '';
      while (buf) {
        const tag = inside ? THINK_CLOSE : THINK_OPEN;
        const at = buf.indexOf(tag);
        if (at >= 0) {
          if (!inside) out += visible(buf.slice(0, at));
          buf = buf.slice(at + tag.length);
          inside = !inside;
          if (!inside) trimStart = true;
          continue;
        }
        const keep = partialTagLength(buf, tag);
        if (!inside) out += visible(buf.slice(0, buf.length - keep));
        pending = buf.slice(buf.length - keep);
        buf = '';
      }
      return out;
    },
    /** Lo que quedó retenido al acabar: nada si el razonamiento no se cerró. */
    flush() {
      const out = inside ? '' : visible(pending);
      pending = '';
      return out;
    },
  };
}

/** @param {AsyncIterable<any>} stream */
export async function* withoutReasoning(stream) {
  const filter = createReasoningFilter();
  for await (const chunk of stream) {
    const choices = chunk?.choices;
    const choice = Array.isArray(choices) ? choices[0] : null;
    const delta = choice?.delta;
    if (!delta || typeof delta !== 'object') { yield chunk; continue; }
    const { reasoning, reasoning_content, content, ...rest } = delta;
    const clean = typeof content === 'string' ? filter.push(content) : content;
    const nextDelta = clean === '' || clean === undefined ? rest : { ...rest, content: clean };
    yield { ...chunk, choices: [{ ...choice, delta: nextDelta }, ...choices.slice(1)] };
  }
  const tail = filter.flush();
  if (tail) yield { choices: [{ delta: { content: tail } }] };
}
