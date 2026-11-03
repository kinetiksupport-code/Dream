// Orden del test de la lección (prompt de la ruta, 0.11 · 4): las V/F de las
// tarjetas «Qué saber» y las preguntas del banco, mezcladas. Puro, con pruebas.
import type { QuizQuestion } from "./study-api";

/** Lo que sale en el test: las V/F de las tarjetas y las preguntas del banco, mezcladas (0.11 · 4). */
export type Item = { kind: "check"; section: number } | { kind: "quiz"; q: QuizQuestion; retry: boolean };
/** Reparte las V/F de las tarjetas entre las preguntas del test, sin juntarlas al principio. */
export function mixItems(sections: number, questions: QuizQuestion[]): Item[] {
  const out: Item[] = questions.map((q) => ({ kind: "quiz", q, retry: false }));
  for (let i = sections - 1; i >= 0; i--) {
    const at = Math.round(((i + 1) * out.length) / (sections + 1));
    out.splice(Math.min(at, out.length), 0, { kind: "check", section: i });
  }
  return out;
}
