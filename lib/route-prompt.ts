// Cuándo sale el pop-up de la ruta (prompt de la ruta, 0.13). Solo se guarda
// qué examen lo vio y cuándo (id y fecha), en este navegador. Puro, con pruebas.
import type { DreamExam } from "./exam-plans";

export const ROUTE_PROMPT_KEY = "dream.route-prompt.v1";
export const ROUTE_PROMPT_SESSION_KEY = "dream.route-prompt.session";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const MAX_SHOWS = 2;

export type Seen = Record<string, { n: number; at: number; off?: number }>;
export function readSeen(): Seen | null {
  try {
    const raw = localStorage.getItem(ROUTE_PROMPT_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Seen) : {};
  } catch {
    return null;
  }
}
export function writeSeen(v: Seen) {
  try {
    localStorage.setItem(ROUTE_PROMPT_KEY, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** ¿Toca enseñarlo? Puro, para las pruebas. */
export function shouldPrompt(
  exam: Pick<DreamExam, "id" | "status" | "route" | "exam_date" | "materials">,
  seen: Seen | null,
  now: number,
  { flags, sessionShown }: { flags: boolean; sessionShown: boolean },
) {
  if (!flags || sessionShown || !seen) return false;
  if (exam.status !== "ready" || exam.route || !exam.exam_date || !exam.materials?.length) return false;
  const mine = seen[exam.id];
  if (!mine) return true;
  if (mine.n >= MAX_SHOWS) return false;
  // Ya lo vio una vez: solo vuelve si lo cerró hace más de 7 días.
  return typeof mine.off === "number" && now - mine.off >= WEEK_MS;
}

