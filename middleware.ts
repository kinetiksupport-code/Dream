import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isMaintenanceMode,
  MAINTENANCE_COOKIE_NAME,
  verifyMaintenanceAccessToken,
} from "@/lib/maintenance";
import { canonicalRedirect } from "@/lib/auth-redirect";

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

// /subir/<token> carries a secret in the path: never cached, never sent as a
// Referer, never indexed. Applied to every response of that route, including
// the canonical and maintenance redirects.
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

  if (!isMaintenanceMode()) {
    return NextResponse.next();
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
    return NextResponse.next();
  }

  const token = request.cookies.get(MAINTENANCE_COOKIE_NAME)?.value;
  if (await verifyMaintenanceAccessToken(token)) {
    return NextResponse.next();
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
  ],
};
