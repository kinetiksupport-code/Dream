// Sticker / badge of the new style (PROMPT_EXAMEN_ESTILO.md §2): a short
// label on a saturated fill with a thick light ring and a soft shadow.
// Shapes: "scalloped" (rosette), "round" or "pill". The text is real text and
// always readable on its tone (contrast.mjs pairs on-pop-* / pop-*). Never
// the only carrier of meaning: the label says it.
import type { CSSProperties, ReactNode } from "react";
import { scallopPath } from "@/lib/motion";

export type StickerTone =
  | "blue"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "green"
  | "lime";
export type StickerShape = "scalloped" | "round" | "pill";

export function Sticker({
  children,
  tone = "yellow",
  shape = "scalloped",
  size,
  tilt = 0,
  animate = false,
  className,
}: {
  children: ReactNode;
  tone?: StickerTone;
  shape?: StickerShape;
  /** Diameter in px for round and scalloped stickers. */
  size?: number;
  /** Rotation in degrees, like a sticker placed by hand (−8 to 8). */
  tilt?: number;
  /** Pops in once when it appears (from 0.9, never from 0). */
  animate?: boolean;
  className?: string;
}) {
  const style = {
    ...(size ? { "--sticker-size": `${size}px` } : {}),
    ...(tilt ? { "--sticker-tilt": `${tilt}deg` } : {}),
  } as CSSProperties;
  return (
    <span
      className={[
        "sticker",
        `sticker-${shape}`,
        `tone-${tone}`,
        animate && "pop-in",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {shape === "scalloped" && (
        <svg
          className="sticker-shape"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <path d={scallopPath()} />
        </svg>
      )}
      <span className="sticker-label">{children}</span>
    </span>
  );
}
