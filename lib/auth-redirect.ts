/**
 * One place for the Google sign-in return address.
 *
 * PKCE keeps its code verifier in the browser storage of the origin that
 * started the sign-in, so the sign-in must start and end on the same origin.
 * Production always uses NEXT_PUBLIC_SITE_URL (https://www.edudream.es); only
 * localhost and Vercel previews return to the origin they were opened on.
 */

export const AUTH_CALLBACK_PATH = "/auth/callback";

/** `NEXT_PUBLIC_SITE_URL` as a bare origin, or null if unset or malformed. */
export function siteOrigin(
  value = process.env.NEXT_PUBLIC_SITE_URL,
): string | null {
  if (!value) return null;
  try {
    // Accept the bare host too ("www.edudream.es"): it is easy to paste in
    // Vercel without the scheme, and https is the only valid one here.
    const text = value.trim();
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
    );
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

interface RedirectOptions {
  /** The page's own origin, `location.origin` in the browser. */
  origin: string;
  /** NEXT_PUBLIC_SITE_URL. */
  siteUrl?: string;
  /** Vercel environment: production, preview or development. */
  environment?: string;
}

export function getAuthRedirectUrl({
  origin,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  environment = process.env.NEXT_PUBLIC_DREAM_ENVIRONMENT,
}: RedirectOptions): string {
  const own = new URL(origin);
  const canonical = siteOrigin(siteUrl);
  const keepOwn =
    isLocalHost(own.hostname) ||
    environment === "preview" ||
    environment === "development" ||
    !canonical;
  return `${keepOwn ? own.origin : canonical}${AUTH_CALLBACK_PATH}`;
}

interface CanonicalOptions {
  url: URL;
  method: string;
  siteUrl?: string;
  environment?: string;
}

/** The canonical origin when this production request came in on another host. */
function secondaryHost({
  url,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  environment = process.env.NEXT_PUBLIC_DREAM_ENVIRONMENT,
}: Omit<CanonicalOptions, "method">): URL | null {
  if (environment !== "production") return null;
  const canonical = siteOrigin(siteUrl);
  if (!canonical || isLocalHost(url.hostname)) return null;
  const target = new URL(canonical);
  // Hostnames, not hosts: a port must never turn the canonical site into a
  // redirect loop.
  if (url.hostname === target.hostname) return null;
  return target;
}

/**
 * Where a production GET on a secondary host (edudream.vercel.app, edudream.es
 * without www, a deployment URL) should go, or null to serve it. Everything
 * but the hashed build files goes to www.edudream.es, so nobody uses the
 * *.vercel.app address to skip Cloudflare (docs/cloudflare-reglas.md).
 */
export function canonicalRedirect(options: CanonicalOptions): URL | null {
  const { url, method } = options;
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.pathname.startsWith("/_next/")) return null;
  const target = secondaryHost(options);
  if (!target) return null;
  target.pathname = url.pathname;
  target.search = url.search;
  return target;
}

/**
 * True for a production POST/PUT/… on a secondary host: it is refused instead
 * of served (a 308 would only send a cross-origin POST). Nothing legitimate
 * writes there: the app, the Google callback and previews use their own host.
 */
export function refuseSecondaryHost(options: CanonicalOptions): boolean {
  if (options.method === "GET" || options.method === "HEAD") return false;
  return secondaryHost(options) !== null;
}

/** Short Spanish message for each way the return from Google can fail. */
export const AUTH_ERRORS = {
  cancelled: "Has cancelado el acceso con Google.",
  oauth: "Google no pudo completar el acceso.",
  "no-code": "Google no devolvió el permiso de acceso.",
  "other-origin":
    "El acceso empezó en otra dirección de Dream. Vuelve a intentarlo desde aquí.",
  session: "No se pudo abrir tu sesión.",
} as const;
export type AuthErrorCode = keyof typeof AUTH_ERRORS;

export function isAuthErrorCode(value: string | null): value is AuthErrorCode {
  return !!value && Object.hasOwn(AUTH_ERRORS, value);
}

/**
 * Reads the error Supabase or Google left on the callback URL, in the query or
 * in the hash, and turns it into one of our codes (never the raw text).
 */
export function callbackError(search: string, hash = ""): AuthErrorCode | null {
  const params = new URLSearchParams(search);
  const fromHash = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error") ?? fromHash.get("error");
  const description = (
    params.get("error_description") ??
    fromHash.get("error_description") ??
    ""
  ).toLowerCase();
  if (!error && !description) return null;
  if (error === "access_denied" && !description.includes("verifier"))
    return "cancelled";
  if (
    description.includes("code verifier") ||
    description.includes("flow state")
  )
    return "other-origin";
  return "oauth";
}

/** Error code for a failed `exchangeCodeForSession`. */
export function exchangeError(message: string): AuthErrorCode {
  const text = message.toLowerCase();
  return text.includes("code verifier") || text.includes("flow state")
    ? "other-origin"
    : "session";
}
