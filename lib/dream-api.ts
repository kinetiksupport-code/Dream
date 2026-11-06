import { requestAbort } from "./request-abort";
import { track } from "./observability/analytics";
import { captureDiagnostic } from "./observability/diagnostics";
import type { Outcome } from "./observability/policy";
import { getSupabase } from "./supabase";
import { readNDJSON, DreamStreamError } from "./streaming";
import { askHuman } from "./human-check";
import { TURNSTILE_ACTIONS } from "./turnstile";
import type { DreamProfile, DreamStreamEvent } from "./types";
import type { StudyProfile } from "./onboarding";
export type DreamAction =
  | "exams"
  // Ruta de estudio (tras DREAM_STUDY_STEPS_ENABLED)
  | "unit_content_get"
  | "unit_progress_save"
  | "unit_quiz_get"
  | "unit_quiz_answer"
  | "unit_quiz_finish"
  | "unit_quiz_rate"
  | "cards_due"
  | "cards_list"
  | "mock_preview"
  | "exam_blueprint_get"
  | "mock_create"
  | "mock_get"
  | "mock_submit"
  | "mock_dispute"
  | "mock_cause"
  | "card_review"
  | "card_create"
  | "card_update"
  | "card_delete"
  | "cards_import"
  | "card_report"
  | "error_bank_list"
  | "study_quota"
  | "study_today"
  | "special_welcome_seen"
  | "memory_list"
  | "memory_toggle"
  | "memory_delete"
  | "memory_delete_all"
  | "memory_pin"
  | "memory_import_preview"
  | "memory_import_commit"
  | "memory_seen"
  | "data_export"
  | "crisp_link"
  | "crisp_unlink"
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
  | "exam_delete"
  | "exam_draft_update"
  | "exam_analyze"
  | "exam_identify"
  | "exam_session_create"
  | "exam_session_get"
  | "exam_session_save"
  | "exam_session_submit"
  | "exam_route_regenerate"
  | "upload_session_create"
  | "upload_session_renew"
  | "upload_session_status"
  | "upload_session_close"
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
  | "scheme_generate"
  | "scheme_get"
  | "scheme_update"
  | "scheme_refine"
  | "scheme_illustrate"
  | "game_generate"
  | "game_get"
  | "game_result"
  | "dreams_list"
  | "chat_route"
  | "test_get"
  | "test_check_answer"
  | "test_submit"
  | "consent"
  | "consent_withdraw"
  | "onboarding_save"
  | "onboarding_age"
  | "mod_ban_info"
  | "mod_appeal_create"
  | "mod_notices"
  | "mod_ack";
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
  const send = (extra: Record<string, unknown> = {}) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session!.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        ...extra,
        action,
        request_id: crypto.randomUUID(),
      }),
      signal,
      cache: "no-store",
    });
  let response = await send();
  // Cuenta nueva y algo raro: dream-api pide Turnstile antes de la primera
  // acción de IA (docs/turnstile.md). Se muestra la comprobación y se repite
  // una sola vez con el token; si el alumno cancela, sale el error normal.
  // «Reclamar» lleva su propio widget (components/moderation/appeal-form.tsx).
  if (response.status === 428 && action !== "mod_appeal_create" && typeof window !== "undefined") {
    const code = await response
      .clone()
      .json()
      .then((d: { code?: unknown }) => d.code)
      .catch(() => "");
    if (code === "turnstile_required") {
      const token = await askHuman(TURNSTILE_ACTIONS.firstAi);
      if (token) response = await send({ turnstile_token: token });
    }
  }
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
    // The AI permission is missing (withdrawn, or new terms): the profile is
    // read again and the welcome asks for it (docs/CONSENTIMIENTO.md §4).
    if (code === "consent_required" && typeof window !== "undefined")
      window.dispatchEvent(new Event("dream:consent-required"));
    // A ban was applied while the session was open: the profile is read again
    // and Dream shows the ban screen (B6). A moderation block (unusual use from
    // the connection or a limited account) shows the notice with «Reclamar».
    if (code === "banned" && typeof window !== "undefined")
      window.dispatchEvent(new Event("dream:banned"));
    if ((code === "mod_ip_blocked" || code === "mod_user_limited") && typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("dream:mod-limited", { detail: { code, message, retryAfter } }),
      );
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
    ban?: { until?: string | null; permanent?: boolean; rule?: string | null } | null;
    special_account?: { welcome?: unknown } | null;
    features?: { memory?: unknown; memory_import?: unknown };
    study_steps?: unknown;
    ai_route?: unknown;
    memory_enabled?: unknown;
    memory_new?: unknown;
  }>("profile", {}, signal);
  const p = data?.profile;
  if (!p || typeof p !== "object") {
    throw new Error("No se pudo cargar tu perfil. Inténtalo de nuevo.");
  }
  const profile: DreamProfile = {
    email: p.email ?? "",
    display_name: p.display_name ?? "",
  };
  // Consent and welcome fields only exist once dream-api sends them
  // (docs/CONSENTIMIENTO.md). Copied only when present, so today's server
  // keeps the welcome off.
  if (p.ai_consent_at !== undefined) {
    profile.ai_consent_at = p.ai_consent_at ?? null;
    profile.terms_accepted_at = p.terms_accepted_at ?? null;
    profile.terms_version = p.terms_version ?? null;
    profile.age_band = p.age_band ?? null;
    profile.nickname = p.nickname ?? null;
    profile.interests = Array.isArray(p.interests)
      ? p.interests.filter((x): x is string => typeof x === "string")
      : [];
    profile.onboarding_completed = p.onboarding_completed === true;
    profile.onboarding_step =
      typeof p.onboarding_step === "number" ? p.onboarding_step : 0;
  }
  if (typeof p.academic_level === "string" || p.academic_level === null)
    profile.academic_level = p.academic_level;
  const study = (p as { study_profile?: unknown }).study_profile;
  if (study && typeof study === "object" && !Array.isArray(study)) {
    const sp = study as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    profile.study_profile = {
      hard: Array.isArray(sp.hard) ? sp.hard.filter((x): x is string => typeof x === "string") : [],
      region: str(sp.region),
      goal: str(sp.goal),
      style: str(sp.style),
      time: str(sp.time),
    };
  }
  // Solo la cuenta administradora recibe esto; la ruta se valida para que nunca
  // sea un enlace raro (el enlace ni es la seguridad ni se fía del servidor a ciegas).
  const panel = (p as { admin_panel?: { path?: unknown } }).admin_panel;
  if (typeof panel?.path === "string" && /^\/[a-z0-9][a-z0-9-]{2,40}$/.test(panel.path))
    profile.admin_panel = { path: panel.path };
  // Banned (manual or automatic): dream-api only answers the ban screen.
  if (data.ban && typeof data.ban === "object")
    profile.ban = {
      until: typeof data.ban.until === "string" ? data.ban.until : null,
      permanent: data.ban.permanent === true,
      rule: typeof data.ban.rule === "string" ? data.ban.rule : null,
    };
  // Memoria entre chats: solo si dream-api la tiene encendida.
  if (data.features?.memory === true) {
    profile.memory_feature = true;
    profile.memory_import_feature = data.features.memory_import === true;
    profile.memory_enabled = data.memory_enabled === true;
    profile.memory_new =
      typeof data.memory_new === "number" && data.memory_new > 0
        ? Math.min(40, Math.floor(data.memory_new))
        : 0;
  }
  // Bienvenida de Loyola: texto corto del servidor, una sola vez.
  const welcome = data.special_account?.welcome;
  if (typeof welcome === "string" && welcome.length <= 200)
    profile.special_welcome = welcome;
  return { profile, service_ready: data.service_ready ?? true, study_steps: data.study_steps === true, ai_route: data.ai_route === true };
}

/** La bienvenida de Loyola ya se ha visto: no vuelve a salir. */
export async function markSpecialWelcomeSeen() {
  await callDream("special_welcome_seen", {});
}

/*
 * Welcome actions (prompt «bienvenida» §4.4). TODO(dream-api): they are
 * designed in docs/CONSENTIMIENTO.md and need Carlos's OK to deploy. Until
 * then the welcome never shows (see consentGate), so they are never called in
 * production; the browser tests answer them with a mock.
 */

/** Steps 2–4: name, hobbies and nickname, plus the next step to resume at. */
export function saveOnboarding(input: {
  /** Next welcome step; left out when editing from Ajustes › Perfil. */
  step?: number;
  display_name?: string;
  interests?: string[];
  nickname?: string;
  /** Ajustes › Perfil › Cómo estudias (listas cerradas). */
  academic_level?: string | null;
  study_profile?: StudyProfile;
}) {
  return callDream<{ profile?: unknown }>("onboarding_save", input);
}

/**
 * Step 5: the server checks the age. Under 14 it erases what the welcome
 * saved (name, hobbies, nickname) and keeps no birth date; 14 or older it
 * keeps nothing yet (the date is saved with the consent).
 */
export function checkAge(birth_date: string) {
  return callDream<{ allowed: boolean }>("onboarding_age", { birth_date });
}

/** Ajustes › Privacidad: the account stays, without chat (docs/CONSENTIMIENTO.md §5). */
export function withdrawConsent() {
  return callDream<{ profile?: unknown }>("consent_withdraw", { kind: "ai" });
}

/** Step 6: both boxes, with the version of the terms shown. */
export function saveConsent(input: {
  birth_date?: string;
  ai_consent: boolean;
  terms_accepted: boolean;
  terms_version: string;
}) {
  return callDream<{ profile?: unknown }>("consent", input);
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
