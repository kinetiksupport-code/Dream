"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { daysUntil, type ExamIndex } from "@/lib/exam-plans";
import {
  EmptyExams,
  ExamCard,
  ExamListSkeleton,
  ExamPage,
  LoadError,
  examStyles as s,
} from "./exam-page";

/** Upcoming first by date; undated last. */
function byDate(a: ExamIndex, b: ExamIndex) {
  return (
    (daysUntil(a.exam_date) ?? 9999) - (daysUntil(b.exam_date) ?? 9999)
  );
}

export function ExamList() {
  const [items, setItems] = useState<ExamIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [retry, setRetry] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");
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
  if (loading) return <ExamListSkeleton />;
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
  const upcoming = items.filter((e) => e.status !== "completed").sort(byDate);
  const completed = items.filter((e) => e.status === "completed");
  const visible = tab === "upcoming" ? upcoming : completed;
  return (
    <ExamPage
      title="Exámenes"
      back={{ href: "/more", label: "Más", phoneOnly: true }}
      action={
        <Link className="primary press" href="/exams/new">
          <Plus size={18} aria-hidden="true" /> Añadir examen
        </Link>
      }
    >
      <div className={s.list}>
        {items.length > 0 && (
          <div
            className={s.segmented}
            role="tablist"
            aria-label="Estado de los exámenes"
          >
            <button
              role="tab"
              className="press"
              aria-selected={tab === "upcoming"}
              onClick={() => setTab("upcoming")}
            >
              Próximos (<span className="num">{upcoming.length}</span>)
            </button>
            <button
              role="tab"
              className="press"
              aria-selected={tab === "completed"}
              onClick={() => setTab("completed")}
            >
              Completados (<span className="num">{completed.length}</span>)
            </button>
          </div>
        )}
        {!visible.length && <EmptyExams completed={tab === "completed"} />}
        {visible.map((exam, i) => (
          <ExamCard key={exam.id} exam={exam} index={i} />
        ))}
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
      </div>
    </ExamPage>
  );
}
