"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { DreamState } from "@/lib/types";

const ORB: Partial<Record<DreamState, OrbState>> = {
  thinking: "solving",
  searching: "searching",
  composing: "composing",
  shaping: "shaping",
  listening: "listening",
};

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
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPaused(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const labels: Record<DreamState, string> = {
    idle: "Listo",
    thinking: "Pensando en profundidad",
    searching: "Buscando en Internet",
    composing: "Escribiendo",
    shaping: "Preparando práctica",
    listening: "Escuchando",
    done: "Listo",
    error: "Error · No se ha podido completar",
  };
  const details: Partial<Record<DreamState, string>> = {
    thinking: "Ordenando las ideas antes de responder",
    searching: "Comprobando fuentes",
    composing: "Redactando la explicación",
    shaping: "Montando la práctica",
  };
  const orb = ORB[state];
  const settled = !orb;

  return (
    <div className={`activity activity-${state}`} role="status">
      {orb ? (
        <span className="thinking-orb">
          <ThinkingOrb
            state={orb}
            size={64}
            theme="auto"
            speed={1}
            paused={paused}
            aria-label={labels[state]}
          />
        </span>
      ) : (
        <DreamMark state={state} />
      )}
      <span>
        <strong>Dream</strong>
        <small>{labels[state]}</small>
        {!settled && details[state] && <em>{details[state]}</em>}
      </span>
    </div>
  );
}
