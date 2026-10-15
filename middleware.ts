import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isMaintenanceMode,
  MAINTENANCE_COOKIE_NAME,
  verifyMaintenanceAccessToken,
} from "@/lib/maintenance";
import { LEGAL_ROUTES } from "@/lib/legal";

const PUBLIC_ROUTES = new Set([
  "/maintenance",
  "/login",
  "/auth/callback",
  "/api/auth/verify-maintenance",
  // Legal pages stay readable during maintenance (no data, no session).
  ...LEGAL_ROUTES,
]);
const STATIC_ASSET = /\.(?:avif|css|eot|gif|ico|jpe?g|js|json|map|mjs|png|svg|txt|ttf|webmanifest|webp|woff2?)$/i;

export async function middleware(request: NextRequest) {
  if (!isMaintenanceMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname === "/sw.js" ||
    ((!pathname.startsWith("/api/")) &&
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
