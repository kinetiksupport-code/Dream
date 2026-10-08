"use client";
import { track } from "@/lib/observability/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  RotateCcw,
  X,
} from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  getExamSession,
  sessionPath,
  type ExamSession,
} from "@/lib/exam-plans";
import type { AnswerValue, DreamTest, Evaluation } from "@/lib/types";
import { AnswerInput, hasAnswer } from "../test-experience";
import { Markdown } from "../markdown";
import {
  ExamFrame,
  ExamLoad,
  ErrorNotice,
  ProgressLine,
  useExam,
  styles,
} from "./exam-ui";
export function ExamSessionView({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}) {
  const router = useRouter();
  const { exam, error, setError, loading, reload } = useExam(id);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [test, setTest] = useState<DreamTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [evaluation, setEvaluation] = useState<Record<string, Evaluation>>({});
  const [now, setNow] = useState(() => Date.now());
  const [showTime, setShowTime] = useState(true);
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const sessionRef = useRef<ExamSession | null>(null);
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const indexRef = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lock = useRef(false);
  const nextId = useRef<string | null>(null);
  const mounted = useRef(true);
  const changeVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    getExamSession(id, sessionId, c.signal)
      .then(async (s) => {
        const { test: t } = s.test_id
          ? await callDream<{ test: DreamTest }>(
              "test_get",
              { test_id: s.test_id },
              c.signal,
            )
          : { test: null };
        if (c.signal.aborted) return;
        sessionRef.current = s;
        setSession(s);
        setTest(t);
        setAnswers(s.answers);
        answersRef.current = s.answers;
        setIndex(s.question_index);
        indexRef.current = s.question_index;
        setDirty(false);
        setSaveStatus(s.status === "active" ? "Respuestas guardadas" : "");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [id, sessionId, retry, setError]);
  const deadline = session?.time_limit_seconds
    ? Date.parse(session.started_at) + session.time_limit_seconds * 1000
    : null;
  const expired = deadline !== null && now >= deadline;
  useEffect(() => {
    if (deadline === null || session?.status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, session?.status]);
  const persist = useCallback(
    async (nextIndex?: number) => {
      const run = async () => {
        const current = sessionRef.current;
        if (!current || current.status !== "active") return current;
        if (
          current.time_limit_seconds &&
          Date.now() >=
            Date.parse(current.started_at) + current.time_limit_seconds * 1000
        )
          throw new Error(
            "El tiempo ha terminado. Se entregarán las respuestas que ya estaban guardadas.",
          );
        const version = changeVersion.current;
        const snapshot = { ...answersRef.current };
        const position = nextIndex ?? indexRef.current;
        if (mounted.current) setSaveStatus("Guardando…");
        const { session: saved } = await callDream<{ session: ExamSession }>(
          "exam_session_save",
          {
            exam_id: id,
            session_id: sessionId,
            answers: snapshot,
            question_index: position,
            revision: current.revision,
          },
        );
        sessionRef.current = saved;
        if (mounted.current) {
          setSession(saved);
          if (version === changeVersion.current) setDirty(false);
          setSaveStatus("Respuestas guardadas");
        }
        return saved;
      };
      const pending = queue.current.catch(() => undefined).then(run);
      queue.current = pending;
      try {
        return await pending;
      } catch (e) {
        if (mounted.current) {
          setSaveStatus("Cambios sin guardar");
          setError(errorMessage(e));
        }
        throw e;
      }
    },
    [id, sessionId, setError],
  );
  useEffect(() => {
    if (!dirty || busy || expired) return;
    const timer = window.setTimeout(() => {
      void persist().catch(() => undefined);
    }, 650);
    return () => clearTimeout(timer);
  }, [answers, dirty, busy, expired, persist]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function navigate(position: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!expired) await persist(position);
      indexRef.current = position;
      setIndex(position);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function review() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!expired) await persist();
      setConfirm(true);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current || !sessionRef.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!expired && sessionRef.current.status === "active") await persist();
      const { session: saved } = await callDream<{ session: ExamSession }>(
        "exam_session_submit",
        { exam_id: id, session_id: sessionId },
      );
      if (
        sessionRef.current.status !== "completed" &&
        saved.status === "completed"
      )
        track("simulation_completed", { section: "exams", mode: saved.mode });
      sessionRef.current = saved;
      setSession(saved);
      setDirty(false);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function check() {
    if (!test || busy) return;
    setBusy(true);
    setError("");
    try {
      await persist();
      const q = test.questions[index];
      const { evaluation: ev } = await callDream<{ evaluation: Evaluation }>(
        "test_check_answer",
        {
          test_id: test.id,
          question_id: q.id,
          answer: answersRef.current[q.id],
        },
      );
      setEvaluation((s) => ({ ...s, [q.id]: ev }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function practiceErrors() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    nextId.current ??= crypto.randomUUID();
    try {
      const { session: s } = await callDream<{ session: ExamSession }>(
        "exam_session_create",
        {
          exam_id: id,
          session_id: nextId.current,
          source_session_id: sessionId,
          mode: "practice",
          time_limit_seconds: null,
        },
      );
      router.push(sessionPath(id, s.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (loading || !exam || !session)
    return (
      <ExamLoad
        error={error}
        reload={() => {
          reload();
          setRetry((n) => n + 1);
        }}
      />
    );
  if (!session.test_id || !test)
    return (
      <ExamFrame
        eyebrow="PREPARANDO PRÁCTICA"
        title="Cada pregunta, con sentido."
        subtitle={exam.title}
      >
        <section className={styles.card}>
          <p>
            {session.generation_error ||
              "Dream está preparando las preguntas con tus temas y materiales. La generación está guardada en tu cuenta."}
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              void callDream<{ session: ExamSession }>("exam_session_create", {
                exam_id: id,
                session_id: sessionId,
                mode: session.mode,
                time_limit_seconds: session.time_limit_seconds,
              })
                .then(() => setRetry((n) => n + 1))
                .catch((e) => setError(errorMessage(e)))
                .finally(() => {
                  lock.current = false;
                  setBusy(false);
                });
            }}
          >
            {busy
              ? "Consultando preparación…"
              : session.status === "failed"
                ? "Reintentar preparación"
                : "Consultar preparación"}
          </button>
          <Link className={styles.inlineLink} href={`/exams/${id}`}>
            Volver a mi examen
          </Link>
        </section>
        <ErrorNotice error={error} />
      </ExamFrame>
    );
  const answered = test.questions.filter((q) =>
    hasAnswer(q, answers[q.id]),
  ).length;
  const result = session.result;
  const q = test.questions[index];
  const practice = session.mode === "practice";
  const palette = (
    <div className={styles.palette}>
      {test.questions.map((question, i) => (
        <button
          key={question.id}
          className={
            hasAnswer(question, answers[question.id]) ? styles.answered : ""
          }
          aria-label={`Ir a pregunta ${i + 1}${hasAnswer(question, answers[question.id]) ? ", respondida" : ""}`}
          aria-current={i === index}
          disabled={busy || session.status !== "active"}
          onClick={() => void navigate(i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
  if (result)
    return (
      <ExamFrame
        eyebrow={practice ? "RESULTADOS / REPASO" : "RESULTADOS / SIMULACRO"}
        title="Ya sabes por dónde seguir."
        subtitle={`${exam.title} · ${result.total} preguntas`}
        aside={
          <>
            <section className={`${styles.card} ${styles.lime}`}>
              <h2>Un error. Otra oportunidad.</h2>
              <p>
                Retoma las ideas que necesitan una segunda mirada, con preguntas
                nuevas y explicaciones de Dream.
              </p>
              <button
                className="primary"
                disabled={busy || result.items.every((i) => i.is_correct)}
                onClick={() => void practiceErrors()}
              >
                {busy ? "Preparando repaso…" : "Repasar mis errores"}{" "}
                <RotateCcw size={16} />
              </button>
              {result.items.every((i) => i.is_correct) && (
                <small>
                  Has respondido correctamente todas las preguntas de este
                  intento.
                </small>
              )}
            </section>
            <section className={styles.card}>
              <h3>Qué conviene reforzar</h3>
              {result.practice.length ? (
                <div className={styles.chips}>
                  {result.practice.map((c) => (
                    <span className={styles.badge} key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p>
                  {result.items.some((i) => !i.is_correct)
                    ? "Revisa las preguntas señaladas. Este test no identificó conceptos específicos."
                    : "Todas las respuestas de este intento encajan."}
                </p>
              )}
              <Link className="secondary" href={`/exams/${id}`}>
                Volver a mi examen
              </Link>
            </section>
          </>
        }
      >
        <section className={`${styles.card} ${styles.blue}`}>
          <p className={styles.cardEyebrow}>TU RESULTADO</p>
          <p className={styles.score}>
            {result.score}
            <span> / {result.total}</span>
          </p>
          <h2>
            {result.percentage >= 60
              ? "Las ideas van tomando forma."
              : "Una buena pista para continuar."}
          </h2>
          <p>
            {result.percentage}% · Nota{" "}
            {((result.score / Math.max(1, result.total)) * 10).toFixed(1)}/10
          </p>
        </section>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <strong>{result.score}</strong>
            <small>Correctas</small>
          </div>
          <div className={styles.stat}>
            <strong>{result.total - result.score}</strong>
            <small>Por revisar</small>
          </div>
          <div className={styles.stat}>
            <strong>
              {session.submitted_at
                ? `${Math.max(0, Math.round((Date.parse(session.submitted_at) - Date.parse(session.started_at)) / 60000))} min`
                : "—"}
            </strong>
            <small>Tiempo transcurrido</small>
          </div>
        </div>
        <section className={styles.card}>
          <h3>Pregunta a pregunta</h3>
          <div className={styles.palette}>
            {result.items.map((item, i) => (
              <a
                key={item.question_id}
                href={`#review-${item.question_id}`}
                className={item.is_correct ? styles.correct : styles.incorrect}
                aria-label={`Pregunta ${i + 1}: ${item.is_correct ? "correcta" : "por revisar"}`}
              >
                {i + 1}
              </a>
            ))}
          </div>
        </section>
        {!!result.mastered.length && (
          <section className={styles.card}>
            <h3>Lo que salió bien en este intento</h3>
            <div className={styles.chips}>
              {result.mastered.map((c) => (
                <span className={styles.badge} key={c}>
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}
        <h2 className={styles.sectionTitle}>Revisa, comprende, continúa.</h2>
        {result.items.map((item, i) => (
          <section
            className={`${styles.card} ${styles.review}`}
            key={item.question_id}
            id={`review-${item.question_id}`}
          >
            <div className={styles.examCardTop}>
              <h3>Pregunta {i + 1}</h3>
              <span
                className={item.is_correct ? styles.correct : styles.incorrect}
              >
                {item.is_correct ? <Check size={18} /> : <X size={18} />}{" "}
                {item.is_correct ? "Correcta" : "Por revisar"}
              </span>
            </div>
            <Markdown content={item.prompt} />
            <small>Tu respuesta</small>
            <Markdown content={formatAnswer(item.answer)} />
            <small>Respuesta de referencia</small>
            <Markdown content={formatAnswer(item.correct_answer)} />
            <Markdown content={item.feedback} />
          </section>
        ))}
        <ErrorNotice error={error} />
      </ExamFrame>
    );
  if (session.status === "grading")
    return (
      <ExamFrame
        eyebrow="CORRECCIÓN EN CURSO"
        title="Dando sentido a tus respuestas."
        subtitle={exam.title}
      >
        <section className={styles.card}>
          <p>
            Tus respuestas están guardadas. Consulta el resultado sin volver a
            enviar otro intento.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Consultando…" : "Consultar corrección"}
          </button>
          <Link className={styles.inlineLink} href={`/exams/${id}`}>
            Volver a mi examen
          </Link>
        </section>
        <ErrorNotice error={error} />
      </ExamFrame>
    );
  const typeTitle =
    q?.type === "math"
      ? "Resuelve y comprueba."
      : ["short_answer", "fill_blank"].includes(q?.type)
        ? "Explícalo con tus palabras."
        : "Pon en práctica lo que sabes.";
  const typeLabel =
    q?.type === "math"
      ? "MATEMÁTICAS"
      : ["short_answer", "fill_blank"].includes(q?.type)
        ? "RESPUESTA ABIERTA"
        : "TIPO TEST";
  const timeRemaining =
    deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const formatted =
    timeRemaining === null
      ? "Sin límite"
      : `${Math.floor(timeRemaining / 60)
          .toString()
          .padStart(
            2,
            "0",
          )}:${(timeRemaining % 60).toString().padStart(2, "0")}`;
  return (
    <ExamFrame
      eyebrow={
        confirm
          ? "SIMULACRO / ENTREGA"
          : practice
            ? "REPASO / TUS IDEAS"
            : `SIMULACRO / ${typeLabel}`
      }
      title={
        confirm
          ? "¿Listo para entregar?"
          : practice
            ? "Una segunda mirada. Más claro."
            : typeTitle
      }
      subtitle={`${exam.title} · ${practice ? "Repaso" : "Simulacro"} de ${test.questions.length} preguntas`}
      aside={
        <>
          <section className={styles.card}>
            <h3>{practice ? "Tu repaso" : "Tu simulacro"}</h3>
            <p>{test.questions.length} preguntas · 1 punto por pregunta</p>
            <small>
              Basado en tus temas
              {exam.materials.length
                ? ` y ${exam.materials.length} materiales`
                : ""}
              .
            </small>
            <hr className={styles.divider} />
            {palette}
            <small>
              {answered} de {test.questions.length} respondidas
            </small>
            <p>
              {session.time_limit_seconds
                ? `Límite: ${session.time_limit_seconds / 60} minutos.`
                : "Sin límite de tiempo."}
            </p>
            <small>{saveStatus}</small>
            <Link
              href={`/exams/${id}`}
              className={styles.inlineLink}
              onClick={(e) => {
                if (dirty) {
                  e.preventDefault();
                  void persist()
                    .then(() => router.push(`/exams/${id}`))
                    .catch(() => undefined);
                }
              }}
            >
              Volver a mi examen
            </Link>
          </section>
          <section className={`${styles.card} ${styles.lime}`}>
            <h3>
              {practice ? "Entender importa." : "Sin pistas, sin presión."}
            </h3>
            <p>
              {practice
                ? "Comprueba una respuesta y explora su explicación."
                : "Las explicaciones aparecen al entregar. Ahora confía en lo que sabes."}
            </p>
          </section>
        </>
      }
    >
      {deadline !== null && (
        <div className={styles.timer}>
          <span className={styles.badge}>
            <Clock3 size={13} />
            {expired
              ? "Tiempo terminado"
              : showTime
                ? `${formatted} restantes`
                : "Temporizador activo"}
          </span>
          <button onClick={() => setShowTime((v) => !v)}>
            {showTime ? "Ocultar tiempo" : "Mostrar tiempo"}
          </button>
        </div>
      )}
      {confirm ? (
        <section className={styles.card}>
          <h2>Una última mirada antes de terminar.</h2>
          <p>
            {answered} de {test.questions.length} preguntas respondidas.
          </p>
          <small>
            {answered < test.questions.length
              ? "Las preguntas sin responder contarán como incorrectas."
              : "Tus respuestas están guardadas. Puedes volver y revisarlas."}
          </small>
          {expired && (
            <p>
              Se corregirán las respuestas guardadas antes de terminar el
              tiempo.
            </p>
          )}
          {palette}
          <div className={styles.actions}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Seguir revisando
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Corrigiendo…" : "Entregar simulacro"} <Check size={18} />
            </button>
          </div>
        </section>
      ) : (
        <>
          <div>
            <div className={styles.questionHeading}>
              <span>
                {test.topic.toUpperCase()} · {practice ? "REPASO" : typeLabel}
              </span>
              <strong>
                {index + 1} / {test.questions.length}
              </strong>
            </div>
            <ProgressLine
              value={((index + 1) / test.questions.length) * 100}
              label="Pregunta actual"
            />
          </div>
          <section className={styles.question} key={q.id}>
            <div className="question-prompt">
              <Markdown content={q.prompt} />
            </div>
            {q.type === "multiple_select" && (
              <p className={styles.muted}>Puedes elegir varias respuestas.</p>
            )}
            <AnswerInput
              question={q}
              value={answers[q.id]}
              disabled={busy || expired || !!evaluation[q.id]}
              evaluation={practice ? evaluation[q.id] : undefined}
              onChange={(value) => {
                const next = { ...answersRef.current, [q.id]: value };
                answersRef.current = next;
                changeVersion.current++;
                setAnswers(next);
                setDirty(true);
                setSaveStatus("Cambios sin guardar");
              }}
            />
            {practice && evaluation[q.id] && (
              <div
                className={`answer-feedback ${evaluation[q.id].is_correct ? "correct" : "incorrect"}`}
                role="status"
              >
                <strong>
                  {evaluation[q.id].is_correct
                    ? "Bien pensado."
                    : "Vamos a darle otra mirada."}
                </strong>
                <Markdown content={evaluation[q.id].feedback} />
                <button
                  className={styles.inlineLink}
                  onClick={() =>
                    setEvaluation((s) => {
                      const next = { ...s };
                      delete next[q.id];
                      return next;
                    })
                  }
                >
                  Volver a intentarlo
                </button>
              </div>
            )}
            {practice && !evaluation[q.id] && (
              <button
                className="primary"
                disabled={busy || !hasAnswer(q, answers[q.id])}
                onClick={() => void check()}
              >
                {busy ? "Comprobando…" : "Comprobar respuesta"}
              </button>
            )}
            <div className={styles.actions}>
              <button
                className="secondary"
                disabled={busy || index === 0}
                onClick={() => void navigate(index - 1)}
              >
                <ArrowLeft size={16} /> Anterior
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void (index === test.questions.length - 1 || expired
                    ? review()
                    : navigate(index + 1))
                }
              >
                {busy
                  ? "Guardando…"
                  : index === test.questions.length - 1 || expired
                    ? "Revisar y entregar"
                    : "Guardar y siguiente"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
            <p className={styles.footerNote}>
              {saveStatus}
              {dirty && (
                <button
                  className={styles.inlineLink}
                  disabled={busy || expired}
                  onClick={() => void persist().catch(() => undefined)}
                >
                  {" "}
                  · Reintentar guardado
                </button>
              )}
            </p>
          </section>
        </>
      )}
      <ErrorNotice error={error} />
    </ExamFrame>
  );
}
function formatAnswer(value: AnswerValue | undefined) {
  return value === undefined
    ? "Sin respuesta"
    : Array.isArray(value)
      ? value.join(", ")
      : typeof value === "object"
        ? Object.entries(value)
            .map(([a, b]) => `${a} → ${b}`)
            .join("\n\n")
        : value || "Sin respuesta";
}
