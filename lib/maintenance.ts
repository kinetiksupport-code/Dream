// Server-only maintenance configuration.
// Toggle with MAINTENANCE_MODE=true (server env).
// Allowlist is private — never expose to client or logs.

const ALLOWED_EMAILS = new Set([
  "carlossanchezma1999@gmail.com",
  "hellodream@edudream.es",
]);

export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ALLOWED_EMAILS.has(normalized);
}
