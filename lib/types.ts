import type { StudyProfile } from "./onboarding";
import type { ConsentProfile } from "./consent";
export interface DreamProfile extends ConsentProfile {
  email: string;
  display_name: string | null;
  /** Curso (lista cerrada de lib/onboarding.ts › STUDY.level). */
  academic_level?: string | null;
  /** «Cómo estudias» (P4): solo si dream-api lo envía (con su migración). */
  study_profile?: StudyProfile;
  /** Solo lo envía dream-api a la cuenta administradora. Ocultar el enlace no es la seguridad. */
  admin_panel?: { path: string };
  /** Present only while the account is banned: Dream then shows only the ban screen. */
  ban?: { until: string | null; permanent: boolean; rule: string | null };
  /** Cuentas de Fundación Loyola: mensaje de Dream que se enseña una vez. */
  special_welcome?: string | null;
  /** dream-api has the memory switched on (features.mjs). */
  memory_feature?: boolean;
  memory_import_feature?: boolean;
  memory_enabled?: boolean;
  /** Recuerdos nuevos aún no vistos («Dream ha recordado 2 cosas · Ver»). */
  memory_new?: number;
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
  | "waiting"
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
  | {
      type: "error";
      message: string;
      code?: string;
      retry_after?: number;
      position?: number;
      /** The server undid the saved turn, so the same message can be retried. */
      reverted?: boolean;
    };
/** A web page the AI read to answer («Buscado en la web»). */
export interface WebSource {
  title: string;
  url: string;
}
/** Tarjeta «Dreams» de un esquema (docs/ESQUEMAS.md). */
export interface SchemeWidget {
  type: "scheme";
  schemeId: string;
  title: string;
  subject?: string;
  sections?: number;
}
/** Tarjeta «Dreams» de un juego interactivo (docs/ESQUEMAS.md, Bloque 7). */
export interface GameWidget {
  type: "game";
  gameId: string;
  title: string;
  kind: "classify" | "match";
  count?: number;
}
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
  /** Conversación del test, para el panel «¿Por qué?». */
  conversation_id?: string | null;
  questions: DreamQuestion[];
}
export interface Evaluation {
  is_correct: boolean;
  feedback: string;
  correct_answer: AnswerValue;
  /** Por qué no vale la opción que eligió (tipo test y V/F, solo al fallar). */
  why_wrong?: string;
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
