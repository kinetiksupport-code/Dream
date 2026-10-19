"use client";
// Tick que «se dibuja» (PROMPT_EXAMEN_ESTILO.md §5.3) solo con transform:
// una máscara se abre de izquierda a derecha sobre el trazo (scaleX), en vez
// de animar stroke-dashoffset (design:check solo admite transform y
// opacidad en @keyframes). Con movimiento reducido aparece ya dibujado.
import { useId } from "react";

export function DrawnTick({
  className,
  delay = 80,
}: {
  className?: string;
  /** Retraso del trazo en ms. */
  delay?: number;
}) {
  const id = `tick-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`drawn-tick${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect
          className="drawn-tick-reveal"
          x="5"
          y="6"
          width="14"
          height="12"
          fill="#fff"
          style={{ animationDelay: `${delay}ms` }}
        />
      </mask>
      <circle cx="12" cy="12" r="11" />
      <path d="m7 12.5 3.5 3.5L17 9" mask={`url(#${id})`} />
    </svg>
  );
}
