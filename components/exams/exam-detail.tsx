"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  daysUntil,
  examDateLabel,
  preparation,
  sessionPath,
  updateExam,
  type DreamExam,
  type ExamSession,
} from "@/lib/exam-plans";
import { ErrorNotice, Materials, useExam } from "./exam-ui";
import { LiveSubjectObject } from "../subject-object-live";
import {
  DaysChip,
  ExamDetailSkeleton,
  ExamPage,
  FailedState,
  LoadError,
  OBJECT_SIZE_DETAIL,
  OBJECT_TRANSITION,
  PlanRows,
  PreparingState,
  examStyles as s,
} from "./exam-page";

/** «Basado en Tema 4 · Ecuaciones.pdf» (Claude Design hero line). */
function basedOn(exam: DreamExam) {
  const first = exam.materials[0]?.file_name.replace(/\.[^.]+$/, "");
  if (first) return `Basado en ${first}`;
  if (exam.topics.length) return `Temas: ${exam.topics.slice(0, 3).join(", ")}`;
  return null;
}

function Progress({ exam }: { exam: DreamExam }) {
  const p = preparation(exam);
  return (
    <div className={s.progressRow}>
      <span>
        <span className="num">{p.percentage} %</span> del plan ·{" "}
        <span className="num">{p.completed}</span> de{" "}
        <span className="num">{p.total}</span> unidades
      </span>
      <span
        className={s.track}
        role="progressbar"
        aria-label="Unidades del plan completadas"
        aria-valuenow={p.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ transform: `scaleX(${p.percentage / 100})` }} />
      </span>
    </div>
  );
}

export function ExamDetail({
  id,
  plan = false,
}: {
  id: string;
  plan?: boolean;
}) {
  const { exam, setExam, error, setError, loading, reload } = useExam(id);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [timer, setTimer] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [rhythm, setRhythm] = useState(false);
  const [daily, setDaily] = useState(20);
  const lock = useRef(false);
  const requestId = useRef<string | null>(null);
  const preparing = exam?.status === "preparing";

  // While the plan is being prepared, check again every 6 s (max. 20 times).
  useEffect(() => {
    if (!preparing) return;
    let tries = 0;
    const c = new AbortController();
    const timerId = window.setInterval(() => {
      if (++tries > 20) return window.clearInterval(timerId);
      void callDream<{ exam: DreamExam }>("exam_get", { exam_id: id }, c.signal)
        .then((r) => {
          if (r.exam.status !== "preparing") setExam(r.exam);
        })
        .catch(() => {});
    }, 6000);
    return () => {
      c.abort();
      window.clearInterval(timerId);
    };
  }, [preparing, id, setExam]);

  async function simulate() {
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
          session_id: requestId.current,
          mode: "exam",
          time_limit_seconds: timer ? minutes * 60 : null,
        },
      );
      router.push(sessionPath(id, session.id));
    } catch (e) {
      setError(errorMessage(e));
      lock.current = false;
      setBusy(false);
    }
  }
  async function adjust() {
    setBusy(true);
    try {
      const updated = await updateExam("exam_rhythm", id, {
        daily_minutes: daily,
      });
      setExam(updated);
      setRhythm(false);
      // Ruta con IA (si el servidor la tiene): al cambiar los minutos se reordena lo pendiente.
      if (updated.route_source && updated.daily_minutes !== exam?.daily_minutes)
        void callDream<{ exam: typeof updated }>("exam_route_regenerate", {
          exam_id: id,
          trigger: "minutes",
        })
          .then((r) => setExam(r.exam))
          .catch(() => undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function retryPlan() {
    setRetrying(true);
    setError("");
    try {
      setExam(await updateExam("exam_prepare", id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRetrying(false);
    }
  }
  async function checkNow() {
    setChecking(true);
    try {
      setExam(
        (await callDream<{ exam: DreamExam }>("exam_get", { exam_id: id }))
          .exam,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  if (loading && !exam) return <ExamDetailSkeleton examId={id} />;
  if (!exam)
    return (
      <LoadError
        error={error}
        reload={reload}
        title="No se ha podido abrir el examen"
      />
    );

  const back = plan
    ? { href: `/exams/${id}`, label: exam.title }
    : { href: "/exams", label: "Exámenes" };
  const subtitle = `${exam.subject} · ${examDateLabel(exam.exam_date)}`;
  // Objeto de la asignatura junto al título: el mismo que en la tarjeta del
  // historial, que viaja hasta aquí con la transición de página.
  const object = plan ? undefined : (
    <LiveSubjectObject
      subject={exam.subject}
      size={OBJECT_SIZE_DETAIL}
      style={{ viewTransitionName: OBJECT_TRANSITION }}
    />
  );

  if (exam.status !== "ready" && exam.status !== "completed")
    return (
      <ExamPage
        title={exam.title}
        subtitle={subtitle}
        back={back}
        object={object}
      >
        {exam.status === "preparing" ? (
          <PreparingState
            topics={exam.topics}
            onRefresh={() => void checkNow()}
            checking={checking}
          />
        ) : exam.status === "failed" ? (
          <FailedState
            cause={exam.plan_error}
            onRetry={() => void retryPlan()}
            retrying={retrying}
            editHref={`/exams/new?id=${id}`}
          />
        ) : (
          <section className={s.stateCard}>
            <h2>Borrador guardado</h2>
            <p>
              Faltan los temas o la revisión. Retoma el asistente para preparar
              el plan.
            </p>
            <Link className="primary press" href={`/exams/new?id=${id}`}>
              Seguir preparando <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
        )}
        <ErrorNotice error={error} />
      </ExamPage>
    );

  const days = daysUntil(exam.exam_date);
  const soon = days !== null && days >= 0 && days <= 3;

  if (plan)
    return (
      <ExamPage title="Plan de estudio" subtitle={subtitle} back={back}>
        <section className={s.hero}>
          <Progress exam={exam} />
          <p className={s.hint}>
            <span className="num">{exam.daily_minutes}</span> minutos al día.
            Los minutos de cada unidad son una estimación de Dream.
          </p>
        </section>
        <section className={s.section} aria-labelledby="plan-units">
          <h2 id="plan-units">Tus unidades</h2>
          <PlanRows examId={id} units={exam.units} detailed />
        </section>
        <ErrorNotice error={error} />
      </ExamPage>
    );

  const based = basedOn(exam);
  return (
    <ExamPage title={exam.title} back={back} object={object}>
      <section className={s.hero} aria-labelledby="exam-hero" id="simulacro">
        <div className={s.heroTop}>
          <div>
            <h2 id="exam-hero">{exam.subject}</h2>
            <p className={s.heroMeta}>
              {examDateLabel(exam.exam_date)}
              {based ? ` · ${based}` : ""}
            </p>
          </div>
          {days !== null && days > 1 ? (
            <p className={s.count} data-soon={soon || undefined}>
              <strong className="num">{days}</strong>
              <small>días para el examen</small>
            </p>
          ) : (
            <DaysChip date={exam.exam_date} />
          )}
        </div>
        <Progress exam={exam} />
        {exam.status !== "completed" && (
          <>
            <div className={s.heroActions}>
              <button
                className="primary press"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void simulate()}
              >
                {busy ? (
                  <>
                    <span className={s.spinner} aria-hidden="true" /> Preparando
                    el simulacro…
                  </>
                ) : (
                  "Simulacro de examen"
                )}
              </button>
              <div className={s.timer}>
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={timer}
                    onChange={(e) => setTimer(e.target.checked)}
                    disabled={busy}
                  />
                  Con temporizador
                </label>
                {timer && (
                  <label className={s.minutes}>
                    <input
                      type="number"
                      className="num"
                      min={1}
                      max={240}
                      value={minutes}
                      disabled={busy}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                    minutos
                  </label>
                )}
              </div>
            </div>
            <p className={s.hint}>
              Simulacro de 10 preguntas sobre tus temas. Las explicaciones
              llegan al entregar.
            </p>
          </>
        )}
        <ErrorNotice error={error} />
      </section>

      <section className={s.section} aria-labelledby="exam-plan">
        <h2 id="exam-plan">Plan de estudio</h2>
        <PlanRows examId={id} units={exam.units} />
        <Link
          className={`text-link press ${s.sectionLink}`}
          href={`/exams/${id}/ruta`}
        >
          Ver mi ruta de estudio <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link
          className={`text-link press ${s.sectionLink}`}
          href={`/exams/${id}/plan`}
        >
          Ver el plan completo <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <div className={s.panels}>
        <section className={s.panel}>
          <h3>Tus materiales</h3>
          <Materials materials={exam.materials} />
        </section>
        <section className={s.panel}>
          <h3>Tu ritmo</h3>
          <p>
            <span className="num">{exam.daily_minutes}</span> minutos al día.
          </p>
          {rhythm ? (
            <form
              className={s.inline}
              onSubmit={(e) => {
                e.preventDefault();
                void adjust();
              }}
            >
              <div className={s.field}>
                <label htmlFor="exam-daily">Minutos al día</label>
                <input
                  id="exam-daily"
                  className="num"
                  type="number"
                  min={5}
                  max={120}
                  value={daily}
                  onChange={(e) => setDaily(Number(e.target.value))}
                />
              </div>
              <button
                className="primary press"
                disabled={busy}
                aria-busy={busy || undefined}
              >
                Guardar
              </button>
              <button
                type="button"
                className="text-button press"
                onClick={() => setRhythm(false)}
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              className="text-button press"
              style={{ alignSelf: "flex-start", marginLeft: -12 }}
              onClick={() => {
                setDaily(exam.daily_minutes);
                setRhythm(true);
              }}
            >
              Ajustar mi ritmo
            </button>
          )}
        </section>
        {!!exam.sessions.length && (
          <section className={s.panel}>
            <h3>Tus simulacros y repasos</h3>
            {exam.sessions.map((x) => (
              <Link
                className={`${s.linkRow} press`}
                href={sessionPath(id, x.id)}
                key={x.id}
              >
                <span>
                  {x.mode === "exam" ? "Simulacro" : "Repaso"} ·{" "}
                  {x.status === "completed"
                    ? "Ver resultado"
                    : x.status === "grading"
                      ? "Consultar corrección"
                      : "Continuar"}
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </section>
        )}
      </div>

      {exam.status !== "completed" ? (
        <button
          className="secondary press"
          style={{ alignSelf: "flex-start" }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void updateExam("exam_complete", id)
              .then(setExam)
              .catch((e) => setError(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Check size={18} aria-hidden="true" /> Marcar examen como completado
        </button>
      ) : (
        <p className={s.status}>
          <Check size={16} aria-hidden="true" /> Examen completado
        </p>
      )}
    </ExamPage>
  );
}
