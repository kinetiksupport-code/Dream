// Content-Security-Policy of the app (every page except the admin panel, which
// has its own stricter one in lib/admin-route.ts). A fresh nonce per request
// from middleware.ts plus 'strict-dynamic': Next.js puts the nonce on its own
// scripts, and scripts those create (Cookiebot, the chat loader, lazy chunks)
// are trusted through them. Host sources stay as a fallback for browsers
// without 'strict-dynamic'.
//
// The one exception is style-src 'unsafe-inline': Cookiebot's banner and the
// Crisp chat inject inline styles and do not support nonces for them.
import { COOKIEBOT, cookiebotHosts, type CookiebotConfig } from "./cookie-consent";

export interface CspEnv {
  supabaseUrl?: string;
  dreamApiUrl?: string;
  posthogHost?: string;
  sentryDsn?: string;
  development?: boolean;
  /**
   * Turnstile configurado (NEXT_PUBLIC_TURNSTILE_SITE_KEY). Solo añade su origen
   * a script-src y frame-src. Va en todas las páginas de la app y no solo en
   * las que lo enseñan: Next.js navega sin recargar y la CSP que vale es la de
   * la primera página abierta. El script solo se carga donde se usa.
   */
  turnstile?: boolean;
  /**
   * Páginas del blog (/blog): las imágenes de los artículos de BabyLoveGrowth
   * vienen de su CDN, así que ahí img-src admite cualquier https. Solo se
   * pide al abrir /blog con carga completa (el enlace desde la landing es un
   * <a> normal).
   */
  blogImages?: boolean;
}

const origin = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};
const unique = (list: string[]) => [...new Set(list.filter(Boolean))].join(" ");

// Crisp, as listed in docs.crisp.chat (Whitelisting our systems). Loaded only
// after consent and a click, but the policy has to allow it beforehand.
const CRISP = "https://*.crisp.chat";
const CRISP_WS = ["wss://*.relay.crisp.chat", "wss://*.relay.rescue.crisp.chat"];
// Cloudflare Turnstile (developers.cloudflare.com/turnstile/reference/content-security-policy).
const TURNSTILE = "https://challenges.cloudflare.com";

export function appCsp(
  nonce: string,
  env: CspEnv,
  /** sha256 hashes of fixed inline scripts (the Dreams game iframe, srcdoc inherits this policy). */
  inlineHashes: readonly string[] = [],
  cookiebot: CookiebotConfig = COOKIEBOT,
): string {
  const cb = cookiebotHosts(cookiebot.tld);
  const supabase = origin(env.supabaseUrl);
  const posthog = origin(env.posthogHost);
  // PostHog serves its assets from <region>-assets.i.posthog.com.
  const posthogAssets = posthog.endsWith(".i.posthog.com")
    ? posthog.replace(/^https:\/\/([a-z]+)\.i\.posthog\.com$/, "https://$1-assets.i.posthog.com")
    : "";
  return [
    "default-src 'self'",
    `script-src ${unique([
      "'self'",
      `'nonce-${nonce}'`,
      ...inlineHashes.map((h) => `'${h}'`),
      "'strict-dynamic'",
      cb.consent,
      cb.cdn,
      CRISP,
      env.turnstile ? TURNSTILE : "",
      env.development ? "'unsafe-eval'" : "",
    ])}`,
    `style-src 'self' 'unsafe-inline' ${CRISP}`,
    `img-src ${unique([
      "'self'",
      "data:",
      "blob:",
      supabase,
      // Favicons of the web sources the AI read (components/web-sources.tsx).
      "https://www.google.com",
      "https://*.gstatic.com",
      cb.pixel,
      cb.consent,
      CRISP,
      env.blogImages ? "https:" : "",
    ])}`,
    `font-src 'self' data: ${CRISP}`,
    `media-src 'self' blob: ${CRISP}`,
    `connect-src ${unique([
      "'self'",
      supabase,
      origin(env.dreamApiUrl),
      posthog,
      posthogAssets,
      origin(env.sentryDsn),
      cb.consent,
      cb.cdn,
      CRISP,
      ...CRISP_WS,
    ])}`,
    `frame-src ${unique([cb.cdn, CRISP, "https://*.crisp.help", env.turnstile ? TURNSTILE : ""])}`,
    `worker-src 'self' blob: ${CRISP}`,
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** DREAM_CSP=report-only sends the same policy without enforcing it; off removes it. */
export function cspHeaderName(mode = process.env.DREAM_CSP): string | null {
  if (mode === "off") return null;
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}
