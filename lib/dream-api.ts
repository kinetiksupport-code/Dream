import { getSupabase } from "./supabase";
import { assertDreamAvailable } from "./maintenance-client";
import { readNDJSON } from "./streaming";
import type { DreamProfile, DreamStreamEvent } from "./types";
export type DreamAction =
  | "profile"
  | "conversations"
  | "conversation_create"
  | "conversation_rename"
  | "conversation_delete"
  | "conversations_delete_all"
  | "messages"
  | "chat"
  | "attachment_upload"
  | "test_generate"
  | "test_get"
  | "test_check_answer"
  | "test_submit"
  | "preferences_update";
export class DreamApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(
  action: DreamAction,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  await assertDreamAvailable(signal);
  const { data, error } = await getSupabase().auth.getSession();
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
    body: JSON.stringify({ ...payload, action }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "No se pudo conectar con Dream. Inténtalo de nuevo.";
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
    } catch {}
    if (response.status === 401)
      window.dispatchEvent(new Event("dream:session-expired"));
    throw new DreamApiError(message, response.status);
  }
  return response;
}
export async function callDream<T>(
  action: DreamAction,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await request(action, payload, signal);
  return response.json() as Promise<T>;
}
export async function streamDreamChat(
  payload: {
    conversation_id: string;
    prompt: string;
    attachment_ids: string[];
  },
  onEvent: (event: DreamStreamEvent) => void,
  signal: AbortSignal,
) {
  const response = await request("chat", payload, signal);
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("application/x-ndjson")
  )
    throw new Error("Dream no devolvió una respuesta en streaming.");
  await readNDJSON(response.body, onEvent, signal);
}
export async function getDreamProfile(signal?: AbortSignal) {
  const data = await callDream<{
    profile: DreamProfile;
    service_ready: boolean;
  }>("profile", {}, signal);
  const p = data.profile;
  return {
    profile: {
      email: p.email,
      display_name: p.display_name,
      pref_step_by_step: p.pref_step_by_step,
      pref_practice_suggestions: p.pref_practice_suggestions,
      pref_calm_tone: p.pref_calm_tone,
    },
    service_ready: data.service_ready,
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
  const message =
    error instanceof Error
      ? error.message
      : "Algo no ha ido bien. Inténtalo de nuevo.";
  if (
    /\b(profesor(?:es)?|alumn[oa]s?|student|teacher|education_mode|role)\b/i.test(
      message,
    )
  )
    return "Esta función no está disponible para tu cuenta todavía.";
  return message;
}
