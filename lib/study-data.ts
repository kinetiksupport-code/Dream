/**
 * Data adapters for the "Tareas" and "Apuntes" screens.
 *
 * dream-api has no dedicated tasks or notes endpoints yet. Both screens are
 * built on data that already exists (exam study units and exam materials,
 * i.e. the user's uploaded attachments) and only read through lib/dream-api.ts.
 *
 * TODO(backend): when dream-api exposes `tasks` / `notes` actions, implement
 * `tasksSource` / `notesSource` against them and keep the typed shapes below.
 * The UI only depends on `StudyTask`, `StudyNote` and the `*Source` objects.
 */
import { callDream } from "./dream-api";
import type { DreamExam, ExamIndex } from "./exam-plans";

export interface StudyTask {
  id: string;
  title: string;
  /** "Matemáticas · Examen el 12 nov." */
  context: string;
  status: "pending" | "done";
  /** Where "Resolver con Dream" takes the student. */
  href: string | null;
}

export interface StudyNote {
  id: string;
  title: string;
  kind: string;
  subject: string;
  status: "ready" | "processing" | "failed";
  examId: string;
}

export interface CollectionSource<T> {
  list: (signal?: AbortSignal) => Promise<T[]>;
  /** False until an endpoint exists to create items from this screen. */
  canCreate: boolean;
}

const MAX_EXAMS = 8;

function formatDay(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

/** Exam study units → tasks (pending first, then done). */
export function examsToTasks(exams: DreamExam[]): StudyTask[] {
  const tasks: StudyTask[] = [];
  for (const exam of exams) {
    const day = exam.exam_date ? formatDay(exam.exam_date) : "";
    const context = [exam.subject, day && `Examen el ${day}`]
      .filter(Boolean)
      .join(" · ");
    for (const unit of [...(exam.units ?? [])].sort(
      (a, b) => a.position - b.position,
    )) {
      tasks.push({
        id: unit.id,
        title: unit.title,
        context,
        status: unit.status === "completed" ? "done" : "pending",
        href:
          unit.status === "completed"
            ? null
            : `/exams/${exam.id}/study/${unit.id}`,
      });
    }
  }
  return tasks;
}

const KIND: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "Presentación",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
};

export function noteKind(mime: string, fileName: string) {
  if (mime.startsWith("image/")) return "Imagen";
  if (KIND[mime]) return KIND[mime];
  const ext = fileName.split(".").pop();
  return ext && ext !== fileName ? ext.toUpperCase() : "Archivo";
}

/** Exam materials (uploaded attachments) → notes. */
export function examsToNotes(exams: DreamExam[]): StudyNote[] {
  const notes: StudyNote[] = [];
  const seen = new Set<string>();
  for (const exam of exams) {
    for (const material of exam.materials ?? []) {
      if (!material?.id || seen.has(material.id)) continue;
      seen.add(material.id);
      notes.push({
        id: material.id,
        title: material.file_name,
        kind: noteKind(material.mime_type ?? "", material.file_name ?? ""),
        subject: exam.subject,
        status:
          material.status === "processed"
            ? "ready"
            : material.status === "failed" || material.status === "error"
              ? "failed"
              : "processing",
        examId: exam.id,
      });
    }
  }
  return notes;
}

async function loadExams(
  signal: AbortSignal | undefined,
  include: (exam: ExamIndex) => boolean,
) {
  const index = await callDream<{ exams: ExamIndex[] }>("exams", {}, signal);
  const selected = (index.exams ?? []).filter(include).slice(0, MAX_EXAMS);
  return Promise.all(
    selected.map(
      async (exam) =>
        (
          await callDream<{ exam: DreamExam }>(
            "exam_get",
            { exam_id: exam.id },
            signal,
          )
        ).exam,
    ),
  );
}

export const tasksSource: CollectionSource<StudyTask> = {
  canCreate: false,
  list: async (signal) =>
    examsToTasks(
      await loadExams(
        signal,
        (exam) => exam.status !== "completed" && (exam.units?.length ?? 0) > 0,
      ),
    ),
};

export const notesSource: CollectionSource<StudyNote> = {
  canCreate: false,
  list: async (signal) =>
    examsToNotes(
      await loadExams(signal, (exam) => (exam.materials?.length ?? 0) > 0),
    ),
};
