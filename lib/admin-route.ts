// Ruta y cabeceras del panel de administración (B5).
//
// El panel NO vive en /admin. Se sirve en una ruta poco evidente (por defecto
// /revision; ADMIN_PANEL_PATH la cambia sin tocar el código, solo en el
// servidor). Cualquier otra ruta que parezca de administración (/admin, /panel,
// /administracion…) y la ruta interna a la que se reescribe responden como una
// página que no existe. Una ruta oculta no es seguridad por sí sola: la
// protección real está en dream-api (correo, tabla de administradores, doble
// factor, sesión corta, auditoría).

/** Página interna del panel. Nadie debe poder pedirla directamente. */
export const PANEL_INTERNAL = "/panel-interno";
export const DEFAULT_PANEL_PATH = "/revision";

/** Ruta válida: minúsculas, números y guiones, de 3 a 41 caracteres, y nunca la interna. */
export function panelPath(value: string | undefined | null): string {
  const path = String(value ?? "").trim();
  return /^\/[a-z0-9][a-z0-9-]{2,40}$/.test(path) && path !== PANEL_INTERNAL ? path : DEFAULT_PANEL_PATH;
}

export type PanelRoute = "panel" | "internal" | null;
export function classifyPanelRoute(pathname: string, configured: string): PanelRoute {
  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (clean === PANEL_INTERNAL || clean.startsWith(`${PANEL_INTERNAL}/`)) return "internal";
  return clean === configured ? "panel" : null;
}

/** Cabeceras estrictas de todas las respuestas del panel. */
export const PANEL_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const origin = (value: string | undefined) => {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
};

/**
 * CSP del panel: scripts solo propios y con nonce (sin 'unsafe-inline'), sin
 * recursos de terceros, sin marcos, sin formularios hacia fuera. Solo se puede
 * conectar con el propio sitio, Supabase Auth y dream-api.
 */
export function panelCsp(
  nonce: string,
  env: { supabaseUrl?: string; dreamApiUrl?: string },
  /** Hashes (sha256-…) de los scripts en línea propios del diseño que no llevan nonce. */
  inlineHashes: readonly string[] = [],
): string {
  const connect = ["'self'", origin(env.supabaseUrl), origin(env.dreamApiUrl)].filter(Boolean);
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' ${inlineHashes.map((h) => `'${h}'`).join(" ")}${inlineHashes.length ? " " : ""}'strict-dynamic'`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${[...new Set(connect)].join(" ")}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** Hash CSP (sha256-base64) de un script en línea. */
export async function cspHash(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}
