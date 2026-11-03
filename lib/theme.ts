// Browser chrome colours (theme-color, manifest). Must match --bg in globals.css.
export const THEME_COLORS = {
  light: "#0A0C19",
  dark: "#0A0C19",
} as const;

/**
 * Script en línea de <head> (tema + lectura fácil): fija los atributos antes de
 * pintar para evitar un parpadeo. app/layout.tsx lo escribe tal cual y el
 * middleware del panel calcula su hash para la CSP: una sola fuente para ambos.
 */
import { READING_BOOT } from "@/lib/reading";
export const HEAD_BOOT =
  // Dream es solo oscuro (rediseño Dream design): el tema ya no se elige.
  "document.documentElement.dataset.theme='dark';" +
  READING_BOOT;
