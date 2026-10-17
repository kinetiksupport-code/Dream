"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  updateExam,
  sessionPath,
  type ExamUnit,
  type ExamSession,
} from "@/lib/exam-plans";
import { ChatExperience } from "../chat-experience";
import {
  ExamFrame,
  ErrorNotice,
  PreparationProgress,
  useExam,
  styles,
} from "./exam-ui";
import { ExamDetailSkeleton, LoadError, examStyles } from "./exam-page";
export function ExamStudy({ id, unitId }: { id: string; unitId: string }) {
  const { exam, setExam, error, setError, loading, reload } = useExam(id);
  const [unit, setUnit] = useState<ExamUnit | null>(null);
  const [busy, setBusy] = useState(false);
  const [startRetry, setStartRetry] = useState(0);
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let mounted = true;
    callDream<{ unit: ExamUnit }>("exam_unit_start", {
      exam_id: id,
      unit_id: unitId,
    })
      .then((r) => {
        if (mounted) setUnit(r.unit);
      })
      .catch((e) => {
        if (mounted) setError(errorMessage(e));
      });
    return () => {
      mounted = false;
    };
  }, [id, unitId, setError, startRetry]);
  async function practice() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const { session } = await callDream<{ session: ExamSession }>(
        "exam_session_create",
        {
          exam_id: id,
          unit_id: unitId,
          session_id: requestId.current,
          mode: "practice",
          time_limit_seconds: null,
        },
      );
      router.push(sessionPath(id, session.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (error && (!exam || !unit?.conversation_id))
    return (
      <LoadError
        error={error}
        title="No se ha podido abrir la unidad"
        reload={() => {
          setError("");
          reload();
          setStartRetry((n) => n + 1);
        }}
      />
    );
  if (loading || !exam || !unit?.conversation_id) return <ExamDetailSkeleton />;
  return (
    <ExamFrame
      eyebrow={`Estudiar · ${exam.subject}`}
      title={unit.title}
      subtitle={`${exam.title} · Unidad ${unit.position + 1} de ${exam.units.length}`}
      aside={
        <>
          <section className={`${styles.card} ${styles.lime}`}>
            <h2>Ahora, una idea tuya.</h2>
            <p>
              Prueba lo que acabas de entender. Dream te explicará qué encaja y
              qué merece otra mirada.
            </p>
            <button
              className="primary press"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => void practice()}
            >
              {busy ? "Preparando práctica…" : "Practicar esta unidad"}{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </section>
          <section className={styles.card}>
            <h3>Tu plan</h3>
            <PreparationProgress exam={exam} />
            <p>
              <span className="num">{unit.estimated_minutes}</span> minutos
              estimados para esta unidad.
            </p>
            <Link className="text-link press" href={`/exams/${id}/plan`}>
              Ver todas las unidades
            </Link>
            {unit.status === "completed" ? (
              <p>
                <Check size={16} /> Unidad completada
              </p>
            ) : (
              <button
                className="secondary press"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => {
                  setBusy(true);
                  void updateExam("exam_unit_complete", id, { unit_id: unitId })
                    .then((e) => {
                      setExam(e);
                      setUnit(e.units.find((u) => u.id === unitId) || null);
                    })
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                He terminado esta unidad <Check size={16} />
              </button>
            )}
            <small>
              Este avance refleja las unidades que completas, no una evaluación
              de dominio.
            </small>
          </section>
        </>
      }
    >
      <ol className={examStyles.studySteps} aria-label="Cómo aprender con Dream">
        {["Explicación", "Ejemplo", "Práctica", "Comprensión"].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className={styles.studyLayout}>
        <ChatExperience
          study={{
            examId: id,
            unitId,
            conversationId: unit.conversation_id,
            title: unit.title,
          }}
        />
      </div>
      <ErrorNotice error={error} />
    </ExamFrame>
  );
}
