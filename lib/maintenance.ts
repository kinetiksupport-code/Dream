const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/** Private server-side flag. Enable with DREAM_MAINTENANCE_MODE=true. */
export function isMaintenanceEnabled() {
  return ENABLED_VALUES.has(
    (process.env.DREAM_MAINTENANCE_MODE ?? "").trim().toLowerCase(),
  );
}

export const MAINTENANCE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Dream-Maintenance": "1",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
