// Llamadas de la ruta de estudio a dream-api (Entregas 1-3). El servidor
// corrige y programa; aquí solo se pide y se pinta.
import { callDream } from "./dream-api";

export interface LessonSection {
  title: string;
  body_markdown: string;
  why_it_matters: string | null;
  check: { statement: string };
}
export interface LessonProgress {
  reading_section: number;
  reading_done_at: string | null;
  quiz_best_pct: number | null;
  mastered_at: string | null;
}
export type LessonState =
  | { status: "ready"; reading: { sections: LessonSection[]; sources: string[] }; progress: LessonProgress | null }
  | { status: "generating" }
  | { status: "limit"; used: number; cap: number }
  | { status: "failed"; message: string };
export interface QuizQuestion {
  index: number;
  type: "mcq" | "tf" | "written";
  prompt: string;
  options?: string[];
}
export interface QuizCheck {
  correct: boolean;
  correct_answer: string | boolean;
  explanation: string;
  rubric?: string[];
}
export interface QuizResult {
  right: number;
  total: number;
  pct: number;
  mastered: boolean;
  completed: boolean;
  mistake_cards: number;
}
export type Difficulty = "facil" | "medio" | "dificil";
type Ids = { exam_id: string; unit_id: string };

export const getLesson = (ids: Ids, difficulty?: Difficulty) =>
  callDream<LessonState>("unit_content_get", { ...ids, ...(difficulty ? { difficulty } : {}) });
export const saveProgress = (
  ids: Ids,
  patch: { reading_section?: number; felt_difficulty?: "facil" | "bien" | "dificil"; check?: { section: number; answer: boolean } },
) => callDream<{ ok: true; check: { correct: boolean; is_true: boolean; explanation: string } | null }>("unit_progress_save", { ...ids, ...patch });
export const getQuiz = (ids: Ids, round = 0) => callDream<{ questions: QuizQuestion[] }>("unit_quiz_get", { ...ids, round });
export const getPretest = (ids: Ids) => callDream<{ questions: QuizQuestion[] }>("unit_quiz_get", { ...ids, pretest: true });
export const answerQuiz = (ids: Ids, index: number, answer: string | boolean) =>
  callDream<QuizCheck>("unit_quiz_answer", { ...ids, index, answer });
export const finishQuiz = (ids: Ids, answers: Record<number, string | boolean>, known = false) =>
  callDream<QuizResult>("unit_quiz_finish", { ...ids, answers, ...(known ? { known: true } : {}) });
/** Repaso de hoy y meta diaria suave (Bloque 6.1 y 6.7): solo contadores. */
export interface StudyToday {
  due: number;
  minutes: number;
  reviewed_today: number;
  lessons_today: number;
  goal: { lessons: number; cards: number };
}
export const studyToday = () => callDream<StudyToday>("study_today", {});

// ── Tarjetas (Bloque 4) ──
export interface DueCard {
  id: string;
  exam_id: string;
  unit_id: string | null;
  front: string;
  back: string;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}
export interface OwnCard {
  id: string;
  unit_id: string | null;
  front: string;
  back: string;
  origin: "ai" | "mistake" | "own" | "import";
  due: string;
  suspended: boolean;
}
export type Rating = 1 | 2 | 3 | 4;
export const cardsDue = (limit = 60) => callDream<{ cards: DueCard[]; total: number }>("cards_due", { limit });
export const cardsList = (examId: string) => callDream<{ cards: OwnCard[] }>("cards_list", { exam_id: examId });
export const cardCreate = (examId: string, front: string, back: string) =>
  callDream<{ created: number }>("card_create", { exam_id: examId, front, back });
export const cardUpdate = (cardId: string, front: string, back: string) =>
  callDream<{ card: { id: string; front: string; back: string } }>("card_update", { card_id: cardId, front, back });
export const cardDelete = (cardId: string) => callDream<{ ok: true }>("card_delete", { card_id: cardId });
export const cardReport = (cardId: string) => callDream<{ ok: true }>("card_report", { card_id: cardId });
export const cardsImport = (examId: string, rows: { front: string; back: string }[]) =>
  callDream<{ created: number }>("cards_import", { exam_id: examId, rows });

// Repasos sin conexión: solo se guardan ids, la nota y la hora (nunca el
// texto de la tarjeta), con un review_id único para que el servidor no los
// cuente dos veces. Se envían al volver la conexión.
export interface PendingReview {
  review_id: string;
  card_id: string;
  rating: Rating;
  reviewed_at: string;
}
const QUEUE = "dream.card-reviews.v1";
export function readQueue(): PendingReview[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((r): r is PendingReview => !!r && typeof r === "object" && typeof (r as PendingReview).review_id === "string")
      : [];
  } catch {
    return [];
  }
}
function writeQueue(q: PendingReview[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(q.slice(-500)));
  } catch {
    /* sin almacenamiento: se intentará enviar en el momento */
  }
}
export function enqueueReview(r: PendingReview) {
  writeQueue([...readQueue().filter((x) => x.review_id !== r.review_id), r]);
}
/** Envía la cola en orden, de una en una (nunca dos envíos a la vez).
 *  Devuelve cuántos quedan pendientes. */
let flushing: Promise<number> | null = null;
export function flushReviews(): Promise<number> {
  flushing ??= (async () => {
    // Lo que se puntúa mientras se envía también sale en esta misma tanda.
    let last = "";
    for (;;) {
      const next = readQueue()[0];
      if (!next) return 0;
      // Si no se pudo borrar de la cola (almacenamiento lleno), no se repite.
      if (next.review_id === last) return readQueue().length;
      last = next.review_id;
      try {
        await callDream("card_review", { ...next });
      } catch (e) {
        // Un 4xx (tarjeta borrada, nota no válida) no se reintenta; un fallo de red, sí.
        const status = (e as { status?: number }).status;
        if (!(status && status >= 400 && status < 500)) return readQueue().length;
      }
      // Se relee la cola para no pisar lo que se añadió durante el envío.
      writeQueue(readQueue().filter((x) => x.review_id !== next.review_id));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ── Simulacro (Bloque 5) ──
export type MockKind = "diagnostic" | "block" | "final";
export interface MockPlan {
  kind: MockKind;
  count: number;
  minutes: number | null;
  timer: "none" | "optional" | "required";
  mix: { mcq: number; tf: number; written: number };
}
export interface Blueprint {
  enough_material: boolean;
  based_on: string;
  previous_exams: number;
  topics: { name: string; weight: number }[];
  candidates: { topic: string; type: string; hint: string; reason: string }[];
}
export interface MockQuestion {
  id: string;
  position: number;
  type: "mcq" | "tf" | "written";
  prompt: string;
  options: string[];
  topic: string;
}
export interface MockSession {
  id: string;
  kind: MockKind;
  status: "generating" | "failed" | "active" | "grading" | "completed";
  answers: Record<string, string>;
  question_index: number;
  revision: number;
  remaining_seconds: number | null;
  time_limit_seconds: number | null;
  estimated_grade: number | null;
}
export interface MockReviewItem extends MockQuestion {
  answer: string | null;
  correct_answer: string;
  reason: string;
  rubric: string[];
  score: number;
  points: number;
  annulled: boolean;
  disputes: number;
  criteria: { criterion: string; met: boolean }[] | null;
  feedback: string;
  improved: string;
  cause: string | null;
  cause_confirmed: boolean;
  solution: string;
  dispute: { accepted: boolean; message: string } | null;
}
export type MockState =
  | { session: MockSession; questions: MockQuestion[] }
  | { session: MockSession; review: MockReviewItem[]; target_grade: number | null; starting_point: { known: string[]; start: string[] } | null };

export const mockPreview = (examId: string, kind: MockKind) =>
  callDream<{ plan: MockPlan; blueprint: Blueprint | null; quota: { ok: boolean; used: number; cap: number; unlimited: boolean }; target_grade: number | null }>(
    "mock_preview",
    { exam_id: examId, kind },
  );
export const mockCreate = (examId: string, sessionId: string, kind: MockKind, timed: boolean) =>
  callDream<{ session: { id: string } }>("mock_create", { exam_id: examId, session_id: sessionId, kind, timed });
export const mockGet = (examId: string, sessionId: string) => callDream<MockState>("mock_get", { exam_id: examId, session_id: sessionId });
export const mockSave = (examId: string, sessionId: string, answers: Record<string, string>, questionIndex: number, revision: number) =>
  callDream<{ session: { revision: number } }>("exam_session_save", {
    exam_id: examId,
    session_id: sessionId,
    answers,
    question_index: questionIndex,
    revision,
  });
export const mockSubmit = (examId: string, sessionId: string) => callDream<{ ok: true }>("mock_submit", { exam_id: examId, session_id: sessionId });
export const mockDispute = (examId: string, sessionId: string, questionId: string, argument: string) =>
  callDream<{ accepted: boolean; message: string; score: number; annulled: boolean; estimated_grade: number; disputes_left: number }>("mock_dispute", {
    exam_id: examId,
    session_id: sessionId,
    question_id: questionId,
    argument,
  });
export const mockCause = (examId: string, sessionId: string, questionId: string, cause: string) =>
  callDream<{ ok: true }>("mock_cause", { exam_id: examId, session_id: sessionId, question_id: questionId, cause });
