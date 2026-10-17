// WCAG 2.x contrast for Dream's colour tokens (design:check).
// Reads the light (:root) and dark (:root[data-theme="dark"]) token blocks
// from app/globals.css and checks every text/surface pair Dream uses.
import { readFileSync } from "node:fs";

export function parseColor(value) {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  m = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (m)
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
const blend = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
const lum = ({ r, g, b }) => {
  const f = (c) =>
    (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function contrast(fg, bg, base = bg) {
  const solidBg = bg.a < 1 ? blend(bg, base) : bg;
  const solidFg = fg.a < 1 ? blend(fg, solidBg) : fg;
  const [l1, l2] = [lum(solidFg), lum(solidBg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** @param {string} css @returns {{ light: Record<string, string>, dark: Record<string, string> }} */
export function readTokens(css) {
  const block = (re) => {
    const m = css.match(re);
    if (!m) throw new Error(`token block not found: ${re}`);
    /** @type {Record<string, string>} */
    const out = {};
    for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g))
      out[k] = v.trim();
    return out;
  };
  const light = block(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = {
    ...light,
    ...block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/),
  };
  return { light, dark };
}

// [foreground, background, minimum ratio, what it is]
export const PAIRS = [
  ["text", "bg", 4.5, "Texto sobre fondo"],
  ["text", "surface", 4.5, "Texto sobre panel"],
  ["text", "card", 4.5, "Texto sobre tarjeta"],
  ["text", "elevated", 4.5, "Texto sobre tarjeta elevada"],
  ["text-secondary", "bg", 4.5, "Texto secundario sobre fondo"],
  ["text-secondary", "surface", 4.5, "Texto secundario sobre panel"],
  ["text-secondary", "card", 4.5, "Texto secundario sobre tarjeta"],
  ["primary-ink", "bg", 4.5, "Enlace sobre fondo"],
  ["primary-ink", "card", 4.5, "Enlace sobre tarjeta"],
  ["primary-ink-tint", "nav-active", 4.5, "Navegación activa"],
  ["on-primary", "primary", 4.5, "Texto en botón principal"],
  ["success", "success-surface", 4.5, "Acierto"],
  ["danger", "danger-surface", 4.5, "Error"],
  ["danger", "bg", 4.5, "Error sobre fondo"],
  ["warning", "warning-surface", 4.5, "Aviso"],
  ["accent", "primary", 3, "Lima sobre azul (números grandes)"],
  ["focus", "bg", 3, "Anillo de foco"],
  ["switch-off", "surface", 3, "Interruptor apagado"],
  ["primary", "surface", 3, "Interruptor encendido"],
];

/** @param {{ light: Record<string, string>, dark: Record<string, string> }} tokens */
export function audit(tokens) {
  const rows = [];
  for (const theme of ["light", "dark"]) {
    const t = tokens[theme];
    for (const [fg, bg, min, what] of PAIRS) {
      const f = parseColor(t[fg] ?? ""),
        b = parseColor(t[bg] ?? ""),
        base = parseColor(t.bg);
      if (!f || !b) {
        rows.push({ theme, fg, bg, min, what, ratio: NaN, ok: false });
        continue;
      }
      const ratio = contrast(f, b, base);
      rows.push({ theme, fg, bg, min, what, ratio, ok: ratio >= min });
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = audit(
    readTokens(readFileSync(process.argv[2] ?? "app/globals.css", "utf8")),
  );
  for (const r of rows)
    console.log(
      `${r.ok ? "ok " : "MAL"} ${r.theme.padEnd(5)} ${r.what.padEnd(36)} ${r.fg} / ${r.bg}: ${r.ratio.toFixed(2)}:1 (mín. ${r.min})`,
    );
  process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
}
