import { NextResponse } from "next/server";
import {
  isMaintenanceEnabled,
  MAINTENANCE_RESPONSE_HEADERS,
} from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const maintenance = isMaintenanceEnabled();
  return NextResponse.json(
    { maintenance },
    {
      status: maintenance ? 503 : 200,
      headers: maintenance
        ? MAINTENANCE_RESPONSE_HEADERS
        : {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
    },
  );
}
