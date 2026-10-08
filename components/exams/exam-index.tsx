"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  preparation,
  countdownLabel,
  examDateLabel,
  type ExamIndex,
} from "@/lib/exam-plans";
import { ExamFrame, ExamLoad, ProgressLine, styles } from "./exam-ui";
export function ExamList() {
  const [items, setItems] = useState<ExamIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("upcoming");
  useEffect(() => {
    const controller = new AbortController();
    callDream<{ exams: ExamIndex[] }>("exams", {}, controller.signal)
      .then((r) => setItems(r.exams))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  if (loading || error)
    return (
      <ExamLoad
        error={error}
        reload={() => {
          setLoading(true);
          setError("");
          setRetry((n) => n + 1);
        }}
      />
    );
  const upcoming = items.filter((e) => e.status !== "completed");
  const completed = items.filter((e) => e.status === "completed");
  const next = upcoming.find((e) => e.status === "ready");
  const visible = tab === "upcoming" ? upcoming : completed;
  return (
    <ExamFrame
      eyebrow="TU CURIOSIDAD, CON UN PLAN"
      title="Prepárate con calma."
      subtitle="Tus fechas, tus apuntes y un siguiente paso claro."
      action={
        <Link className="primary" href="/exams/new">
          Nuevo examen <ArrowRight size={18} />
        </Link>
      }
      aside={
        <>
          <section className={`${styles.card} ${styles.lime}`}>
            <p className={styles.cardEyebrow}>A TU RITMO</p>
            <h2>Un paso pequeño. Un tema más claro.</h2>
            <p>
              {next
                ? `Retoma ${next.title}. Tu objetivo es dedicar ${next.daily_minutes} minutos al día.`
                : "Añade tu próximo examen. Dream te ayudará a organizar los temas que quieres entender."}
            </p>
            <Link
              className="primary"
              href={next ? `/exams/${next.id}/plan` : "/exams/new"}
            >
              {next ? "Continuar estudiando" : "Crear mi primer plan"}{" "}
              <ArrowRight size={18} />
            </Link>
          </section>
          <section className={styles.card}>
            <h3>Tu semana, a tu ritmo</h3>
            <p>
              {next
                ? `${preparation(next).completed} de ${preparation(next).total} unidades de ${next.title} completadas.`
                : "Tus planes y tus materiales se guardan en tu cuenta para que puedas volver cuando quieras."}
            </p>
            {next && (
              <>
                <hr className={styles.divider} />
                <small>
                  Próximo examen: {examDateLabel(next.exam_date)}.{" "}
                  {countdownLabel(next.exam_date)} para preparar lo que falta.
                </small>
              </>
            )}
          </section>
        </>
      }
    >
      <div className={styles.stats}>
        <div className={styles.stat}>
          <strong>{upcoming.length}</strong>
          <small>Próximos</small>
        </div>
        <div className={styles.stat}>
          <strong>{completed.length}</strong>
          <small>Completados</small>
        </div>
        <div className={styles.stat}>
          <strong>{next ? `${next.daily_minutes} min` : "—"}</strong>
          <small>Tu rato de hoy</small>
        </div>
      </div>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Estado de los exámenes"
      >
        <button
          role="tab"
          aria-selected={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
        >
          Próximos ({upcoming.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "completed"}
          onClick={() => setTab("completed")}
        >
          Completados ({completed.length})
        </button>
      </div>
      {!visible.length && (
        <section className={`${styles.card} ${styles.empty}`}>
          <h2>
            {tab === "upcoming"
              ? "Tu próximo paso empieza aquí."
              : "Cada plan, a tu ritmo."}
          </h2>
          <p>
            {tab === "upcoming"
              ? "Añade la fecha, los temas y tus apuntes. Dream organizará un plan que puedas retomar."
              : "Aquí aparecerán los exámenes que marques como completados."}
          </p>
          {tab === "upcoming" && (
            <Link className={styles.cardLink} href="/exams/new">
              Nuevo examen <ArrowRight size={16} />
            </Link>
          )}
        </section>
      )}
      {visible.map((exam) => {
        const p = preparation(exam);
        return (
          <article className={styles.card} key={exam.id}>
            <div className={styles.examCardTop}>
              <span className={styles.badge}>{exam.subject}</span>
              <span className={styles.inlineLink}>
                {countdownLabel(exam.exam_date)}
              </span>
            </div>
            <h2>{exam.title}</h2>
            <small>
              {examDateLabel(exam.exam_date, true)} · {exam.topics.length}{" "}
              {exam.topics.length === 1 ? "tema" : "temas"}
              {" · "}
              {exam.materials.length}{" "}
              {exam.materials.length === 1 ? "material" : "materiales"}
            </small>
            <div className={styles.preparation}>
              <strong>
                {exam.status === "draft"
                  ? "Borrador guardado"
                  : exam.status === "failed"
                    ? "Preparación pendiente de reintentar"
                    : exam.status === "preparing"
                      ? "Organizando tus temas"
                      : `${p.percentage}% del plan · ${p.completed} de ${p.total} unidades`}
              </strong>
              <ProgressLine
                value={p.percentage}
                label={`Preparación de ${exam.title}`}
              />
            </div>
            <Link
              className={styles.cardLink}
              href={
                ["draft", "failed"].includes(exam.status)
                  ? `/exams/new?id=${exam.id}`
                  : `/exams/${exam.id}`
              }
            >
              Ver examen <ArrowRight size={16} />
            </Link>
          </article>
        );
      })}
    </ExamFrame>
  );
}
