import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMaintenanceMode } from "@/lib/maintenance";

const PROTECTED_PREFIXES = [
  "/chat",
  "/exams",
  "/progress",
  "/settings",
  "/tests",
];

export function middleware(request: NextRequest) {
  if (!isMaintenanceMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Public paths always allowed
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/manifest") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const allowed = request.cookies.get("dream-maint-allowed")?.value === "1";
  if (allowed) {
    return NextResponse.next();
  }

  // Redirect everything else (including root and protected) to maintenance
  if (pathname !== "/maintenance") {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
  ],
};
