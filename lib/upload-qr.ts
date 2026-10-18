/**
 * Phone side of the QR upload (/subir#<token>). No user session: the token in
 * the body is the only credential, sent to dream-api with the
 * `X-Dream-Channel: qr` header. Nothing here touches analytics or
 * diagnostics, and the token is never logged or stored.
 */
import { toBase64, validateFile } from "./attachments";

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const tokenLooksValid = (token: string) => TOKEN_PATTERN.test(token);

export class UploadQrError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "",
    public retryAfter = 0,
  ) {
    super(message);
  }
}
/** Invalid, expired, closed or someone else's link: one friendly page. */
export const isInvalidLink = (error: unknown) =>
  error instanceof UploadQrError && error.code === "upload_link_invalid";

export interface QrConnection {
  deviceKey: string;
  expiresAt: string;
  uploads: number;
  maxUploads: number;
}

async function post<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const url = process.env.NEXT_PUBLIC_DREAM_API_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new UploadQrError("No se pudo conectar con Dream.", 503);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        "X-Dream-Channel": "qr",
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new UploadQrError(
      "No hay conexión. Comprueba tu internet y vuelve a probar.",
      0,
      "network",
    );
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {}
  if (!response.ok)
    throw new UploadQrError(
      typeof data.error === "string"
        ? data.error
        : "No se pudo subir. Inténtalo de nuevo.",
      response.status,
      typeof data.code === "string" ? data.code : "",
      Number(data.retry_after) ||
        Number(response.headers.get("Retry-After")) ||
        0,
    );
  return data as T;
}

export async function qrConnect(
  token: string,
  deviceKey?: string,
  signal?: AbortSignal,
): Promise<QrConnection> {
  if (!tokenLooksValid(token))
    throw new UploadQrError("", 404, "upload_link_invalid");
  const data = await post<{
    device_key: string;
    expires_at: string;
    uploads: number;
    max_uploads: number;
  }>(
    {
      action: "upload_qr_connect",
      token,
      ...(deviceKey ? { device_key: deviceKey } : {}),
    },
    signal,
  );
  return {
    deviceKey: data.device_key,
    expiresAt: data.expires_at,
    uploads: data.uploads,
    maxUploads: data.max_uploads,
  };
}

export async function qrUploadFile(
  token: string,
  deviceKey: string,
  file: File,
  signal?: AbortSignal,
): Promise<{ uploads: number; maxUploads: number }> {
  try {
    validateFile(file); // comfort only; dream-api validates again
  } catch (error) {
    throw new UploadQrError(
      error instanceof Error ? error.message : "Este archivo no vale.",
      400,
      "upload_file_rejected",
    );
  }
  const content = await toBase64(file);
  const data = await post<{ uploads: number; max_uploads: number }>(
    {
      action: "upload_qr_file",
      token,
      device_key: deviceKey,
      file_name: file.name || "foto.jpg",
      mime_type: file.type,
      content_base64: content,
    },
    signal,
  );
  return { uploads: data.uploads, maxUploads: data.max_uploads };
}

/**
 * The phone's key lives in sessionStorage (this tab only, gone when it
 * closes) so a reload after the camera does not lock the phone out. It is a
 * random credential, not personal content.
 */
const deviceSlot = (token: string) => `dream-qr-device:${token.slice(0, 8)}`;
export function readDeviceKey(token: string): string | undefined {
  try {
    const value = sessionStorage.getItem(deviceSlot(token));
    return value && TOKEN_PATTERN.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function saveDeviceKey(token: string, key: string) {
  try {
    sessionStorage.setItem(deviceSlot(token), key);
  } catch {}
}

/**
 * Reads the token from the fragment (/subir#<token>), removes it from the
 * address bar and history at once, and keeps it for this tab only so a
 * reload after the camera still works. Returns "" when there is none.
 */
const TOKEN_SLOT = "dream-qr-token";
export function takeTokenFromLocation(): string {
  const fromHash = decodeURIComponent(window.location.hash.slice(1)).trim();
  if (fromHash) {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    try {
      sessionStorage.setItem(TOKEN_SLOT, fromHash);
    } catch {}
    return fromHash;
  }
  try {
    return sessionStorage.getItem(TOKEN_SLOT) ?? "";
  } catch {
    return "";
  }
}
