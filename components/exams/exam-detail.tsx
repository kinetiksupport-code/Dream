"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  updateExam,
  examDateLabel,
  sessionPath,
  type ExamSession,
} from "@/lib/exam-plans";
import {
  ExamFrame,
  ExamLoad,
  ErrorNotice,
  Countdown,
  NextUnit,
  Materials,
  PreparationProgress,
  UnitRow,
  useExam,
  styles,
} from "./exam-ui";
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
  const [timer, setTimer] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [rhythm, setRhythm] = useState(false);
  const [daily, setDaily] = useState(20);
  const lock = useRef(false);
  const requestId = useRef<string | null>(null);
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
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function adjust() {
    setBusy(true);
    try {
      setExam(await updateExam("exam_rhythm", id, { daily_minutes: daily }));
      setRhythm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading || !exam) return <ExamLoad error={error} reload={reload} />;
  if (["draft", "failed", "preparing"].includes(exam.status))
    return (
      <ExamFrame
        eyebrow="TU PREPARACIÓN"
        title={exam.title}
        subtitle={
          exam.status === "preparing"
            ? "Dream está organizando tus temas."
            : "Tu borrador está guardado."
        }
      >
        <section className={styles.card}>
          <p>
            {exam.plan_error ||
              "Retoma el asistente para revisar tus temas y preparar el plan."}
          </p>
          <Link className="primary" href={`/exams/new?id=${id}`}>
            Retomar preparación <ArrowRight size={18} />
          </Link>
          <button className="secondary" onClick={reload}>
            Actualizar estado
          </button>
        </section>
      </ExamFrame>
    );
  return (
    <ExamFrame
      eyebrow={plan ? "PLAN DE ESTUDIO" : "TU EXAMEN"}
      title={plan ? "Un plan. Pequeños pasos." : exam.title}
      subtitle={`${exam.subject} · ${examDateLabel(exam.exam_date)} · ${exam.topics.length} temas`}
      aside={
        <>
          <Countdown exam={exam} />
          <NextUnit exam={exam} />
          <section className={styles.card}>
            <h3>Tu ritmo, tu plan</h3>
            <p>
              {exam.daily_minutes} minutos al día. Las duraciones de las
              unidades son estimaciones de Dream.
            </p>
            {rhythm ? (
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void adjust();
                }}
              >
                <label>
                  Minutos al día
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={daily}
                    onChange={(e) => setDaily(Number(e.target.value))}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Guardar ritmo
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRhythm(false)}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <button
                className={styles.inlineLink}
                onClick={() => {
                  setDaily(exam.daily_minutes);
                  setRhythm(true);
                }}
              >
                Ajustar mi ritmo
              </button>
            )}
          </section>
        </>
      }
    >
      <section className={styles.card}>
        <div className={styles.examCardTop}>
          <h3>Tu preparación</h3>
          <span className={styles.badge}>
            {exam.status === "completed" ? "Completado" : "A tu ritmo"}
          </span>
        </div>
        <PreparationProgress exam={exam} />
        {!plan && (
          <Link className={styles.cardLink} href={`/exams/${id}/plan`}>
            Ver plan de estudio <ArrowRight size={16} />
          </Link>
        )}
      </section>
      <h2 className={styles.sectionTitle}>
        {plan ? "Tus unidades de estudio" : "Por dónde seguir"}
      </h2>
      {exam.units.map((unit) => (
        <UnitRow key={unit.id} examId={id} unit={unit} />
      ))}
      {!plan && (
        <>
          <section className={styles.card}>
            <h3>Tus materiales</h3>
            <Materials materials={exam.materials} />
          </section>
          <section className={styles.card}>
            <h2>Pon en práctica lo que sabes.</h2>
            <p>
              Un simulacro de 10 preguntas, con los tipos que encajen con tu
              temario. Las explicaciones aparecen después de entregar.
            </p>
            <div className={styles.form}>
              <label className={styles.timer}>
                <span>
                  <Clock3 size={16} /> Temporizador opcional
                </span>
                <input
                  type="checkbox"
                  checked={timer}
                  onChange={(e) => setTimer(e.target.checked)}
                  disabled={busy}
                />
              </label>
              {timer && (
                <label>
                  Duración (minutos)
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={minutes}
                    disabled={busy}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void simulate()}
            >
              {busy ? "Preparando simulacro…" : "Empezar simulacro"}{" "}
              <ArrowRight size={18} />
            </button>
          </section>
        </>
      )}
      {!!exam.sessions.length && (
        <section className={styles.card}>
          <h3>{plan ? "Tu práctica" : "Tus simulacros y repasos"}</h3>
          {exam.sessions.map((s) => (
            <Link
              className={styles.cardLink}
              href={sessionPath(id, s.id)}
              key={s.id}
            >
              {s.mode === "exam" ? "Simulacro" : "Repaso"} ·{" "}
              {s.status === "completed"
                ? "Ver resultado"
                : s.status === "grading"
                  ? "Consultar corrección"
                  : "Continuar"}{" "}
              <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      )}
      {exam.status !== "completed" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void updateExam("exam_complete", id)
              .then(setExam)
              .catch((e) => setError(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Check size={18} /> Marcar examen como completado
        </button>
      )}
      <ErrorNotice error={error} />
      <Link className={styles.inlineLink} href="/exams">
        Volver a mis exámenes
      </Link>
    </ExamFrame>
  );
}
