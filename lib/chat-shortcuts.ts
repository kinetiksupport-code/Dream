/**
 * Chat shortcuts and the "topic of the day" greeting of /chat.
 *
 * Shortcuts are sent in the existing `chat` action as an optional `shortcut`
 * id (closed list, validated by dream-api). The visible message is always the
 * button text. The greeting is computed here from the exam plan; it never
 * calls the AI.
 */
import { daysUntil, type DreamExam, type ExamIndex } from "./exam-plans";

/** Must match CHAT_SHORTCUTS in supabase/functions/dream-api/validation.ts. */
export const CHAT_SHORTCUT_IDS = [
  "explain",
  "review_last",
  "weak_points",
  "study_style",
  "exam_date",
  "teach",
  "eli5",
  "key_concepts",
  "connect",
  "test_understanding",
] as const;
export type ChatShortcutId = (typeof CHAT_SHORTCUT_IDS)[number];

export interface ChatShortcut {
  id: ChatShortcutId;
  label: string;
}

export const MAIN_SHORTCUTS: readonly ChatShortcut[] = [
  { id: "explain", label: "Explícame algo que no entiendo" },
  { id: "review_last", label: "Repasa mi último test o lección" },
  { id: "weak_points", label: "Encuentra mis puntos débiles" },
  { id: "study_style", label: "Cambiar cómo estudio" },
  { id: "exam_date", label: "La fecha de mi examen ha cambiado" },
];

export const MODE_SHORTCUTS: readonly ChatShortcut[] = [
  { id: "teach", label: "Enséñame" },
  { id: "eli5", label: "Explícamelo como si tuviera 5 años" },
  { id: "key_concepts", label: "Destaca los conceptos clave" },
  { id: "connect", label: "Relaciona los conceptos" },
  { id: "weak_points", label: "Detecta mis puntos débiles" },
  { id: "test_understanding", label: "Pon a prueba si lo entiendo de verdad" },
];

const MAX_PROMPT = 12000;

/** Visible message: the button text, plus the draft or detail if there is one. */
export function shortcutPrompt(label: string, detail = "") {
  const extra = detail.trim().slice(0, MAX_PROMPT - label.length - 2);
  return extra ? `${label}: ${extra}` : label;
}

/** Nearest exam that is not completed and whose date is today or later. */
export function upcomingExam<T extends Pick<ExamIndex, "status" | "exam_date">>(
  exams: readonly T[],
  now = new Date(),
): T | null {
  let best: T | null = null;
  let bestDays = Infinity;
  for (const exam of exams) {
    if (exam.status === "completed") continue;
    const days = daysUntil(exam.exam_date, now);
    if (days !== null && days >= 0 && days < bestDays) {
      best = exam;
      bestDays = days;
    }
  }
  return best;
}

export type TodayFocus =
  | { kind: "exam"; subject: string }
  | { kind: "unit"; title: string; examId: string; unitId: string };

/** Exam today → the exam; otherwise the next unit of the plan, if any. */
export function todayFocus(
  exam: Pick<DreamExam, "id" | "subject" | "exam_date" | "status" | "units">,
  now = new Date(),
): TodayFocus | null {
  if (exam.status === "completed") return null;
  const days = daysUntil(exam.exam_date, now);
  if (days === null || days < 0) return null;
  if (days === 0) return { kind: "exam", subject: exam.subject };
  const unit = [...exam.units]
    .sort((a, b) => a.position - b.position)
    .find((u) => u.status !== "completed");
  return unit
    ? { kind: "unit", title: unit.title, examId: exam.id, unitId: unit.id }
    : null;
}

export const NEUTRAL_GREETING = "¿Qué quieres entender hoy?";

export function greeting(focus: TodayFocus | null) {
  if (!focus) return NEUTRAL_GREETING;
  return focus.kind === "exam"
    ? `Hoy es tu examen de ${focus.subject}. ¿Qué quieres repasar?`
    : `Hoy toca ${focus.title}. ¿Qué quieres repasar?`;
}

/** Most recent completed lesson or practice test of the exam, if known. */
export function lastStudied(
  exam: Pick<DreamExam, "title" | "units" | "sessions">,
): string | null {
  const done = [
    ...exam.units
      .filter((u) => u.status === "completed")
      .map((u) => ({ title: u.title, at: u.completed_at })),
    ...exam.sessions
      .filter((s) => s.status === "completed")
      .map((s) => ({
        title: `${s.mode === "exam" ? "simulacro" : "práctica"} de ${exam.title}`,
        at: s.submitted_at,
      })),
  ]
    .map((d) => ({ title: d.title, at: d.at ? Date.parse(d.at) : NaN }))
    .filter((d) => Number.isFinite(d.at))
    .sort((a, b) => b.at - a.at);
  return done[0]?.title ?? null;
}

/** Plans in draft or failed can still change their date in the wizard. */
export function editableExamPath(exam: Pick<ExamIndex, "id" | "status">) {
  return exam.status === "draft" || exam.status === "failed"
    ? `/exams/new?id=${exam.id}`
    : null;
}
