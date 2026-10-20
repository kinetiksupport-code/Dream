"use client";
// Pantalla Exámenes (PROMPT_EXAMEN_ESTILO.md §4): cabecera azul con
// «Crear examen», Próximos por fecha y Anteriores. Borrar tiene Deshacer:
// la tarjeta desaparece al momento y la llamada espera a que acabe el aviso
// (como las conversaciones del Shell; apple-design undo-and-redo.md).
import { useCallback, useEffect, useRef, useState } from "react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { examTitle, groupExams, updateExam, type ExamIndex } from "@/lib/exam-plans";
import { Toast } from "../toast";
import { LoadError, examStyles as s } from "./exam-page";
import {
  EmptyHistory,
  ExamActionsSheet,
  HistoryCard,
  HistoryHero,
  HistorySkeleton,
} from "./exam-history";

/** Time to undo a deleted exam before it is really deleted. */
export const EXAM_UNDO_MS = 5000;

export function ExamList() {
  const [items, setItems] = useState<ExamIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [retry, setRetry] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actions, setActions] = useState<ExamIndex | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // Deleted but still undoable: hidden until the toast runs out.
  const [pending, setPending] = useState<ExamIndex | null>(null);
  const [deleteError, setDeleteError] = useState<ExamIndex | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    const controller = new AbortController();
    callDream<{ exams: ExamIndex[]; next_offset?: number | null }>(
      "exams",
      {},
      controller.signal,
    )
      .then((r) => {
        setItems(r.exams);
        setNextOffset(r.next_offset ?? null);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const commitDelete = useCallback(async (exam: ExamIndex) => {
    setPending((p) => (p?.id === exam.id ? null : p));
    setDeleteError(null);
    setItems((list) => list.filter((e) => e.id !== exam.id));
    try {
      await callDream("exam_delete", { exam_id: exam.id });
    } catch {
      setItems((list) =>
        list.some((e) => e.id === exam.id) ? list : [...list, exam],
      );
      setDeleteError(exam);
    }
  }, []);
  // Leaving the page before the toast ends still deletes it.
  useEffect(
    () => () => {
      if (pendingRef.current) void commitDelete(pendingRef.current);
    },
    [commitDelete],
  );

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const r = await callDream<{
        exams: ExamIndex[];
        next_offset?: number | null;
      }>("exams", { offset: nextOffset });
      setItems((previous) => [
        ...previous,
        ...r.exams.filter((e) => !previous.some((p) => p.id === e.id)),
      ]);
      setNextOffset(r.next_offset ?? null);
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function complete(exam: ExamIndex) {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      await updateExam("exam_complete", exam.id);
      setItems((list) =>
        list.map((e) => (e.id === exam.id ? { ...e, status: "completed" } : e)),
      );
      setActions(null);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setActionBusy(false);
    }
  }

  function remove(exam: ExamIndex) {
    // A previous undoable delete becomes final now.
    if (pending && pending.id !== exam.id) void commitDelete(pending);
    setActions(null);
    setPending(exam);
  }

  if (loading) return <HistorySkeleton />;
  if (error)
    return (
      <LoadError
        error={error}
        reload={() => {
          setLoading(true);
          setError("");
          setRetry((n) => n + 1);
        }}
      />
    );
  const visible = pending ? items.filter((e) => e.id !== pending.id) : items;
  const { upcoming, previous } = groupExams(visible);
  let n = 0;
  const cards = (list: ExamIndex[]) => (
    <ul className={s.hList}>
      {list.map((exam) => (
        <li key={exam.id}>
          <HistoryCard
            exam={exam}
            index={n++}
            onActions={(e) => {
              setActionError("");
              setActions(e);
            }}
          />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={s.page}>
      <HistoryHero cta={visible.length > 0} />
      {!visible.length && <EmptyHistory />}
      {upcoming.length > 0 && (
        <section className={s.hSection} aria-labelledby="exams-upcoming">
          <h2 id="exams-upcoming">
            Próximos <span className="num">{upcoming.length}</span>
          </h2>
          {cards(upcoming)}
        </section>
      )}
      {previous.length > 0 && (
        <section className={s.hSection} aria-labelledby="exams-previous">
          <h2 id="exams-previous">
            Anteriores <span className="num">{previous.length}</span>
          </h2>
          {cards(previous)}
        </section>
      )}
      {nextOffset !== null && (
        <button
          className="secondary press"
          disabled={loadingMore}
          aria-busy={loadingMore || undefined}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Cargando exámenes…" : "Ver más exámenes"}
        </button>
      )}
      {moreError && (
        <p className="error" role="alert">
          {moreError}
        </p>
      )}
      <p className={s.disclaimer}>
        Dream puede equivocarse. Pregunta, compara y comprende.
      </p>
      {actions && (
        <ExamActionsSheet
          exam={actions}
          busy={actionBusy}
          error={actionError}
          onClose={() => setActions(null)}
          onComplete={() => void complete(actions)}
          onDelete={() => remove(actions)}
        />
      )}
      {pending ? (
        <div className="toast-position" key={pending.id}>
          <Toast
            message={`Examen «${examTitle(pending)}» borrado`}
            action={{ label: "Deshacer", run: () => setPending(null) }}
            duration={EXAM_UNDO_MS}
            onExpire={() => void commitDelete(pending)}
          />
        </div>
      ) : (
        deleteError && (
          <div className="toast-position">
            <Toast
              message="No se pudo borrar el examen."
              error
              onClose={() => setDeleteError(null)}
              action={{
                label: "Reintentar",
                run: () => void commitDelete(deleteError),
              }}
            />
          </div>
        )
      )}
    </div>
  );
}
