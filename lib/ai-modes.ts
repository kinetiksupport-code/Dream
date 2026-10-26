// Modos de la IA en el cliente: solo nombres para el alumno y porcentajes.
// Los modelos, proveedores, el límite y lo que gasta cada modo viven en el
// servidor (supabase/functions/dream-api/models.mjs).
// El límite es UNO conjunto para todos los modos; cada modo lo gasta a su
// ritmo (Rápido menos, Pensar más el doble).

export type AiModeId = "fast" | "normal" | "think";
/** Lo que gasta un modo frente a Normal. */
export type AiModeCost = "less" | "same" | "more";
export interface AiModeUsage {
  id: AiModeId;
  label: string;
  /** 0-100, entero. Con el servidor nuevo, igual que el límite conjunto. */
  percent: number;
  blocked: boolean;
  /** ISO; null si no hay ventana abierta. */
  resets_at: string | null;
  cost: AiModeCost;
  /** «la mitad», «lo normal», «el doble»… */
  relative_cost: string;
}
/** El límite conjunto de la ventana de 5 h. */
export interface AiSharedUsage {
  /** 0-100, entero. 100 solo cuando está agotado. */
  percent: number;
  /** Agotado: todos los modos esperan al reinicio. */
  blocked: boolean;
  resets_at: string | null;
  /** «Te quedan unos N mensajes» (aproximado). null con un servidor antiguo. */
  messages_left: number | null;
}
export interface AiUsage extends AiSharedUsage {
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
// Lo que gasta cada modo si el servidor aún no lo dice (mismos pesos que
// MODE_WEIGHTS en models.mjs).
const DEFAULT_COST: Record<
  AiModeId,
  { cost: AiModeCost; relative_cost: string }
> = {
  fast: { cost: "less", relative_cost: "la mitad" },
  normal: { cost: "same", relative_cost: "lo normal" },
  think: { cost: "more", relative_cost: "el doble" },
};
const COST_HINTS: Record<AiModeCost, string> = {
  less: "gasta menos",
  same: "",
  more: "gasta más",
};
/** Pista corta del selector: «Respuestas cortas, gasta menos». */
export function modeHint(mode: Pick<AiModeUsage, "id" | "cost">) {
  const cost = COST_HINTS[mode.cost];
  return cost ? `${MODE_HINTS[mode.id]}, ${cost}` : MODE_HINTS[mode.id];
}
// Antes de saber nada del servidor (o si aún no tiene la acción de uso).
export const FALLBACK_USAGE: AiUsage = {
  modes: (["fast", "normal"] as const).map((id) => ({
    id,
    label: LABELS[id],
    percent: 0,
    blocked: false,
    resets_at: null,
    ...DEFAULT_COST[id],
  })),
  window: null,
  default_mode: DEFAULT_MODE,
  percent: 0,
  blocked: false,
  resets_at: null,
  messages_left: null,
};

const isMode = (v: unknown): v is AiModeId =>
  v === "fast" || v === "normal" || v === "think";
const isCost = (v: unknown): v is AiModeCost =>
  v === "less" || v === "same" || v === "more";
const clampPercent = (v: unknown) =>
  Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const isoOrNull = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
// Solo unas pocas palabras en minúscula («la mitad», «el doble»): nunca
// cifras ni nombres que pudieran llegar del servidor.
const isCostWords = (v: unknown): v is string =>
  typeof v === "string" && /^[a-záéíóúüñ ]{2,24}$/.test(v);

/** Acepta solo lo esperado; cualquier otra forma vuelve a los valores por defecto. */
export function parseUsage(data: unknown): AiUsage {
  if (!data || typeof data !== "object" || !("modes" in data))
    return FALLBACK_USAGE;
  const raw = (data as { modes: unknown }).modes;
  if (!Array.isArray(raw)) return FALLBACK_USAGE;
  const modes = raw.flatMap((m): AiModeUsage[] => {
    if (!m || typeof m !== "object" || !isMode(m.id)) return [];
    const id = m.id as AiModeId;
    const cost = isCost(m.cost) ? m.cost : DEFAULT_COST[id].cost;
    return [
      {
        id,
        label: LABELS[id],
        percent: clampPercent(m.percent),
        blocked: m.blocked === true,
        resets_at: isoOrNull(m.resets_at),
        cost,
        relative_cost: isCostWords(m.relative_cost)
          ? m.relative_cost
          : DEFAULT_COST[id].relative_cost,
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
  const top = data as {
    percent?: unknown;
    blocked?: unknown;
    resets_at?: unknown;
    messages_left?: unknown;
  };
  // Servidor nuevo: el límite conjunto llega arriba. Servidor antiguo (un
  // límite por modo): se toma el modo más gastado, para no prometer de más.
  const shared: AiSharedUsage =
    typeof top.percent === "number"
      ? {
          percent: clampPercent(top.percent),
          blocked: top.blocked === true,
          resets_at: isoOrNull(top.resets_at) ?? window?.ends_at ?? null,
          messages_left:
            typeof top.messages_left === "number" &&
            Number.isInteger(top.messages_left) &&
            top.messages_left >= 0
              ? Math.min(top.messages_left, 999)
              : null,
        }
      : {
          percent: Math.max(...modes.map((m) => m.percent)),
          blocked: modes.some((m) => m.blocked),
          resets_at:
            modes.find((m) => m.resets_at)?.resets_at ??
            window?.ends_at ??
            null,
          messages_left: null,
        };
  return {
    modes,
    window,
    default_mode: isMode(def) ? def : DEFAULT_MODE,
    ...shared,
  };
}

/** «Rápido gasta la mitad, Normal lo normal y Pensar más el doble.» */
export function costSentence(modes: AiModeUsage[]) {
  const parts = modes.map((m, i) =>
    i === 0
      ? `${m.label} gasta ${m.relative_cost}`
      : `${m.label} ${m.relative_cost}`,
  );
  if (parts.length < 2) return parts.length ? `${parts[0]}.` : "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}.`;
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

/**
 * Otro modo al que cambiar cuando el actual está agotado. Con el límite
 * conjunto agotado no hay ninguno: todos esperan al reinicio.
 */
export function alternativeMode(usage: AiUsage, current: AiModeId) {
  if (usage.blocked && usage.modes.every((m) => m.blocked)) return null;
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

/** «Te quedan unos 12 mensajes.» ('' si el servidor no lo dice). */
export function messagesLeftText(left: number | null) {
  if (left === null) return "";
  if (left === 0) return "Ya casi no te quedan mensajes.";
  if (left === 1) return "Te queda más o menos 1 mensaje.";
  return `Te quedan unos ${left} mensajes.`;
}
