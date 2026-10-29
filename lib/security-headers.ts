/**
 * Cabeceras de seguridad de todo el sitio (next.config.ts). La CSP con nonce va
 * aparte, en middleware.ts (lib/csp.ts); el panel tiene las suyas
 * (lib/admin-route.ts). docs/cabeceras.md explica cada una.
 */

type Env = Record<string, string | undefined>;

/**
 * Cámara solo para la propia web (las subidas abren la cámara del móvil); el
 * micrófono no lo usa nada. Va en todas las páginas, no solo en las de subida:
 * Next.js navega sin recargar y vale la de la primera página abierta.
 */
export const PERMISSIONS_POLICY =
  "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()";

/**
 * HSTS: Vercel ya manda `max-age=63072000` (2 años) en los dominios propios.
 * Con DREAM_HSTS=on (paso manual de Carlos, una semana después de Cloudflare
 * sin problemas) se añade includeSubDomains. Nunca preload: es difícil de
 * deshacer. Una sola fuente: la opción HSTS de Cloudflare se deja apagada.
 */
export const HSTS = "max-age=63072000; includeSubDomains";

export function siteSecurityHeaders(env: Env = process.env): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(env.DREAM_HSTS === "on" ? [{ key: "Strict-Transport-Security", value: HSTS }] : []),
  ];
}
