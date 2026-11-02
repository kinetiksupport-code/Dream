import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isMaintenanceMode,
  MAINTENANCE_COOKIE_NAME,
  verifyMaintenanceAccessToken,
} from "@/lib/maintenance";
import { canonicalRedirect, refuseSecondaryHost } from "@/lib/auth-redirect";
import { PANEL_HEADERS, PANEL_INTERNAL, classifyPanelRoute, cspHash, panelCsp, panelPath } from "@/lib/admin-route";
import { HEAD_BOOT } from "@/lib/theme";
import { GAME_SCRIPT } from "@/lib/dream-games";
import { appCsp, cspHeaderName } from "@/lib/csp";
import { COOKIEBOT, cookiebotPage } from "@/lib/cookie-consent";
import { turnstileOn } from "@/lib/turnstile";

const PUBLIC_ROUTES = new Set([
  "/maintenance",
  "/login",
  "/privacidad",
  "/terminos",
  "/cookies",
  "/aviso-legal",
  "/auth/callback",
  "/api/auth/verify-maintenance",
]);
const STATIC_ASSET =
  /\.(?:avif|css|eot|gif|ico|jpe?g|js|json|map|mjs|png|svg|txt|ttf|webmanifest|webp|woff2?)$/i;

// The QR upload page (/subir#<token>) carries a secret in the fragment: never
// cached, never sent as a Referer, never indexed. Applied to every response of
// /subir and /subir/*, including the redirects. A token in the path
// (/subir/<anything>) is never used: it is dropped with a redirect to /subir,
// which shows the generic "Este código ya no vale".
const PRIVATE_UPLOAD_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
const isPrivateUpload = (pathname: string) =>
  pathname === "/subir" || pathname.startsWith("/subir/");

export async function middleware(request: NextRequest) {
  const response = await route(request);
  if (isPrivateUpload(request.nextUrl.pathname))
    for (const [key, value] of Object.entries(PRIVATE_UPLOAD_HEADERS))
      response.headers.set(key, value);
  return response;
}

async function route(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith("/subir/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/subir";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }
  // Production only: send edudream.vercel.app and other secondary hosts to
  // www.edudream.es so a Google sign-in starts and ends on the same origin.
  const requested = new URL(request.nextUrl.href);
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    requested.port = "";
    requested.host = host;
  }
  const canonical = canonicalRedirect({
    url: requested,
    method: request.method,
  });
  if (canonical) return NextResponse.redirect(canonical, 308);
  // *.vercel.app would skip Cloudflare: production writes there are refused.
  if (refuseSecondaryHost({ url: requested, method: request.method }))
    return NextResponse.json(
      { error: "Usa www.edudream.es." },
      { status: 421, headers: { "Cache-Control": "no-store" } },
    );

  if (!isMaintenanceMode()) {
    return panel(request);
  }

  const { pathname } = request.nextUrl;

  if (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname === "/sw.js" ||
    (!pathname.startsWith("/api/") &&
      (request.method === "GET" || request.method === "HEAD") &&
      STATIC_ASSET.test(pathname))
  ) {
    return panel(request);
  }

  const token = request.cookies.get(MAINTENANCE_COOKIE_NAME)?.value;
  if (await verifyMaintenanceAccessToken(token)) {
    return panel(request);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Dream está temporalmente en mantenimiento." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "300",
        },
      },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * Panel de administración (docs/PANEL_ADMIN.md). La ruta configurada se sirve
 * con la página interna, siempre con estado 404 y cabeceras estrictas (CSP con
 * nonce, sin caché, sin indexar). La página interna pedida directamente da el
 * 404 de siempre. El resto de rutas «de administración» no existen.
 */
let readingBootHash: Promise<string> | undefined;
async function panel(request: NextRequest): Promise<NextResponse> {
  const kind = classifyPanelRoute(request.nextUrl.pathname, panelPath(process.env.ADMIN_PANEL_PATH));
  if (kind === "internal") {
    const url = request.nextUrl.clone();
    url.pathname = "/no-existe-404";
    url.search = "";
    // Same headers as any other missing page.
    return app(request, url);
  }
  if (kind !== "panel") return app(request);
  const nonce = btoa(crypto.randomUUID());
  // El único script en línea propio del diseño (tema y lectura fácil) no lleva nonce:
  // se permite por su hash, y solo ese.
  readingBootHash ??= cspHash(HEAD_BOOT);
  const csp = panelCsp(
    nonce,
    { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dreamApiUrl: process.env.NEXT_PUBLIC_DREAM_API_URL },
    [await readingBootHash],
  );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  headers.set(COOKIEBOT_HEADER, "off");
  const url = request.nextUrl.clone();
  url.pathname = PANEL_INTERNAL;
  url.search = "";
  // 404 también para el administrador: el navegador pinta la página igual, y
  // quien no lo es no puede distinguir este camino de uno que no existe.
  const response = NextResponse.rewrite(url, { request: { headers }, status: 404 });
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(PANEL_HEADERS)) response.headers.set(key, value);
  return response;
}

/**
 * Every other page: CSP with a fresh nonce (lib/csp.ts). The nonce travels in
 * the request headers so Next.js puts it on its scripts and app/layout.tsx on
 * Cookiebot's; x-dream-cookiebot says whether this page shows Cookiebot.
 */
const COOKIEBOT_HEADER = "x-dream-cookiebot";
let gameHash: Promise<string> | undefined;
async function app(request: NextRequest, rewrite?: URL): Promise<NextResponse> {
  const header = cspHeaderName();
  const headers = new Headers(request.headers);
  // Never trust these from the browser.
  headers.delete("x-nonce");
  headers.delete(COOKIEBOT_HEADER);
  const shown = COOKIEBOT.enabled && !rewrite && cookiebotPage(request.nextUrl.pathname);
  headers.set(COOKIEBOT_HEADER, shown ? "on" : "off");
  const pass = () =>
    rewrite ? NextResponse.rewrite(rewrite, { request: { headers } }) : NextResponse.next({ request: { headers } });
  if (!header) return pass();
  const nonce = btoa(crypto.randomUUID());
  readingBootHash ??= cspHash(HEAD_BOOT);
  gameHash ??= cspHash(GAME_SCRIPT);
  const csp = appCsp(
    nonce,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dreamApiUrl: process.env.NEXT_PUBLIC_DREAM_API_URL,
      posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      development: process.env.NODE_ENV === "development",
      turnstile: turnstileOn(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    },
    [await readingBootHash, await gameHash],
  );
  headers.set("x-nonce", nonce);
  // Next.js reads the nonce from this request header (only when enforced).
  if (header === "Content-Security-Policy") headers.set(header, csp);
  const response = pass();
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
  ],
};
