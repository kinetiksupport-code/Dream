import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAllowedEmail, isMaintenanceMode } from "@/lib/maintenance";

export async function POST(request: NextRequest) {
  if (!isMaintenanceMode()) {
    return NextResponse.json({ allowed: true });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ allowed: false }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ allowed: false }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ allowed: false }, { status: 401 });
  }

  const user = data.user;
  const email = user.email?.trim().toLowerCase();
  const emailVerified = user.email_confirmed_at != null;

  if (!email || !emailVerified || !isAllowedEmail(email)) {
    return NextResponse.json({ allowed: false }, { status: 403 });
  }

  const response = NextResponse.json({ allowed: true });
  response.cookies.set("dream-maint-allowed", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return response;
}
