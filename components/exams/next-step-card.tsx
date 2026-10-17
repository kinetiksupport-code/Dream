"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Route } from "lucide-react";
import { callDream } from "@/lib/dream-api";
import { getExam, type DreamExam, type ExamIndex } from "@/lib/exam-plans";
import { buildRoute, nearestExam, TYPE_LABELS } from "@/lib/study-path";
import { localToday } from "@/supabase/functions/dream-api/route-plan.mjs";
import styles from "./route.module.css";

interface NextStep {
  examId: string;
  subject: string;
  title: string;
  meta: string;
}

/**
 * Tarjeta «A continuación» de Inicio: el siguiente paso de la ruta del examen
 * más cercano. Si no hay examen (o falla la red) no se muestra nada.
 */
export function NextStepCard() {
  const [step, setStep] = useState<NextStep | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const today = localToday();
    callDream<{ exams: ExamIndex[] }>("exams", {}, controller.signal)
      .then(async ({ exams }) => {
        const nearest = nearestExam(exams ?? [], today);
        if (!nearest || nearest.status !== "ready") return;
        const exam: DreamExam = await getExam(nearest.id, controller.signal);
        const next = buildRoute(exam, today).next;
        if (!next || controller.signal.aborted) return;
        setStep({
          examId: exam.id,
          subject: exam.subject,
          title: next.title,
          meta: [TYPE_LABELS[next.type], next.when, `${next.minutes} min`]
            .filter(Boolean)
            .join(" · "),
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!step) return null;
  return (
    <Link
      className={`${styles.homeCard} press`}
      href={`/exams/${step.examId}/ruta`}
      data-testid="home-next-step"
    >
      <span className={styles.homeIcon} aria-hidden="true">
        <Route size={20} />
      </span>
      <span className={styles.homeCopy}>
        <small>A continuación · {step.subject}</small>
        <strong>{step.title}</strong>
        <span className={styles.num}>{step.meta}</span>
      </span>
      <ChevronRight className={styles.homeArrow} size={20} aria-hidden="true" />
    </Link>
  );
}
