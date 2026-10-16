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
  ExamLoad,
  ErrorNotice,
  PreparationProgress,
  useExam,
  styles,
} from "./exam-ui";
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
  if (loading || !exam || !unit?.conversation_id)
    return (
      <ExamLoad
        error={error}
        reload={() => {
          reload();
          setStartRetry((n) => n + 1);
        }}
      />
    );
  return (
    <ExamFrame
      eyebrow={`ESTUDIAR / ${exam.subject.toUpperCase()}`}
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
              className="primary"
              disabled={busy}
              onClick={() => void practice()}
            >
              {busy ? "Preparando práctica…" : "Practicar esta unidad"}{" "}
              <ArrowRight size={18} />
            </button>
          </section>
          <section className={styles.card}>
            <h3>Tu plan</h3>
            <PreparationProgress exam={exam} />
            <p>{unit.estimated_minutes} minutos estimados para esta unidad.</p>
            <Link className={styles.inlineLink} href={`/exams/${id}/plan`}>
              Ver todas las unidades
            </Link>
            <Link
              className={styles.inlineLink}
              href={`/exams/${id}/ruta${unit.status === "completed" ? `?hecho=${unit.id}` : ""}`}
            >
              {unit.status === "completed" ? "Volver a mi ruta" : "Ver mi ruta"}
            </Link>
            {unit.status === "completed" ? (
              <p>
                <Check size={16} /> Unidad completada
              </p>
            ) : (
              <button
                className="secondary"
                disabled={busy}
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
      <div className={styles.studySteps} aria-label="Cómo aprender con Dream">
        {["Explicación", "Ejemplo", "Práctica", "Comprensión"].map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
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
