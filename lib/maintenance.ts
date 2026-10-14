// Server-only maintenance configuration and signed access tokens.
// The allowlist is intentionally private and must never be sent to the client.

export const MAINTENANCE_COOKIE_NAME = "dream-maint-access";
export const MAINTENANCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

const ALLOWED_EMAILS = new Set([
  "carlossanchezma1999@gmail.com",
  "hellodream@edudream.es",
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type MaintenanceTokenPayload = {
  sub: string;
  exp: number;
  purpose: "dream-maintenance";
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const secret = process.env.MAINTENANCE_COOKIE_SECRET;
  if (!secret || secret.length < 32) return null;
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export async function createMaintenanceAccessToken(
  userId: string,
  email: string,
): Promise<string> {
  if (!userId || !isAllowedEmail(email)) {
    throw new Error("Maintenance access denied");
  }

  const key = await getSigningKey();
  if (!key) throw new Error("Maintenance signing is not configured");

  const payload: MaintenanceTokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
    purpose: "dream-maintenance",
  };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(encodedPayload),
    ),
  );
  return encodedPayload + "." + base64UrlEncode(signature);
}

export async function verifyMaintenanceAccessToken(
  token: string | null | undefined,
): Promise<boolean> {
  try {
    if (!token || token.length > 2048) return false;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

    const signature = base64UrlDecode(parts[1]);
    const payloadBytes = base64UrlDecode(parts[0]);
    const key = await getSigningKey();
    if (!signature || !payloadBytes || !key) return false;

    const validSignature = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(parts[0]),
    );
    if (!validSignature) return false;

    const payload = JSON.parse(
      decoder.decode(payloadBytes),
    ) as Partial<MaintenanceTokenPayload>;
    const now = Math.floor(Date.now() / 1000);
    return (
      typeof payload.sub === "string" &&
      payload.sub.length > 0 &&
      payload.purpose === "dream-maintenance" &&
      typeof payload.exp === "number" &&
      Number.isInteger(payload.exp) &&
      payload.exp > now &&
      payload.exp <= now + MAINTENANCE_COOKIE_MAX_AGE_SECONDS + 60
    );
  } catch {
    return false;
  }
}
