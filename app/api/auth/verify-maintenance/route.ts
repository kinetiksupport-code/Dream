import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createMaintenanceAccessToken,
  isAllowedEmail,
  isMaintenanceMode,
  MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  MAINTENANCE_COOKIE_NAME,
} from "@/lib/maintenance";

function clearMaintenanceCookies(response: NextResponse): NextResponse {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(MAINTENANCE_COOKIE_NAME, "", options);
  // Remove the unsigned cookie issued by the previous implementation.
  response.cookies.set("dream-maint-allowed", "", options);
  return response;
}

function denied(status: number): NextResponse {
  return clearMaintenanceCookies(
    NextResponse.json(
      { allowed: false, maintenance: true },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    ),
  );
}

export async function POST(request: NextRequest) {
  if (!isMaintenanceMode()) {
    return clearMaintenanceCookies(
      NextResponse.json(
        { allowed: true, maintenance: false },
        { headers: { "Cache-Control": "no-store" } },
      ),
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const accessToken = match?.[1];
  if (!accessToken) return denied(401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return denied(503);

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return denied(401);

    const user = data.user;
    const email = user.email?.trim().toLowerCase();
    if (
      !email ||
      !user.email_confirmed_at ||
      !isAllowedEmail(email)
    ) {
      return denied(403);
    }

    let signedToken: string;
    try {
      signedToken = await createMaintenanceAccessToken(user.id, email);
    } catch {
      return denied(503);
    }

    const response = NextResponse.json(
      { allowed: true, maintenance: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(MAINTENANCE_COOKIE_NAME, signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
    });
    response.cookies.set("dream-maint-allowed", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return denied(503);
  }
}
