// Deny by default: academic content and identities never enter telemetry.
export const sections = [
  "home",
  "login",
  "chat",
  "exams",
  "tests",
  "progress",
  "settings",
  "other",
] as const;
export type Section = (typeof sections)[number];
export const events = [
  "login_completed",
  "conversation_started",
  "exam_created",
  "simulation_completed",
  "feature_error",
  "rate_limit_reached",
  "api_request_completed",
  "section_viewed",
  "analytics_verification",
] as const;
export type AnalyticsEvent = (typeof events)[number];
export type Outcome =
  "success" | "http_error" | "network_error" | "stream_error" | "aborted";
export interface SafeProperties {
  environment?: "production" | "preview" | "development";
  section?: Section;
  action?: string;
  mode?: "practice" | "exam";
  http_status?: number;
  duration_ms?: number;
  outcome?: Outcome;
}
const actions = new Set([
  "exams",
  "exam_create",
  "exam_get",
  "exam_update",
  "exam_rhythm",
  "exam_upload_start",
  "exam_material_add",
  "exam_material_remove",
  "exam_prepare",
  "exam_unit_start",
  "exam_unit_complete",
  "exam_complete",
  "exam_session_create",
  "exam_session_get",
  "exam_session_save",
  "exam_session_submit",
  "profile",
  "conversations",
  "conversation_create",
  "conversation_rename",
  "conversation_delete",
  "conversations_delete_all",
  "account_delete",
  "messages",
  "chat",
  "attachment_upload",
  "test_generate",
  "test_get",
  "test_check_answer",
  "test_submit",
]);
export function sectionForPath(path: string): Section {
  const segment = path.split("?")[0].split("/")[1];
  return !segment
    ? "home"
    : sections.includes(segment as Section)
      ? (segment as Section)
      : "other";
}
export function safeProperties(input: unknown): SafeProperties {
  const p =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const out: SafeProperties = {};
  if (
    p.environment === "production" ||
    p.environment === "preview" ||
    p.environment === "development"
  )
    out.environment = p.environment;
  if (sections.includes(p.section as Section))
    out.section = p.section as Section;
  if (typeof p.action === "string" && actions.has(p.action))
    out.action = p.action;
  if (p.mode === "practice" || p.mode === "exam") out.mode = p.mode;
  if (
    typeof p.http_status === "number" &&
    Number.isInteger(p.http_status) &&
    p.http_status >= 100 &&
    p.http_status <= 599
  )
    out.http_status = p.http_status;
  if (typeof p.duration_ms === "number" && Number.isFinite(p.duration_ms))
    out.duration_ms = Math.min(3600000, Math.max(0, Math.round(p.duration_ms)));
  if (
    [
      "success",
      "http_error",
      "network_error",
      "stream_error",
      "aborted",
    ].includes(String(p.outcome))
  )
    out.outcome = p.outcome as Outcome;
  return out;
}
export function safeRoute(path: unknown): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  )
    return "/other";
  const section = sectionForPath(path);
  if (section === "other") return "/other";
  if (section === "home") return "/";
  return "/" + section;
}
