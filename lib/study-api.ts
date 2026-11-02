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
export const finishQuiz = (ids: Ids, answers: Record<number, string | boolean>) =>
  callDream<QuizResult>("unit_quiz_finish", { ...ids, answers });

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
