/**
 * Desktop side of "upload from your phone" (QR). Used by the exam wizard
 * through components/exams/qr-panel.tsx. Contract: docs/SUBIDA_QR.md.
 *
 * Live updates use short polling with backoff instead of Supabase Realtime:
 * the project has no Realtime publication or policies, every read goes
 * through dream-api, and the session table is private (service role only).
 */
import { callDream } from "./dream-api";

export type UploadSessionState = "open" | "connected" | "expired" | "closed";
export type UploadSessionFileStatus = "processing" | "processed" | "failed";
export interface UploadSessionFile {
  id: string;
  attachment_id: string | null;
  file_name: string;
  size_bytes: number;
  status: UploadSessionFileStatus;
  created_at: string;
}
export interface UploadSessionStatus {
  id: string;
  state: UploadSessionState;
  connected: boolean;
  connected_at: string | null;
  expires_at: string;
  uploads: number;
  max_uploads: number;
  files: UploadSessionFile[];
}
export interface CreatedUploadSession {
  id: string;
  /** Shown once (inside the QR). Never store or log it. */
  token: string;
  /** Absolute link for the QR, e.g. https://www.edudream.es/subir/<token>. */
  url: string;
  expiresAt: string;
  ttlSeconds: number;
  maxUploads: number;
}

export const UPLOAD_POLL = {
  /** First wait and wait right after any change. */
  minMs: 1500,
  /** Longest wait while nothing changes. */
  maxMs: 6000,
  factor: 1.6,
  /** Renew when less than this is left and the QR is still on screen. */
  renewBeforeMs: 120_000,
} as const;

export async function createUploadSession(
  examId: string,
  signal?: AbortSignal,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): Promise<CreatedUploadSession> {
  const { session } = await callDream<{
    session: {
      id: string;
      token: string;
      url: string;
      expires_at: string;
      ttl_seconds: number;
      max_uploads: number;
    };
  }>("upload_session_create", { exam_id: examId }, signal);
  return {
    id: session.id,
    token: session.token,
    url: new URL(session.url, origin || "https://www.edudream.es").toString(),
    expiresAt: session.expires_at,
    ttlSeconds: session.ttl_seconds,
    maxUploads: session.max_uploads,
  };
}

export async function renewUploadSession(
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  const { session } = await callDream<{
    session: { id: string; expires_at: string };
  }>("upload_session_renew", { session_id: id }, signal);
  return session.expires_at;
}

export async function getUploadSessionStatus(
  id: string,
  signal?: AbortSignal,
): Promise<UploadSessionStatus> {
  const { session } = await callDream<{ session: UploadSessionStatus }>(
    "upload_session_status",
    { session_id: id },
    signal,
  );
  return session;
}

/** Invalidates the QR right away (next step, leaving the wizard). */
export async function closeUploadSession(id: string): Promise<void> {
  await callDream("upload_session_close", { session_id: id });
}

export function msLeft(expiresAt: string, now = Date.now()): number {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}
export function shouldRenew(expiresAt: string, now = Date.now()): boolean {
  const left = msLeft(expiresAt, now);
  return left > 0 && left < UPLOAD_POLL.renewBeforeMs;
}
export function isFinished(status: Pick<UploadSessionStatus, "state">) {
  return status.state === "closed" || status.state === "expired";
}

/** Changes that matter to the screen (not the expiry, which renew moves). */
export function statusSignature(status: UploadSessionStatus): string {
  return [
    status.state,
    status.connected ? 1 : 0,
    status.uploads,
    ...status.files.map((f) => `${f.id}:${f.status}`),
  ].join("|");
}

/**
 * Backoff: back to the minimum after a change or while a file is still
 * processing on the phone; otherwise grow up to the maximum.
 */
export function nextPollDelay(
  previous: number,
  changed: boolean,
  processing: boolean,
): number {
  if (changed || processing) return UPLOAD_POLL.minMs;
  return Math.min(
    UPLOAD_POLL.maxMs,
    Math.round(Math.max(previous, UPLOAD_POLL.minMs) * UPLOAD_POLL.factor),
  );
}

/**
 * Polls the session until it is closed or expires, or `signal` aborts.
 * Pauses while the tab is hidden and checks at once when it returns.
 */
export function watchUploadSession(
  id: string,
  handlers: {
    onStatus: (status: UploadSessionStatus) => void;
    onError?: (error: unknown) => void;
  },
  signal: AbortSignal,
  deps: {
    fetchStatus?: typeof getUploadSessionStatus;
    hidden?: () => boolean;
  } = {},
): void {
  const fetchStatus = deps.fetchStatus ?? getUploadSessionStatus;
  const hidden =
    deps.hidden ??
    (() => typeof document !== "undefined" && document.hidden === true);
  let delay: number = UPLOAD_POLL.minMs;
  let signature = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const schedule = (ms: number) => {
    if (signal.aborted) return;
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  };
  async function tick() {
    if (signal.aborted || running) return;
    if (hidden()) return; // resumes on visibilitychange
    running = true;
    try {
      const status = await fetchStatus(id, signal);
      if (signal.aborted) return;
      const next = statusSignature(status);
      const changed = next !== signature;
      signature = next;
      if (changed) handlers.onStatus(status);
      if (isFinished(status)) return stop();
      delay = nextPollDelay(
        delay,
        changed,
        status.files.some((f) => f.status === "processing"),
      );
    } catch (error) {
      if (signal.aborted) return;
      handlers.onError?.(error);
      delay = UPLOAD_POLL.maxMs;
    } finally {
      running = false;
    }
    schedule(delay);
  }
  const onVisible = () => {
    if (!hidden()) schedule(0);
  };
  function stop() {
    clearTimeout(timer);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
  }
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", onVisible);
  signal.addEventListener("abort", stop, { once: true });
  schedule(0);
}
