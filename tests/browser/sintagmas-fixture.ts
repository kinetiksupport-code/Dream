import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  acceptSentence,
  compareAnalysis,
  hintFor,
  nextPhase,
  sanitizeMarks,
  spanFeedback,
} from "../../supabase/functions/dream-api/sintagmas.mjs";
import { mock } from "./design-fixture";

// Contrato de las acciones syntax_* (supabase/functions/dream-api/syntax.ts)
// con la corrección real de sintagmas.mjs y las frases de evals/sintagmas.json.
// Solo para pruebas y capturas.
type Sentence = NonNullable<ReturnType<typeof acceptSentence>>;
const evals = JSON.parse(readFileSync("evals/sintagmas.json", "utf8")) as {
  sentences: { id: number; text: string; analysis: unknown }[];
};
export const SENTENCES = Object.fromEntries(
  evals.sentences.map((s) => [s.id, acceptSentence({ text: s.text, analysis: s.analysis })!]),
) as Record<number, Sentence>;
export const sentenceId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export interface SyntaxMockOptions {
  /** Ids de evals/sintagmas.json, en orden (se repiten si se acaban). */
  order?: number[];
  phase?: "options" | "write";
  source?: "standard" | "notes";
  names?: Record<string, string>;
  tutorialHidden?: boolean;
  /** Error de syntax_state (backend sin desplegar). */
  unavailable?: boolean;
  explanation?: string;
}

export async function mockSyntax(page: Page, opts: SyntaxMockOptions = {}) {
  await mock(page);
  const calls: Record<string, unknown>[] = [];
  const order = opts.order ?? [1, 2, 3, 5, 8];
  let served = 0;
  let state = {
    conventions: { names: opts.names ?? {}, source: opts.source ?? "notes" },
    phase: opts.phase ?? "options",
    level: 1,
    tutorial_hidden: opts.tutorialHidden ?? false,
  };
  const scores: number[] = [];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const action = String(body?.action ?? "");
    if (!action.startsWith("syntax_") && action !== "attachment_upload") return route.fallback();
    calls.push(body);
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (opts.unavailable) return reply({ error: "Acción no válida." }, 400);
    if (action === "syntax_state") return reply({ state });
    if (action === "syntax_settings") {
      state = { ...state, tutorial_hidden: Boolean(body.tutorial_hidden) };
      return reply({ state });
    }
    if (action === "attachment_upload")
      return reply({ attachment: { id: "99999999-9999-4999-8999-999999999999", file_name: body.file_name, status: "processed" } });
    if (action === "syntax_conventions") {
      state = { ...state, conventions: { names: { SN: "GN" }, source: "notes" } };
      return reply({ state, found: true, sentences: 2 });
    }
    if (action === "syntax_next") {
      const n = order[served++ % order.length];
      return reply({ sentence: { id: sentenceId(n), words: SENTENCES[n].words }, retry: false, ...state });
    }
    const n = Number(String(body.sentence_id).slice(-12));
    const sentence = SENTENCES[n];
    const marks = sanitizeMarks(body.marks, sentence.words.length, state.conventions.names)!;
    if (action === "syntax_hint")
      return reply({ hint: hintFor(sentence.analysis, marks, body.level === 2 ? 2 : 1, state.conventions.names) });
    const result = compareAnalysis(sentence.analysis, marks);
    scores.push(result.score);
    const phase = nextPhase(state.phase, scores) as "options" | "write";
    const change = phase !== state.phase ? phase : null;
    if (change) scores.length = 0;
    state = { ...state, phase };
    return reply({
      check: {
        spans: result.spans.map((s) => ({ ...s, feedback: spanFeedback(s, sentence.words, state.conventions.names) })),
        extra: result.extra,
        correct: result.correct,
        total: result.total,
        score: result.score,
        perfect: result.perfect,
        alternative: false,
        explanation: result.perfect ? "" : (opts.explanation ?? "Fíjate en la preposición: va siempre con su término."),
        labels: result.byLabel,
      },
      phase,
      phase_change: change,
      level: 1,
      level_change: null,
    });
  });
  return calls;
}
