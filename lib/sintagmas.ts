// Actividad de sintagmas en la web (prompt «sintagmas»). La lógica de
// etiquetas y reglas es la misma que usa dream-api (sintagmas.mjs).
import { callDream } from "./dream-api";
import {
  crosses,
  isPhrase,
  treeFromMarks,
} from "../supabase/functions/dream-api/sintagmas.mjs";

export type SyntaxLabel = "SN" | "SV" | "SAdj" | "SAdv" | "SPrep" | "Det" | "N" | "E";
export type SyntaxNames = Partial<Record<SyntaxLabel, string>>;
export type SyntaxPhase = "options" | "write";
/** Raya en la pantalla. Sin etiqueta se ve en gris hasta que se etiqueta. */
export interface Mark {
  id: string;
  start: number;
  end: number;
  label: SyntaxLabel | null;
}
export interface SyntaxState {
  conventions: { names: SyntaxNames; source: "standard" | "notes" };
  phase: SyntaxPhase;
  level: number;
  tutorial_hidden: boolean;
}
export interface SyntaxSentence {
  id: string;
  words: string[];
}
export type SpanStatus = "correct" | "wrong_label" | "missing";
export interface CheckSpan {
  label: SyntaxLabel;
  start: number;
  end: number;
  status: SpanStatus;
  given?: SyntaxLabel;
  feedback: string;
}
export type LabelStats = Partial<Record<SyntaxLabel, { ok: number; total: number }>>;
export interface SyntaxCheck {
  spans: CheckSpan[];
  extra: { label: SyntaxLabel; start: number; end: number }[];
  correct: number;
  total: number;
  score: number;
  perfect: boolean;
  alternative: boolean;
  explanation: string;
  labels: LabelStats;
}
export interface SyntaxCheckResponse {
  check: SyntaxCheck;
  phase: SyntaxPhase;
  phase_change: SyntaxPhase | null;
  level: number;
  level_change: number | null;
}
export interface SyntaxHint {
  text: string;
  start: number | null;
  end: number | null;
}

/** Frases por sesión antes del resumen. */
export const SESSION_LENGTH = 8;
/** Solo ordenador (decisión de Carlos, 20/10/2026): pantalla ancha y ratón. */
export const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)";
export const DESKTOP_ONLY_MESSAGE = "Esta experiencia solo se puede usar en un ordenador";
/** Respaldo local de «No volverme a mostrar este tutorial» (no es contenido personal). */
export const TUTORIAL_KEY = "dream:sintagmas:tutorial-oculto";

export const syntaxState = (signal?: AbortSignal) =>
  callDream<{ state: SyntaxState }>("syntax_state", {}, signal);
export const syntaxSettings = (tutorialHidden: boolean) =>
  callDream<{ state: SyntaxState }>("syntax_settings", { tutorial_hidden: tutorialHidden });
export const syntaxConventions = (conversationId: string, attachmentIds: string[]) =>
  callDream<{ state: SyntaxState; found: boolean; sentences: number }>("syntax_conventions", {
    conversation_id: conversationId,
    attachment_ids: attachmentIds,
  });
export const syntaxNext = (signal?: AbortSignal) =>
  callDream<{ sentence: SyntaxSentence; retry: boolean } & SyntaxState>("syntax_next", {}, signal);
const wire = (marks: Mark[]) =>
  marks.filter((m) => m.label).map(({ start, end, label }) => ({ start, end, label }));
export const syntaxCheck = (sentenceId: string, marks: Mark[], hints: number) =>
  callDream<SyntaxCheckResponse>("syntax_check", { sentence_id: sentenceId, marks: wire(marks), hints });
export const syntaxHint = (sentenceId: string, marks: Mark[], level: 1 | 2) =>
  callDream<{ hint: SyntaxHint }>("syntax_hint", { sentence_id: sentenceId, marks: wire(marks), level });

/** Lee el respaldo local sin romper si el navegador lo bloquea. */
export function readTutorialHidden(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}
export function writeTutorialHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(TUTORIAL_KEY, "1");
    else window.localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    // Sin almacenamiento local: vale lo guardado en la cuenta.
  }
}

/** Una raya nueva cruzaría alguna de las que hay. */
export function wouldCross(marks: Mark[], span: { start: number; end: number }, ignore?: string) {
  return marks.some((m) => m.id !== ignore && crosses(m, span));
}

/**
 * Fila de cada raya debajo de las palabras: 0 la más externa. Con el mismo
 * tramo, el sintagma va encima de su parte. Una raya sin etiqueta cuenta
 * como sintagma (puede tener otras dentro).
 */
export function markRows(marks: Mark[]): Map<string, number> {
  const rows = new Map<string, number>();
  const labelled = marks.map((m) => ({ ...m, label: m.label ?? ("SN" as const) }));
  const walk = (nodes: ReturnType<typeof treeFromMarks>, depth: number) => {
    for (const node of nodes) {
      const match = labelled.find(
        (m) => !rows.has(m.id) && m.start === node.start && m.end === node.end && m.label === node.label,
      );
      if (match) rows.set(match.id, depth);
      if (node.children) walk(node.children, depth + 1);
    }
  };
  walk(treeFromMarks(labelled), 0);
  return rows;
}

/** Palabras que aún no están en ningún sintagma (para la Pista). */
export function uncovered(wordCount: number, marks: Mark[]) {
  const covered = new Set<number>();
  for (const m of marks) if (m.label && isPhrase(m.label)) for (let i = m.start; i < m.end; i++) covered.add(i);
  return Array.from({ length: wordCount }, (_, i) => i).filter((i) => !covered.has(i));
}

/** Historial para deshacer y rehacer (Ctrl/Cmd+Z). */
export interface History {
  past: Mark[][];
  present: Mark[];
  future: Mark[][];
}
export const emptyHistory = (): History => ({ past: [], present: [], future: [] });
export function commit(h: History, next: Mark[]): History {
  return { past: [...h.past, h.present].slice(-100), present: next, future: [] };
}
export function undo(h: History): History {
  const previous = h.past.at(-1);
  return previous ? { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] } : h;
}
export function redo(h: History): History {
  const next = h.future[0];
  return next ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) } : h;
}

/** Texto del mensaje al cambiar de fase: positivo y breve. */
export function phaseMessage(phase: SyntaxPhase) {
  return phase === "write"
    ? "¡Lo dominas! Ahora escribe tú las etiquetas."
    : "Volvemos a las opciones un rato para afianzar.";
}
