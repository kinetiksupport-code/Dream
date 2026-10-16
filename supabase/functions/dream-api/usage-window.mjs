// Límite de uso por alumno en ventanas de 5 horas, contado en tokens
// (entrada + salida) y con un presupuesto distinto por modo.
// - La ventana empieza con el primer mensaje que se envía al proveedor cuando
//   no hay otra abierta, y dura WINDOW_HOURS.
// - Sin ventana abierta, todos los modos están al 0 %.
// - Un modo agotado queda bloqueado hasta el final de la ventana; los demás
//   siguen mientras les quede presupuesto.
// - El uso del respaldo (Cloudflare cuando falla Groq) se registra aparte y no
//   cuenta en estos límites.
// La cuenta atómica vive en Postgres (dream_ai_window_charge); aquí solo hay
// funciones puras y la llamada a las RPC.
import { AdmissionError, checkedRPC } from './admission.mjs';
import { MODES, WINDOW_MS, availableModes } from './models.mjs';

export const WINDOW_LIMIT_CODE = 'dream_mode_limit';

/** @param {{started_at?: string|null, ends_at?: string|null}|null|undefined} row */
export function windowState(row, now = Date.now()) {
  const started = row?.started_at ? Date.parse(row.started_at) : NaN;
  if (!Number.isFinite(started)) return { open: false, startedAt: null, endsAt: null };
  const ends = row?.ends_at ? Date.parse(row.ends_at) : started + WINDOW_MS;
  return now < ends ? { open: true, startedAt: started, endsAt: ends } : { open: false, startedAt: null, endsAt: null };
}

// Porcentaje entero. Solo llega a 100 cuando el modo está agotado de verdad.
export function percentUsed(tokens, budget) {
  const used = Math.max(0, Number(tokens) || 0);
  if (!(budget > 0)) return 100;
  if (used >= budget) return 100;
  return Math.min(99, Math.floor((used / budget) * 100));
}

export const modeBlocked = (tokens, budget) => Math.max(0, Number(tokens) || 0) >= budget;

// Resumen para el cliente: solo porcentajes y la hora de reinicio, nunca
// tokens ni nombres de modelo.
/** @param {{window?: {started_at?: string, ends_at?: string}|null, usage?: Array<{mode: string, kind: string, tokens: number}>}} data */
export function usageSummary(data, { now = Date.now(), modes = availableModes() } = {}) {
  const state = windowState(data?.window, now);
  const used = new Map();
  if (state.open) for (const row of data?.usage || []) {
    if (row?.kind !== 'mode') continue;
    used.set(row.mode, (used.get(row.mode) || 0) + (Number(row.tokens) || 0));
  }
  return {
    window: state.open ? { started_at: new Date(state.startedAt).toISOString(), ends_at: new Date(state.endsAt).toISOString() } : null,
    modes: modes.map((mode) => {
      const tokens = used.get(mode.id) || 0;
      const blocked = state.open && modeBlocked(tokens, mode.budgetTokens);
      return {
        id: mode.id,
        label: mode.label,
        percent: state.open ? percentUsed(tokens, mode.budgetTokens) : 0,
        blocked,
        resets_at: state.open ? new Date(state.endsAt).toISOString() : null,
      };
    }),
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
     * Comprueba y carga tokens en una sola transacción. kind 'mode' bloquea
     * si el modo está agotado; kind 'fallback' solo registra.
     * @param {{mode: string, kind: 'mode'|'fallback', provider: string, tokens: number}} input
     */
    charge: async ({ mode, kind, provider, tokens }) => {
      const config = MODES[mode];
      if (!config) throw new AdmissionError('invalid_mode', 400, 0);
      const attempt = crypto.randomUUID();
      await checkedRPC(db, 'dream_ai_window_charge', {
        p_owner: owner, p_mode: mode, p_kind: kind, p_provider: provider,
        p_tokens: Math.max(0, Math.min(400_000, Math.ceil(tokens))),
        p_budget: config.budgetTokens, p_attempt: attempt,
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
          await checkedRPC(db, 'dream_ai_window_settle', { p_owner: owner, p_attempt: attempt, p_tokens: Math.max(0, Math.ceil(tokensUsed)) });
        },
      };
    },
  };
}
