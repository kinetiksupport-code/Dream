"use client";
import { useEffect, useState } from "react";
import { Orb } from "./orb";
import type { DreamState } from "@/lib/types";

/**
 * Estado de la IA en el chat, ligado al estado real del stream.
 *
 * - `waiting` («Esperando turno») y `retrying` («Reintentando…») llegan con la
 *   cola de la IA (PR #9). Se aceptan aquí para que ese PR solo tenga que
 *   pasarlos; no se añaden a `DreamState` para no chocar con su cambio.
 * - Solo aparece si la espera dura 2 s o más (libraries-dev › Decision rules:
 *   «Under 2 s — Nothing»). `since` es el momento en que empezó la espera, así
 *   que el retraso no se reinicia si el estado se mueve de sitio en el hilo.
 *
 * Punto de enganche para `thinking-orbs` (pendiente del OK de Carlos):
 * sustituir `<Orb … pulsing />` por
 *   `<ThinkingOrb state={ORB_STATE[state]} size={20} />`
 * con ORB_STATE = { thinking: "thinking", searching: "searching",
 * composing: "writing", shaping: "thinking", waiting: "thinking",
 * retrying: "thinking" }. `border-beam` (espera > 3 s) iría en la caja, con
 * `active` desde `useWaitLonger(since, 3000)`. No se instala nada sin su OK.
 */
export type AiStatusState = DreamState | "waiting" | "retrying";

export const AI_STATUS_LABELS: Partial<Record<AiStatusState, string>> = {
  thinking: "Pensando…",
  searching: "Buscando en internet…",
  composing: "Escribiendo…",
  shaping: "Preparando tu test…",
  waiting: "Esperando turno…",
  retrying: "Reintentando…",
  listening: "Escuchando…",
};

export const AI_STATUS_DELAY = 2000;

/** true once `since` is at least `delay` ms old (false when `since` is null). */
export function useWaitLonger(since: number | null, delay = AI_STATUS_DELAY) {
  const [passed, setPassed] = useState<number | null>(() =>
    since !== null && Date.now() - since >= delay ? since : null,
  );
  useEffect(() => {
    if (since === null) return;
    const remaining = since + delay - Date.now();
    if (remaining <= 0) {
      setPassed(since);
      return;
    }
    const timer = window.setTimeout(() => setPassed(since), remaining);
    return () => window.clearTimeout(timer);
  }, [since, delay]);
  // Keyed by `since`, so a new wait never inherits the previous one.
  return since !== null && passed === since;
}

export function AiStatus({
  state,
  since,
  detail,
  label: override,
}: {
  state: AiStatusState;
  /** Date.now() when the wait started (send). */
  since: number | null;
  /** Optional second line, e.g. the queue position. */
  detail?: string;
  /** Replaces the state's label («Generando Dreams…»). */
  label?: string;
}) {
  const label = override ?? AI_STATUS_LABELS[state];
  const shown = useWaitLonger(since);
  if (!label || !shown) return null;
  return (
    <div
      className={`activity ai-status activity-${state}`}
      role="status"
      aria-live="polite"
    >
      <Orb size={28} pulsing />
      <span className="ai-status-label" key={state}>
        {label}
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}
