// Modos de la IA en el cliente: solo nombres para el alumno y porcentajes.
// Los modelos, proveedores y presupuestos viven en el servidor
// (supabase/functions/dream-api/models.mjs).

export type AiModeId = "fast" | "normal" | "think";
export interface AiModeUsage {
  id: AiModeId;
  label: string;
  /** 0-100, entero. 100 solo cuando el modo está agotado. */
  percent: number;
  blocked: boolean;
  /** ISO; null si no hay ventana abierta. */
  resets_at: string | null;
}
export interface AiUsage {
  modes: AiModeUsage[];
  window: { started_at: string; ends_at: string } | null;
  default_mode: AiModeId;
}

export const DEFAULT_MODE: AiModeId = "normal";
export const WARN_PERCENT = 80;
const LABELS: Record<AiModeId, string> = {
  fast: "Rápido",
  normal: "Normal",
  think: "Pensar más",
};
export const MODE_HINTS: Record<AiModeId, string> = {
  fast: "Respuestas cortas",
  normal: "Equilibrado",
  think: "Más cuidadoso",
};
// Antes de saber nada del servidor (o si aún no tiene la acción de uso).
export const FALLBACK_USAGE: AiUsage = {
  modes: (["fast", "normal"] as const).map((id) => ({
    id,
    label: LABELS[id],
    percent: 0,
    blocked: false,
    resets_at: null,
  })),
  window: null,
  default_mode: DEFAULT_MODE,
};

const isMode = (v: unknown): v is AiModeId =>
  v === "fast" || v === "normal" || v === "think";

/** Acepta solo lo esperado; cualquier otra forma vuelve a los valores por defecto. */
export function parseUsage(data: unknown): AiUsage {
  if (!data || typeof data !== "object" || !("modes" in data))
    return FALLBACK_USAGE;
  const raw = (data as { modes: unknown }).modes;
  if (!Array.isArray(raw)) return FALLBACK_USAGE;
  const modes = raw.flatMap((m): AiModeUsage[] => {
    if (!m || typeof m !== "object" || !isMode(m.id)) return [];
    const percent = Math.max(
      0,
      Math.min(100, Math.round(Number(m.percent) || 0)),
    );
    return [
      {
        id: m.id,
        label: LABELS[m.id as AiModeId],
        percent,
        blocked: m.blocked === true,
        resets_at:
          typeof m.resets_at === "string" &&
          Number.isFinite(Date.parse(m.resets_at))
            ? m.resets_at
            : null,
      },
    ];
  });
  if (!modes.length) return FALLBACK_USAGE;
  const w = (data as { window?: unknown }).window;
  const window =
    w &&
    typeof w === "object" &&
    typeof (w as { ends_at?: unknown }).ends_at === "string"
      ? (w as AiUsage["window"])
      : null;
  const def = (data as { default_mode?: unknown }).default_mode;
  return { modes, window, default_mode: isMode(def) ? def : DEFAULT_MODE };
}

/** «2 h 10 min», «45 min», «menos de 1 min». */
export function formatResetIn(ms: number) {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "menos de 1 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** El modo elegido, si sigue disponible; si no, el de por defecto. */
export function pickMode(usage: AiUsage, preferred: string | null): AiModeId {
  const ids = usage.modes.map((m) => m.id);
  if (isMode(preferred) && ids.includes(preferred)) return preferred;
  return ids.includes(usage.default_mode) ? usage.default_mode : ids[0];
}

/** Otro modo al que cambiar cuando el actual está agotado. */
export function alternativeMode(usage: AiUsage, current: AiModeId) {
  return usage.modes.find((m) => m.id !== current && !m.blocked) ?? null;
}

// Preferencia del alumno en este navegador (comodidad; el servidor decide).
const KEY = "dream-ai-mode";
export function readStoredMode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function storeMode(mode: AiModeId) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* sin almacenamiento: se usa el modo por defecto */
  }
}
