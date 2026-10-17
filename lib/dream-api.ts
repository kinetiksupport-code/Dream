import { requestAbort } from "./request-abort";
import { track } from "./observability/analytics";
import { captureDiagnostic } from "./observability/diagnostics";
import type { Outcome } from "./observability/policy";
import { getSupabase } from "./supabase";
import { readNDJSON, DreamStreamError } from "./streaming";
import type { DreamProfile, DreamStreamEvent } from "./types";
export type DreamAction =
  | "exams"
  | "exam_create"
  | "exam_get"
  | "exam_update"
  | "exam_rhythm"
  | "exam_upload_start"
  | "exam_material_add"
  | "exam_material_remove"
  | "exam_prepare"
  | "exam_unit_start"
  | "exam_unit_complete"
  | "exam_complete"
  | "exam_session_create"
  | "exam_session_get"
  | "exam_session_save"
  | "exam_session_submit"
  | "profile"
  | "ai_usage"
  | "conversations"
  | "conversation_create"
  | "conversation_rename"
  | "conversation_delete"
  | "conversations_delete_all"
  | "account_delete"
  | "messages"
  | "chat"
  | "attachment_upload"
  | "test_generate"
  | "test_get"
  | "test_check_answer"
  | "test_submit";
export class DreamApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 0,
    public code = "",
    public position = 0,
  ) {
    super(message);
  }
}
async function request(
  action: DreamAction,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const { data, error } = await getSupabase().auth.getSession();
  if (error?.name === "AuthRetryableFetchError")
    throw new DreamApiError(
      "No se pudo comprobar la sesión. Reintenta cuando vuelva la conexión.",
      503,
      30,
    );
  if (error || !data.session) {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("dream:session-expired"));
    throw new DreamApiError("Tu sesión ha terminado. Vuelve a entrar.", 401);
  }
  const url = process.env.NEXT_PUBLIC_DREAM_API_URL;
  if (!url) throw new Error("Falta configurar dream-api.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      action,
      request_id: crypto.randomUUID(),
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    let code = "";
    let retryAfter = Number(response.headers.get("Retry-After")) || 0;
    let message = "No se pudo conectar con Dream. Inténtalo de nuevo.";
    let position = 0;
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
      if (typeof data.code === "string") code = data.code;
      if (typeof data.retry_after === "number") retryAfter = data.retry_after;
      if (Number.isInteger(data.position) && data.position > 0)
        position = data.position;
    } catch {}
    if (response.status === 401)
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("dream:session-expired"));
    throw new DreamApiError(
      message,
      response.status,
      retryAfter,
      code,
      position,
    );
  }
  return response;
}
export async function callDream<T>(
  action: DreamAction,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const start = performance.now();
  const lifecycle = requestAbort(signal);
  try {
    const response = await request(action, payload, lifecycle.signal);
    const result = (await response.json()) as T;
    reportRequest(action, start, "success", response.status);
    if (action === "conversation_create")
      track("conversation_started", { action, section: "chat" });
    if (action === "exam_create")
      track("exam_created", { action, section: "exams" });
    return result;
  } catch (error) {
    reportFailure(action, start, error, signal);
    throw error;
  } finally {
    lifecycle.dispose();
  }
}
export async function streamDreamChat(
  payload: {
    conversation_id: string;
    prompt: string;
    attachment_ids: string[];
    exam_id?: string;
    unit_id?: string;
    mode?: string;
    /** Optional chat shortcut id; older dream-api versions ignore it. */
    shortcut?: string;
  },
  onEvent: (event: DreamStreamEvent) => void,
  signal: AbortSignal,
) {
  const start = performance.now();
  const lifecycle = requestAbort(signal);
  try {
    const response = await request("chat", payload, lifecycle.signal);
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("application/x-ndjson")
    )
      throw new Error("Dream no devolvió una respuesta en streaming.");
    let backendFailed = false;
    await readNDJSON(
      response.body,
      (event) => {
        if (event.type === "error") backendFailed = true;
        onEvent(event);
      },
      signal,
    );
    reportRequest(
      "chat",
      start,
      backendFailed ? "stream_error" : "success",
      response.status,
    );
    if (backendFailed)
      captureDiagnostic(new Error("Dream stream failed"), {
        action: "chat",
        outcome: "stream_error",
      });
  } catch (error) {
    reportFailure("chat", start, error, signal);
    throw error;
  } finally {
    lifecycle.dispose();
  }
}
function reportRequest(
  action: DreamAction,
  start: number,
  outcome: Outcome,
  http_status?: number,
) {
  const properties = {
    action,
    duration_ms: performance.now() - start,
    outcome,
    http_status,
  };
  track("api_request_completed", properties);
  if (outcome !== "success" && outcome !== "aborted")
    track("feature_error", properties);
}
function reportFailure(
  action: DreamAction,
  start: number,
  error: unknown,
  signal?: AbortSignal,
) {
  const outcome = signal?.aborted
    ? "aborted"
    : error instanceof DreamStreamError
      ? "stream_error"
      : error instanceof DreamApiError
        ? "http_error"
        : "network_error";
  const http_status =
    error instanceof DreamApiError || error instanceof DreamStreamError
      ? error.status
      : undefined;
  reportRequest(action, start, outcome, http_status);
  if (http_status === 429)
    track("rate_limit_reached", { action, http_status, outcome });
  // Never pass the backend's exception message or payload to a monitoring SDK.
  if (outcome !== "aborted")
    captureDiagnostic(new Error("Dream API request failed"), {
      action,
      http_status,
      outcome,
    });
}
export async function getDreamProfile(signal?: AbortSignal) {
  const data = await callDream<{
    profile: DreamProfile | null;
    service_ready?: boolean;
  }>("profile", {}, signal);
  const p = data?.profile;
  if (!p || typeof p !== "object") {
    throw new Error("No se pudo cargar tu perfil. Inténtalo de nuevo.");
  }
  return {
    profile: {
      email: p.email ?? "",
      display_name: p.display_name ?? "",
    },
    service_ready: data.service_ready ?? true,
  };
}
export function errorMessage(error: unknown) {
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  )
    return "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.";
  if (error instanceof SyntaxError)
    return "No se pudo leer la respuesta de Dream. El texto recibido se conserva.";
  return error instanceof Error
    ? error.message
    : "Algo no ha ido bien. Inténtalo de nuevo.";
}
