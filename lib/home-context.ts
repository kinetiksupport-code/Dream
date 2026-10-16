/**
 * Greeting and study context of Inicio (/chat with no conversation).
 *
 * Everything here is computed from the clock and the exam plan the student
 * already has (`exams` / `exam_get`). It never calls the AI.
 */
import { daysUntil, type DreamExam, type ExamIndex } from "./exam-plans";

/** «Buenos días» before 13:00, «Buenas tardes» before 20:00, else «Buenas noches». */
export function greetingFor(now: Date, name = "") {
  const hour = now.getHours();
  const salute =
    hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? `${salute}, ${first}` : salute;
}

/** Nearest exam that is not completed and whose date is today or later. */
export function upcomingExam<
  T extends Pick<ExamIndex, "status" | "exam_date">,
>(exams: readonly T[], now = new Date()): T | null {
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

export interface HomeContext {
  /** Calendar days to the exam (0 = today). */
  days: number;
  subject: string;
  /** First unit of the plan that is not completed, if any. */
  unit: string | null;
}

/** Context of the nearest exam, or null when there is nothing to say. */
export function homeContext(
  exam: Pick<DreamExam, "subject" | "exam_date" | "status"> & {
    units?: Pick<DreamExam["units"][number], "title" | "position" | "status">[];
  },
  now = new Date(),
): HomeContext | null {
  if (exam.status === "completed") return null;
  const days = daysUntil(exam.exam_date, now);
  if (days === null || days < 0) return null;
  const unit =
    [...(exam.units ?? [])]
      .sort((a, b) => a.position - b.position)
      .find((u) => u.status !== "completed" && u.title?.trim())
      ?.title.trim() ?? null;
  return { days, subject: exam.subject?.trim() ?? "", unit };
}

/** What the suggested prompts talk about: today's unit, else the subject. */
export function homeTopic(context: HomeContext | null) {
  return context?.unit || context?.subject || "";
}

/**
 * Text the suggestion chips put in the box. Never sent on their own.
 * Practice asks for hints, not the solution (Dream never solves the exercise).
 */
export function suggestionPrompt(kind: "practice" | "test", topic = "") {
  const t = topic.trim();
  if (kind === "practice")
    return t
      ? `Quiero practicar ejercicios de ${t}. Dame pistas, no la solución.`
      : "Quiero practicar ejercicios de ";
  return t
    ? `Hazme un test de 5 preguntas sobre ${t}.`
    : "Hazme un test de 5 preguntas sobre ";
}
