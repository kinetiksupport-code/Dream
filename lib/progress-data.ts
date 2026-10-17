/**
 * Data for Progreso, read only through existing dream-api actions:
 * `exams` (index), `exam_get` (units with completion dates, session list) and
 * `exam_session_get` (graded result of each completed session).
 *
 * TODO(backend): dream-api has no aggregated progress action, so this makes
 * one `exam_session_get` per completed session (up to MAX_RESULTS). A single
 * `exam_progress` action would replace these calls; see the PR description.
 */
import { callDream } from "./dream-api";
import {
  getExam,
  getExamSession,
  type DreamExam,
  type ExamIndex,
} from "./exam-plans";
import {
  completedSessionIds,
  toPracticeResult,
  type PracticeResult,
} from "./progress";

const MAX_RESULTS = 12;

export async function listProgressExams(signal?: AbortSignal) {
  const data = await callDream<{ exams?: ExamIndex[] }>("exams", {}, signal);
  return Array.isArray(data?.exams) ? data.exams : [];
}

export interface ExamProgressData {
  exam: DreamExam;
  results: PracticeResult[];
  /** Completed sessions whose result could not be loaded. */
  failed: number;
}

export async function loadExamProgress(
  examId: string,
  signal?: AbortSignal,
): Promise<ExamProgressData> {
  const exam = await getExam(examId, signal);
  const ids = completedSessionIds(exam, MAX_RESULTS);
  const settled = await Promise.allSettled(
    ids.map((id) => getExamSession(examId, id, signal)),
  );
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const results: PracticeResult[] = [];
  let failed = 0;
  for (const outcome of settled) {
    const result =
      outcome.status === "fulfilled" ? toPracticeResult(outcome.value) : null;
    if (result) results.push(result);
    else failed++;
  }
  return { exam, results, failed };
}
