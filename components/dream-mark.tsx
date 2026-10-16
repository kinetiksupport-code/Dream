import { Orb } from "./orb";
import type { DreamState } from "@/lib/types";

const WORKING = new Set<DreamState>([
  "thinking",
  "searching",
  "composing",
  "shaping",
  "listening",
]);

export function DreamMark({
  state = "idle",
  large = false,
  size,
}: {
  state?: DreamState;
  large?: boolean;
  size?: number;
}) {
  return (
    <span className={`dream-mark state-${state}`} aria-hidden="true">
      <Orb size={size ?? (large ? 64 : 32)} pulsing={WORKING.has(state)} />
    </span>
  );
}

const ACTIVITY_LABELS: Record<DreamState, string> = {
  idle: "Listo",
  thinking: "Pensando",
  searching: "Buscando en Internet",
  composing: "Escribiendo",
  shaping: "Preparando la práctica",
  listening: "Escuchando",
  done: "Listo",
  error: "No se ha podido completar",
};

/** Orb + one line of status. Announced politely to assistive technology. */
export function DreamActivity({
  state,
  label,
}: {
  state: DreamState;
  label?: string;
}) {
  return (
    <div
      className={`activity activity-${state}`}
      role="status"
      aria-live="polite"
    >
      <Orb size={28} pulsing={WORKING.has(state)} />
      <span>{label ?? ACTIVITY_LABELS[state]}</span>
    </div>
  );
}
