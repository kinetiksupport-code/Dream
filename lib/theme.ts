// Browser chrome colours (theme-color, manifest). Must match --bg in globals.css.
export const THEME_COLORS = {
  light: "#FFFFFF",
  dark: "#0E1117",
} as const;

/**
 * Script en línea de <head> (tema + lectura fácil): fija los atributos antes de
 * pintar para evitar un parpadeo. app/layout.tsx lo escribe tal cual y el
 * middleware del panel calcula su hash para la CSP: una sola fuente para ambos.
 */
import { READING_BOOT } from "@/lib/reading";
export const HEAD_BOOT =
  "try{var t=localStorage.getItem('dream-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}" +
  READING_BOOT;
