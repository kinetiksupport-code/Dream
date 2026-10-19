// Límite de uso por alumno en ventanas de 5 horas: UN presupuesto conjunto
// para todos los modos (SHARED_WINDOW_BUDGET), contado en tokens «equivalentes
// a Normal». Cada modo lo gasta a su ritmo (MODE_WEIGHTS en models.mjs):
// Rápido la mitad, Normal lo normal y Pensar más el doble.
// - La ventana empieza con el primer mensaje que se envía al proveedor cuando
//   no hay otra abierta, y dura WINDOW_HOURS.
// - Sin ventana abierta, el uso está al 0 %.
// - Al agotar el presupuesto se bloquean TODOS los modos hasta el final de la
//   ventana.
// - Se guarda una fila por modo (para saber qué modo se usó), ya con el peso.
// - El uso del respaldo (Cloudflare cuando falla Groq) se registra aparte y no
//   cuenta en el límite.
// La cuenta atómica vive en Postgres (dream_ai_window_charge); aquí solo hay
// funciones puras y la llamada a las RPC.
import { AdmissionError, checkedRPC } from './admission.mjs';
import { MODES, SHARED_WINDOW_BUDGET, WINDOW_MS, availableModes, relativeCost, weightedTokens } from './models.mjs';

export const WINDOW_LIMIT_CODE = 'dream_mode_limit';

/** @param {{started_at?: string|null, ends_at?: string|null}|null|undefined} row */
export function windowState(row, now = Date.now()) {
  const started = row?.started_at ? Date.parse(row.started_at) : NaN;
  if (!Number.isFinite(started)) return { open: false, startedAt: null, endsAt: null };
  const ends = row?.ends_at ? Date.parse(row.ends_at) : started + WINDOW_MS;
  return now < ends ? { open: true, startedAt: started, endsAt: ends } : { open: false, startedAt: null, endsAt: null };
}

// Porcentaje entero. Solo llega a 100 cuando el límite está agotado de verdad.
export function percentUsed(tokens, budget) {
  const used = Math.max(0, Number(tokens) || 0);
  if (!(budget > 0)) return 100;
  if (used >= budget) return 100;
  return Math.min(99, Math.floor((used / budget) * 100));
}

export const modeBlocked = (tokens, budget) => Math.max(0, Number(tokens) || 0) >= budget;

// Resumen para el cliente: solo porcentajes, la hora de reinicio y cuánto
// gasta cada modo en palabras; nunca tokens ni nombres de modelo.
// - Arriba, el límite conjunto: { percent, blocked, resets_at }.
// - `modes[]` se mantiene para la web antigua: cada modo lleva el mismo
//   percent/blocked que el conjunto (al agotarse, se bloquean todos).
/** @param {{window?: {started_at?: string, ends_at?: string}|null, usage?: Array<{mode: string, kind: string, tokens: number}>}} data */
export function usageSummary(data, { now = Date.now(), modes = availableModes(), budget = SHARED_WINDOW_BUDGET } = {}) {
  const state = windowState(data?.window, now);
  let used = 0;
  if (state.open) for (const row of data?.usage || []) {
    if (row?.kind !== 'mode') continue;
    used += Math.max(0, Number(row.tokens) || 0);
  }
  const percent = state.open ? percentUsed(used, budget) : 0;
  const blocked = state.open && modeBlocked(used, budget);
  const resets_at = state.open ? new Date(state.endsAt).toISOString() : null;
  return {
    window: state.open ? { started_at: new Date(state.startedAt).toISOString(), ends_at: resets_at } : null,
    percent,
    blocked,
    resets_at,
    modes: modes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      percent,
      blocked,
      resets_at,
      ...relativeCost(mode.weight),
    })),
  };
}

// Estimación justa para cargar la ventana al enviar (≈3,5 caracteres por
// token en español + el máximo de salida). Al terminar se ajusta a lo que
// devuelve el proveedor.
export function estimateWindowTokens(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  let chars = 0;
  for (const m of messages) chars += typeof m?.content === 'string' ? m.content.length : JSON.stringify(m?.content ?? '').length;
  const output = Number(body?.max_tokens ?? body?.max_completion_tokens ?? 0) || 0;
  return Math.ceil(chars / 3.5) + messages.length * 4 + output;
}

export function actualTokens(usage) {
  const input = Number.isInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null;
  const output = Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : null;
  return input === null || output === null ? null : input + output;
}

export function createWindowLimiter(db, owner) {
  return {
    /** Lee la ventana y el uso del alumno (solo lectura). */
    read: () => checkedRPC(db, 'dream_ai_usage', { p_owner: owner }),
    /**
     * Comprueba y carga tokens en una sola transacción. kind 'mode' carga
     * tokens × peso del modo y bloquea si el límite conjunto está agotado
     * (la suma de TODOS los modos de la ventana, en Postgres); kind
     * 'fallback' solo registra los tokens reales, que no cuentan.
     * @param {{mode: string, kind: 'mode'|'fallback', provider: string, tokens: number}} input
     */
    charge: async ({ mode, kind, provider, tokens }) => {
      const config = MODES[mode];
      if (!config) throw new AdmissionError('invalid_mode', 400, 0);
      // El mismo peso al cargar y al ajustar.
      /** @param {number} t */
      const toWindow = (t) => Math.min(400_000, kind === 'mode' ? weightedTokens(config, t) : Math.ceil(Math.max(0, Number(t) || 0)));
      const attempt = crypto.randomUUID();
      await checkedRPC(db, 'dream_ai_window_charge', {
        p_owner: owner, p_mode: mode, p_kind: kind, p_provider: provider,
        p_tokens: toWindow(tokens),
        p_budget: SHARED_WINDOW_BUDGET, p_attempt: attempt,
      });
      let settled = false;
      return {
        attempt,
        get settled() { return settled; },
        /** null = el proveedor no dio el uso: se queda la estimación. */
        settle: async (tokensUsed) => {
          if (settled) return;
          settled = true;
          if (tokensUsed === null || tokensUsed === undefined) return;
          await checkedRPC(db, 'dream_ai_window_settle', { p_owner: owner, p_attempt: attempt, p_tokens: toWindow(tokensUsed) });
        },
      };
    },
  };
}
