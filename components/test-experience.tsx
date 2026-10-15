"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X, RotateCcw } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import type {
  DreamTest,
  DreamQuestion,
  AnswerValue,
  Evaluation,
  TestResult,
} from "@/lib/types";
import { DreamActivity } from "./dream-mark";
import { Markdown } from "./markdown";
import { useConversations } from "./shell";
export function hasAnswer(q: DreamQuestion, a: AnswerValue | undefined) {
  if (a === undefined) return false;
  if (q.type === "matching")
    return !!q.metadata?.left?.every(
      (left) => typeof a === "object" && !Array.isArray(a) && !!a[left],
    );
  return Array.isArray(a)
    ? a.length > 0
    : typeof a === "string"
      ? !!a.trim()
      : false;
}
export function AnswerInput({
  question: q,
  value,
  onChange,
  disabled,
  evaluation,
}: {
  question: DreamQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  disabled: boolean;
  evaluation?: Evaluation;
}) {
  if (["multiple_choice", "multiple_select", "true_false"].includes(q.type)) {
    const multiple = q.type === "multiple_select";
    const options =
      q.type === "true_false" && !q.options.length
        ? ["Verdadero", "Falso"]
        : q.options;
    return (
      <fieldset className="test-options" disabled={disabled}>
        <legend className="visually-hidden">
          {multiple
            ? "Selecciona una o más respuestas"
            : "Selecciona una respuesta"}
        </legend>
        {options.map((option, index) => {
          const checked = multiple
            ? Array.isArray(value) && value.includes(option)
            : value === option;
          const correct =
            evaluation &&
            (Array.isArray(evaluation.correct_answer)
              ? evaluation.correct_answer.includes(option)
              : evaluation.correct_answer === option);
          const state = evaluation
            ? correct
              ? "correct"
              : checked
                ? "incorrect"
                : ""
            : checked
              ? "selected"
              : "";
          return (
            <label className={`test-option ${state}`} key={index}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={q.id}
                value={option}
                checked={checked}
                onChange={() => {
                  if (multiple) {
                    const list = Array.isArray(value) ? value : [];
                    onChange(
                      checked
                        ? list.filter((v) => v !== option)
                        : [...list, option],
                    );
                  } else onChange(option);
                }}
              />
              <span className="option-index">
                {state === "incorrect" ? (
                  <X size={15} />
                ) : correct || checked ? (
                  <Check size={15} />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>
              <Markdown content={option} />
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (q.type === "matching") {
    const answer =
      typeof value === "object" && !Array.isArray(value) ? value : {};
    return (
      <div className="matching-options">
        {q.metadata?.left?.map((left, i) => (
          <label key={i}>
            <Markdown content={left} />
            <select
              disabled={disabled}
              value={answer[left] || ""}
              onChange={(e) => onChange({ ...answer, [left]: e.target.value })}
              aria-label={`Relacionar ${left}`}
            >
              <option value="">Elige una relación</option>
              {q.metadata?.right?.map((right, j) => (
                <option value={right} key={j}>
                  {right}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }
  return (
    <label className="written-answer">
      <span>
        {q.type === "math"
          ? "Escribe tu razonamiento"
          : q.type === "numeric"
            ? "Tu respuesta numérica"
            : q.type === "fill_blank"
              ? "Completa el espacio"
              : "Tu respuesta"}
      </span>
      {q.type === "numeric" || q.type === "fill_blank" ? (
        <input
          disabled={disabled}
          inputMode={q.type === "numeric" ? "decimal" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      ) : (
        <textarea
          disabled={disabled}
          rows={5}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tómate tu tiempo…"
        />
      )}
    </label>
  );
}
export function TestExperience({ id }: { id: string }) {
  const router = useRouter();
  const { setPageTitle } = useConversations();
  const [test, setTest] = useState<DreamTest | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>(
    {},
  );
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    setPageTitle(result ? "Tu resultado" : null);
    return () => setPageTitle(null);
  }, [result, setPageTitle]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setAnswers({});
    setEvaluations({});
    setIndex(0);
    setError("");
    callDream<{ test: DreamTest }>(
      "test_get",
      { test_id: id },
      controller.signal,
    )
      .then((r) => setTest(r.test))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);
  async function check() {
    if (!test || busy) return;
    const q = test.questions[index];
    setBusy(true);
    setChecking(true);
    setError("");
    try {
      const r = await callDream<{ evaluation: Evaluation }>(
        "test_check_answer",
        { test_id: id, question_id: q.id, answer: answers[q.id] },
      );
      setEvaluations((s) => ({ ...s, [q.id]: r.evaluation }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }
  async function submit() {
    if (!test || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await callDream<{ result: TestResult }>("test_submit", {
        test_id: id,
        answers: test.questions.map((q) => ({
          question_id: q.id,
          answer: answers[q.id],
        })),
      });
      setResult(r.result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function practiceErrors() {
    if (!test || !result || busy) return;
    setBusy(true);
    try {
      const r = await callDream<{ test: { id: string } }>("test_generate", {
        context: `Practicar los errores de ${test.title}. Conceptos: ${result.practice.join(", ")}. Preguntas a reforzar: ${result.items
          .filter((i) => !i.is_correct)
          .map((i) => i.prompt)
          .join("; ")}`,
        mode: "practice",
        question_count: 5,
      });
      router.push(`/tests/${r.test.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="boot">
        <DreamActivity state="thinking" label="Abriendo el test" />
      </div>
    );
  if (!test)
    return (
      <div className="boot">
        <div className="status-page">
          <h1>No pudimos abrir este test</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="button-row">
            <button
              className="primary press"
              onClick={() => setRetry((s) => s + 1)}
            >
              Reintentar
            </button>
            <Link className="secondary press" href="/chat">
              Volver al chat
            </Link>
          </div>
        </div>
      </div>
    );
  if (result)
    return (
      <div className="test-page result-page">
        <div className="result-heading">
          <p className="eyebrow">{test.title}</p>
          <div>
            <h1>
              {result.score} <span>/ {result.total}</span>
            </h1>
            <p>
              {result.percentage}% · {result.score} respuestas correctas · Nota{" "}
              {((result.score / Math.max(result.total, 1)) * 10).toFixed(1)}/10
            </p>
          </div>
          <div>
            <h2>
              {result.percentage === 100
                ? "Todo encaja."
                : result.percentage >= 60
                  ? "Las ideas van tomando forma."
                  : "Ya sabes por dónde seguir."}
            </h2>
            <p>
              Cada intento te ayuda a ver lo que entiendes y lo que merece otra
              mirada.
            </p>
          </div>
        </div>
        <div className="result-stats">
          <div>
            <strong>{result.score}</strong>
            <span>Correctas</span>
          </div>
          <div>
            <strong>{result.total - result.score}</strong>
            <span>Por revisar</span>
          </div>
          <div>
            <strong>{result.percentage}%</strong>
            <span>Aciertos</span>
          </div>
        </div>
        <div className="result-concepts">
          {result.mastered.length > 0 && (
            <section>
              <h3>Lo que salió bien</h3>
              <ul>
                {result.mastered.map((c) => (
                  <li key={c}>
                    <Check size={15} />
                    {c}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {result.practice.length > 0 && (
            <section>
              <h3>Una segunda mirada</h3>
              <ul>
                {result.practice.map((c) => (
                  <li key={c}>
                    <RotateCcw size={15} />
                    {c}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="result-actions">
          {result.items.some((i) => !i.is_correct) && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void practiceErrors()}
            >
              {busy ? "Preparando…" : "Practicar mis errores"}
            </button>
          )}
          <Link className="secondary press" href="/chat">
            Volver a Dream
          </Link>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <section className="result-review">
          <h2>Una mirada a tus respuestas</h2>
          {result.items.map((item, i) => (
            <details key={item.question_id}>
              <summary>
                <span className="review-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item.prompt}</span>
                <span className={item.is_correct ? "correct-text" : "muted"}>
                  {item.is_correct ? "Correcto" : "Reforzar"}
                </span>
              </summary>
              <div>
                <p className="eyebrow">Tu respuesta</p>
                <p>
                  {typeof item.answer === "string"
                    ? item.answer
                    : JSON.stringify(item.answer)}
                </p>
                {!item.is_correct && (
                  <>
                    <p className="eyebrow">Referencia</p>
                    <p>
                      {typeof item.correct_answer === "string"
                        ? item.correct_answer
                        : JSON.stringify(item.correct_answer)}
                    </p>
                  </>
                )}
                <Markdown content={item.feedback} />
              </div>
            </details>
          ))}
        </section>
      </div>
    );
  const question = test.questions[index];
  if (!question)
    return (
      <div className="boot">
        <div className="status-page">
          <h1>Este test no tiene preguntas disponibles</h1>
          <Link className="primary press" href="/chat">
            Volver al chat
          </Link>
        </div>
      </div>
    );
  const evaluation = evaluations[question.id];
  const allAnswered = test.questions.every((q) => hasAnswer(q, answers[q.id]));
  return (
    <div className="test-page">
      <header className="test-topline">
        <Link className="exit press" href="/chat">
          Salir
        </Link>
        <div className="test-progress">
          <p>
            Pregunta {index + 1} de {test.questions.length}
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progreso del test"
            aria-valuenow={index + 1}
            aria-valuemin={0}
            aria-valuemax={test.questions.length}
          >
            <i
              style={{
                width: `${((index + 1) / test.questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <span className="spacer" aria-hidden="true" />
      </header>
      <div className="result-heading">
        <p className="test-meta">
          {test.mode === "exam" ? "Examen" : "Práctica"} · {test.subject} ·{" "}
          {test.topic}
        </p>
        <h1 className="visually-hidden">{test.title}</h1>
      </div>
      <section className="question" key={question.id}>
        <div className="question-prompt">
          <Markdown content={question.prompt} />
        </div>
        {question.type === "multiple_select" && (
          <p className="muted">Puedes elegir varias respuestas.</p>
        )}
        <AnswerInput
          question={question}
          value={answers[question.id]}
          disabled={busy || !!evaluation}
          evaluation={evaluation}
          onChange={(v) => setAnswers((s) => ({ ...s, [question.id]: v }))}
        />
        {busy && !evaluation && checking && (
          <DreamActivity state="thinking" label="Comprobando tu respuesta" />
        )}
        {evaluation && (
          <div
            className={`answer-feedback ${evaluation.is_correct ? "correct" : "incorrect"}`}
            role="status"
          >
            <strong>
              {evaluation.is_correct ? <Check size={22} /> : <X size={22} />}
              {evaluation.is_correct
                ? "Bien pensado."
                : "Vamos a darle otra mirada."}
            </strong>
            <Markdown content={evaluation.feedback} />
            {!evaluation.is_correct && (
              <button
                className="text-button"
                onClick={() =>
                  setEvaluations((s) => {
                    const next = { ...s };
                    delete next[question.id];
                    return next;
                  })
                }
              >
                Volver a intentarlo
              </button>
            )}
          </div>
        )}
      </section>
      <div className="test-navigation">
        <button
          className="text-button"
          disabled={index === 0 || busy}
          onClick={() => setIndex((s) => s - 1)}
        >
          <ArrowLeft size={17} />
          Anterior
        </button>
        <div>
          {test.mode === "practice" && !evaluation && (
            <button
              className="primary"
              disabled={busy || !hasAnswer(question, answers[question.id])}
              onClick={() => void check()}
            >
              {busy ? "Comprobando…" : "Comprobar respuesta"}
            </button>
          )}
          {index < test.questions.length - 1 ? (
            <button
              className={
                test.mode === "practice" && !evaluation
                  ? "text-button"
                  : "primary"
              }
              disabled={busy || !hasAnswer(question, answers[question.id])}
              onClick={() => setIndex((s) => s + 1)}
            >
              Siguiente
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !allAnswered}
              onClick={() => void submit()}
            >
              {busy ? "Corrigiendo…" : "Terminar y ver resultado"}
            </button>
          )}
        </div>
      </div>
      {!allAnswered && index === test.questions.length - 1 && (
        <p className="muted">Responde todas las preguntas para terminar.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="test-note">
        {test.mode === "exam"
          ? "Las respuestas se corrigen al terminar. Concéntrate en una idea cada vez."
          : "Sin prisa. Lo importante es entender lo que hay detrás de cada respuesta."}
      </p>
    </div>
  );
}
