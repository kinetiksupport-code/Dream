import { NextResponse } from "next/server";
import { ipCheck } from "@/lib/ip-check";

// Diagnóstico para docs/ip-real.md: solo «sí» o «no», nunca una IP.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json(ipCheck(request.headers), {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
