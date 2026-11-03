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
/**
 * Comodidad (Carlos, 3-nov-2026): quien ya tiene la sesión iniciada y abre
 * edudream.es va directo a Inicio (/chat), antes de pintar la landing. La
 * sesión de Supabase vive en localStorage (sb-<proyecto>-auth-token), no en
 * una cookie, así que el servidor no puede saberlo. Si la sesión ya no vale,
 * /chat lleva al login como siempre. «/?landing» enseña la landing igualmente.
 */
export const HOME_REDIRECT_BOOT =
  "try{if(location.pathname==='/'&&!/[?&]landing\\b/.test(location.search)){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){var v=JSON.parse(localStorage.getItem(k)||'null');if(v&&v.refresh_token){location.replace('/chat');break}}}}}catch(e){}";

export const HEAD_BOOT =
  // Dream es solo oscuro (rediseño Dream design): el tema ya no se elige.
  "document.documentElement.dataset.theme='dark';" +
  READING_BOOT +
  HOME_REDIRECT_BOOT;
