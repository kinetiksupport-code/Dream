import { callDream, type DreamAction } from "./dream-api";
import type { AnswerValue, TestResult } from "./types";
import type { StoredRoute } from "../supabase/functions/dream-api/route-plan.mjs";
/** Materials per exam; the server enforces it in dream_exam_link_material. */
export const MAX_EXAM_MATERIALS = 20;
export interface ExamUnit {
  id: string;
  position: number;
  title: string;
  topic: string;
  summary: string;
  estimated_minutes: number;
  status: "pending" | "in_progress" | "completed";
  conversation_id: string | null;
  /** Set by `exam_unit_complete` (dream-api selects every unit column). */
  completed_at?: string | null;
}
export interface ExamMaterial {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
}
export interface ExamSessionSummary {
  id: string;
  mode: "practice" | "exam";
  status: "generating" | "failed" | "active" | "grading" | "completed";
  started_at: string;
  submitted_at: string | null;
  /** Unidad del test (si es de un tema). Lo envía dream-api desde la ruta con IA. */
  unit_id?: string | null;
  /** Porcentaje de aciertos de un test terminado. */
  percentage?: number | null;
}
export interface ExamSession extends ExamSessionSummary {
  test_id: string | null;
  generation_error?: string | null;
  exam_id: string;
  /** Unit practised in this session; null for a full-exam simulation. */
  unit_id?: string | null;
  /** Previous session whose mistakes this review practises. */
  source_session_id?: string | null;
  answers: Record<string, AnswerValue>;
  question_index: number;
  revision: number;
  time_limit_seconds: number | null;
  result: TestResult | null;
}
export interface ExamFields {
  title: string;
  subject: string;
  exam_date: string;
  topics: string[];
  difficulties: string;
  goal: string;
  daily_minutes: number;
}
export interface DreamExam extends ExamFields {
  id: string;
  status: "draft" | "preparing" | "ready" | "failed" | "completed";
  conversation_id: string | null;
  plan_error: string | null;
  units: ExamUnit[];
  materials: ExamMaterial[];
  sessions: ExamSessionSummary[];
  /** Ruta guardada (IA o automática). Ausente hasta aplicar la migración de la ruta. */
  route?: StoredRoute | null;
  route_source?: "ai" | "auto" | null;
  route_updated_at?: string | null;
  route_regenerated_on?: string | null;
  /** Asistente (migración 20261018170000): nota objetivo 0–10 en saltos de 0,5. */
  target_grade?: number | null;
  /** Paso del asistente en el que va el borrador. */
  wizard_step?: "upload" | "date" | "grade" | "identify" | null;
  /** Ya contestó «Continuar con estos» al aviso de pocos apuntes. */
  few_notes_ack?: boolean;
}
export interface ExamIndex extends ExamFields {
  id: string;
  status: DreamExam["status"];
  units: Pick<ExamUnit, "id" | "status">[];
  materials: { attachment_id: string }[];
}
export async function getExam(id: string, signal?: AbortSignal) {
  return (
    await callDream<{ exam: DreamExam }>("exam_get", { exam_id: id }, signal)
  ).exam;
}
export async function updateExam(
  action: DreamAction,
  id: string,
  payload: Record<string, unknown> = {},
) {
  return (
    await callDream<{ exam: DreamExam }>(action, { exam_id: id, ...payload })
  ).exam;
}
export async function getExamSession(
  examId: string,
  sessionId: string,
  signal?: AbortSignal,
) {
  return (
    await callDream<{ session: ExamSession }>(
      "exam_session_get",
      { exam_id: examId, session_id: sessionId },
      signal,
    )
  ).session;
}
export function preparation(exam: { units: Pick<ExamUnit, "status">[] }) {
  const completed = exam.units.filter((u) => u.status === "completed").length;
  const total = exam.units.length;
  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
  };
}
export function daysUntil(iso: string, now = new Date()) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    return null;
  const [year, month, day] = iso.split("-").map(Number);
  // Calendar days, unaffected by daylight saving or time of day.
  return Math.round(
    (Date.UTC(year, month - 1, day) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  );
}
export function examDateLabel(iso: string, short = false) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}
export function countdownLabel(iso: string) {
  const days = daysUntil(iso);
  return days === null
    ? "Sin fecha"
    : days < 0
      ? "Fecha pasada"
      : days === 0
        ? "Hoy"
        : days === 1
          ? "Mañana"
          : `${days} días`;
}
export function sessionPath(examId: string, sessionId: string) {
  return `/exams/${examId}/sessions/${sessionId}`;
}

// ---------------------------------------------------------------- Historial
// Pantalla Exámenes (PROMPT_EXAMEN_ESTILO.md §4). Lógica pura, probada en
// tests/exams.test.ts.

/** Pegatina de estado: color Y texto (nunca solo color). */
export const STATUS_STICKER: Record<
  DreamExam["status"],
  { label: string; tone: "yellow" | "purple" | "green" | "red" | "blue" }
> = {
  draft: { label: "Sin terminar", tone: "yellow" },
  preparing: { label: "Preparando", tone: "purple" },
  ready: { label: "Listo", tone: "green" },
  failed: { label: "Algo falló", tone: "red" },
  completed: { label: "Hecho", tone: "blue" },
};

/** «Faltan 12 días», «Es mañana», «Pasó hace 3 días»… */
export function countdownText(iso: string | null | undefined, now = new Date()) {
  const days = iso ? daysUntil(iso, now) : null;
  if (days === null) return "Sin fecha";
  if (days === 0) return "Es hoy";
  if (days === 1) return "Es mañana";
  if (days === -1) return "Fue ayer";
  if (days < 0) return `Pasó hace ${-days} días`;
  return `Faltan ${days} días`;
}

/**
 * Próximos (por fecha, los sin fecha al final) y Anteriores (fecha pasada o
 * hechos, el más reciente primero).
 */
export function groupExams<T extends { status: string; exam_date: string | null }>(
  items: T[],
  now = new Date(),
) {
  const days = (e: T) => (e.exam_date ? daysUntil(e.exam_date, now) : null);
  const past = (e: T) => {
    const d = days(e);
    return e.status === "completed" || (d !== null && d < 0);
  };
  const upcoming = items
    .filter((e) => !past(e))
    .sort((a, b) => (days(a) ?? 1e6) - (days(b) ?? 1e6));
  const previous = items
    .filter(past)
    .sort((a, b) => (days(b) ?? -1e6) - (days(a) ?? -1e6));
  return { upcoming, previous };
}

/** Nombre visible de un examen: los borradores aún no tienen. */
export function examTitle(exam: { title: string }) {
  return exam.title.trim() || "Examen sin nombre";
}
