import type { ConsentProfile } from "./consent";
export interface DreamProfile extends ConsentProfile {
  email: string;
  display_name: string | null;
}
export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  files?: string[];
  stopped?: boolean;
}
export type DreamState =
  | "idle"
  | "thinking"
  | "searching"
  | "composing"
  | "shaping"
  | "listening"
  | "done"
  | "error";
export interface Attachment {
  localId: string;
  id?: string;
  file: File;
  preview?: string;
  status: "uploading" | "processing" | "ready" | "error";
  error?: string;
  queued?: boolean;
}
export interface StreamDelta {
  type: "delta";
  text: string;
}
export interface StreamActivity {
  type: "activity";
  activity: string;
}
export type DreamStreamEvent =
  | StreamDelta
  | StreamActivity
  | { type: "complete" }
  | { type: "error"; message: string; code?: string; retry_after?: number };
export interface QuizWidget {
  type: "quiz";
  testId: string;
  title: string;
  subject?: string;
  topic?: string;
  questionCount?: number;
  mode?: "practice" | "exam";
}
export type AnswerValue = string | string[] | Record<string, string>;
export interface DreamQuestion {
  id: string;
  position: number;
  type:
    | "multiple_choice"
    | "multiple_select"
    | "true_false"
    | "short_answer"
    | "numeric"
    | "fill_blank"
    | "matching"
    | "math";
  prompt: string;
  options: string[];
  metadata?: { left?: string[]; right?: string[] };
}
export interface DreamTest {
  id: string;
  title: string;
  subject: string;
  topic: string;
  status: string;
  mode: "practice" | "exam";
  difficulty: string;
  questions: DreamQuestion[];
}
export interface Evaluation {
  is_correct: boolean;
  feedback: string;
  correct_answer: AnswerValue;
}
export interface TestResult {
  attempt_id: string;
  score: number;
  total: number;
  percentage: number;
  mastered: string[];
  practice: string[];
  items: (Evaluation & {
    question_id: string;
    prompt: string;
    answer: AnswerValue;
  })[];
}
