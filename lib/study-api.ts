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
