// Pure helpers behind the motion primitives of the new style
// (PROMPT_EXAMEN_ESTILO.md §6). Unit-tested in tests/motion.test.ts; the
// components live in components/animated-number.tsx, bottom-sheet.tsx and
// sticker.tsx, the motion values in app/globals.css (--dur-*, --ease-*).

/** Number in Spanish format: 8,5 · 1.250 (with grouping from 5 digits). */
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Direction of a number roll: up when the value grows (or stays). */
export function rollDirection(from: number, to: number): "up" | "down" {
  return to >= from ? "up" : "down";
}

/** Flick speed that closes a bottom sheet regardless of distance (px/ms). */
export const DISMISS_VELOCITY = 0.11;
/** Share of the sheet's height that closes it on a slow drag. */
export const DISMISS_SHARE = 0.3;

/** Whether a downward drag of `dy` px in `ms` closes a sheet `height` px tall. */
export function shouldDismiss(dy: number, ms: number, height: number) {
  if (dy <= 0) return false;
  return (
    dy >= height * DISMISS_SHARE || dy / Math.max(ms, 1) > DISMISS_VELOCITY
  );
}

/** Upward drags meet growing friction instead of a hard stop. */
export function dragOffset(dy: number) {
  return dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
}

/**
 * Closed SVG path of a scalloped rosette in a 100×100 box: `bumps` outward
 * arcs around a circle of radius `radius` centred at (50, 50).
 */
export function scallopPath(bumps = 14, radius = 42): string {
  const n = Math.max(6, Math.round(bumps));
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [50 + radius * Math.cos(a), 50 + radius * Math.sin(a)] as const;
  });
  const chord = 2 * radius * Math.sin(Math.PI / n);
  const r = (chord * 0.62).toFixed(2);
  const f = (v: number) => v.toFixed(2);
  return (
    `M${f(pts[0][0])} ${f(pts[0][1])}` +
    pts
      .map((_, i) => {
        const [x, y] = pts[(i + 1) % n];
        return `A${r} ${r} 0 0 1 ${f(x)} ${f(y)}`;
      })
      .join("") +
    "Z"
  );
}
