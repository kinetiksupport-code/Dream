import Image from "next/image";
import type { DreamState } from "@/lib/types";
export function DreamMark({
  state = "idle",
  large = false,
  size,
}: {
  state?: DreamState;
  large?: boolean;
  size?: number;
}) {
  const dimension = size ?? (large ? 64 : 36);
  return (
    <span
      className={`dream-mark state-${state}`}
      aria-hidden="true"
      style={{ width: dimension, height: dimension }}
    >
      <Image
        src="/brand/dream-orb.png"
        width={dimension}
        height={dimension}
        alt=""
        unoptimized
      />
    </span>
  );
}
export function DreamActivity({ state }: { state: DreamState }) {
  const labels: Record<DreamState, string> = {
    idle: "Listo",
    thinking: "Pensando · Ordenando las ideas",
    searching: "Buscando en Internet · Comprobando fuentes",
    composing: "Escribiendo",
    shaping: "Preparando práctica",
    listening: "Escuchando",
    done: "Listo",
    error: "Error · No se ha podido completar",
  };
  return (
    <div className={`activity activity-${state}`} role="status">
      <DreamMark state={state} />
      <span>
        <strong>Dream</strong>
        <small>{labels[state]}</small>
      </span>
      {!["idle", "done", "error"].includes(state) && (
        <span className="activity-dots" aria-hidden="true">
          ···
        </span>
      )}
    </div>
  );
}
