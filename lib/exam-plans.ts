import { callDream, type DreamAction } from "./dream-api";
import type { AnswerValue, TestResult } from "./types";
export interface ExamUnit {
  id: string;
  position: number;
  title: string;
  topic: string;
  summary: string;
  estimated_minutes: number;
  status: "pending" | "in_progress" | "completed";
  conversation_id: string | null;
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
}
export interface ExamSession extends ExamSessionSummary {
  test_id: string | null;
  generation_error?: string | null;
  exam_id: string;
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
