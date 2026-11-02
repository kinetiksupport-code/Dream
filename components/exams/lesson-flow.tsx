"use client";
// La lección de la ruta (prompt de la ruta, 0.6 y Bloques 1-3; Claude Design
// PantallaGenerarMovil, PantallaLeerMovil y PantallaTestMovil): un flujo
// lineal a pantalla completa con UNA barra de progreso: preparando → secciones
// de lectura con su mini-pregunta V/F → test de la lección (6-8) → resultados.
// El servidor genera, corrige y guarda; aquí solo se pinta. Nunca se ve una
// respuesta antes de contestar.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, FileText, X as XIcon } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import {
  answerQuiz,
  finishQuiz,
  getLesson,
  getPretest,
  getQuiz,
  saveProgress,
  type LessonSection,
  type QuizCheck,
  type QuizQuestion,
  type QuizResult,
} from "@/lib/study-api";
import { BottomSheet } from "../bottom-sheet";
import { DreamActivity } from "../dream-mark";
import { Markdown } from "../markdown";
import { PlayWhileWaiting } from "../games/play-while-waiting";
import { StepFrame } from "./step-frame";
import sf from "./step-frame.module.css";
import s from "./lesson-flow.module.css";

type Phase =
  | { kind: "loading" }
  | { kind: "generating"; step: number }
  | { kind: "limit"; used: number; cap: number }
  | { kind: "failed"; message: string }
  | { kind: "pretest"; question: number }
  | { kind: "read"; section: number }
  | { kind: "quiz"; question: number }
  | { kind: "results"; result: QuizResult };

const STEPS = ["Pidiendo tu lección", "Escribiendo la lectura, las preguntas y las tarjetas", "Comprobando que todo cuadre"];
const POLL_MS = 4000;

function Feedback({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={s.feedback} data-ok={ok || undefined} role="status">
      <span className={s.feedbackIcon} aria-hidden="true">
        {ok ? <Check size={18} /> : <XIcon size={18} />}
      </span>
      <div>
        <strong>{ok ? "¡Correcto!" : "No es así"}</strong>
        {children}
      </div>
    </div>
  );
}

export function LessonFlow({ examId, unitId, title, known = false }: { examId: string; unitId: string; title: string; known?: boolean }) {
  const ids = { exam_id: examId, unit_id: unitId };
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [sections, setSections] = useState<LessonSection[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [pretest, setPretest] = useState<QuizQuestion[]>([]);
  const [check, setCheck] = useState<{ correct: boolean; explanation: string; isTrue?: boolean } | null>(null);
  const [quizCheck, setQuizCheck] = useState<QuizCheck | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | boolean>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openWhy, setOpenWhy] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [felt, setFelt] = useState<"facil" | "bien" | "dificil" | null>(null);
  const [playing, setPlaying] = useState(false);
  const started = useRef(Date.now());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  async function load() {
    setError("");
    setPhase({ kind: "generating", step: 1 });
    try {
      const r = await getLesson(ids);
      if (!alive.current) return;
      if (r.status === "ready") {
        setSections(r.reading.sections);
        setSources(r.reading.sources);
        const at = Math.min(r.progress?.reading_section ?? 0, r.reading.sections.length);
        // «Seguir donde lo dejaste»: si ya leyó todo, va al test.
        // «Ya me sé este tema» (Bloque 6.8): directo al test, sin leer.
        if (known || at >= r.reading.sections.length) await startQuiz();
        else if (at === 0 && !r.progress) {
          // Pretest opcional (Bloque 2): solo la primera vez, y se puede saltar.
          const pre = await getPretest(ids).catch(() => ({ questions: [] as QuizQuestion[] }));
          if (!alive.current) return;
          setPretest(pre.questions);
          setPhase(pre.questions.length ? { kind: "pretest", question: 0 } : { kind: "read", section: 0 });
        } else setPhase({ kind: "read", section: at });
      } else if (r.status === "generating") {
        // Otra pestaña la está preparando: se vuelve a mirar en unos segundos.
        setPhase({ kind: "generating", step: 1 });
        window.setTimeout(() => alive.current && void load(), POLL_MS);
      } else if (r.status === "limit") setPhase({ kind: "limit", used: r.used, cap: r.cap });
      else setPhase({ kind: "failed", message: r.message });
    } catch (e) {
      if (alive.current) setPhase({ kind: "failed", message: errorMessage(e) });
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, unitId]);

  async function startQuiz() {
    const { questions: qs } = await getQuiz(ids);
    setQuestions(qs);
    setAnswers({});
    setQuizCheck(null);
    setDraft("");
    started.current = Date.now();
    setPhase({ kind: "quiz", question: 0 });
  }
  async function answerCheck(section: number, answer: boolean) {
    setBusy(true);
    try {
      const r = await saveProgress(ids, { check: { section, answer } });
      if (r.check) setCheck({ correct: r.check.correct, explanation: r.check.explanation, isTrue: r.check.is_true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function nextSection(section: number) {
    setCheck(null);
    setOpenWhy(false);
    const next = section + 1;
    void saveProgress(ids, { reading_section: next }).catch(() => undefined);
    if (next < sections.length) setPhase({ kind: "read", section: next });
    else {
      setBusy(true);
      try {
        await startQuiz();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }
  }
  async function answerQuestion(q: QuizQuestion, answer: string | boolean) {
    if (busy || quizCheck) return; // botones bloqueados tras pulsar (0.8 · 5)
    setBusy(true);
    try {
      const r = await answerQuiz(ids, q.index, answer);
      setAnswers((a) => ({ ...a, [q.index]: answer }));
      setQuizCheck(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function nextQuestion(i: number) {
    setQuizCheck(null);
    setDraft("");
    if (i + 1 < questions.length) return setPhase({ kind: "quiz", question: i + 1 });
    setBusy(true);
    try {
      const result = await finishQuiz(ids, answers, known);
      setPhase({ kind: "results", result });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const leave = () => router.push(`/exams/${examId}/ruta`);
  const tutor = `/exams/${examId}/study/${unitId}?tutor=1`;
  const total = sections.length + (questions.length || 7);

  // ── Preparando (Orb y pasos reales) ──
  if (phase.kind === "loading" || phase.kind === "generating" || playing)
    return (
      <div className={`${sf.frame} ${s.dark}`} data-testid="leccion-preparando">
        <header className={sf.top}>
          <Link className={`${sf.close} press`} href={`/exams/${examId}/ruta`} aria-label="Volver a la ruta">
            <XIcon size={20} aria-hidden="true" />
          </Link>
        </header>
        <main className={s.prep} aria-busy={phase.kind !== "read" || undefined}>
          <DreamActivity state="thinking" label="Creando tu lección" />
          <h1 className={s.prepTitle}>Creando tu lección…</h1>
          <p className={s.prepSub}>{title}</p>
          <ol className={s.steps}>
            {STEPS.map((t, i) => {
              const step = phase.kind === "generating" ? phase.step : STEPS.length;
              const state = i < step ? "done" : i === step ? "now" : "next";
              return (
                <li key={t} data-state={state}>
                  <span className={s.dot} aria-hidden="true">
                    {state === "done" && <Check size={12} />}
                  </span>
                  {t}
                  {state === "now" && <span className="visually-hidden"> (ahora)</span>}
                </li>
              );
            })}
          </ol>
          <PlayWhileWaiting
            expectedMs={20000}
            ready={phase.kind !== "loading" && phase.kind !== "generating"}
            readyText="Tu lección está lista"
            startText="Empezar"
            onOpenChange={setPlaying}
            onStart={() => setPlaying(false)}
          />
        </main>
      </div>
    );

  if (phase.kind === "limit" || phase.kind === "failed")
    return (
      <div className={sf.frame} data-testid="leccion-aviso">
        <header className={sf.top}>
          <Link className={`${sf.close} press`} href={`/exams/${examId}/ruta`} aria-label="Volver a la ruta">
            <XIcon size={20} aria-hidden="true" />
          </Link>
        </header>
        <main className={s.notice}>
          <h1 className={sf.prompt}>{phase.kind === "limit" ? "Hoy ya has creado tus lecciones" : "No hemos podido crear la lección"}</h1>
          <p>
            {phase.kind === "limit"
              ? `Hoy llevas ${phase.used} de ${phase.cap}. Mañana tienes más; mientras, repasa tus tarjetas o vuelve a una lección hecha.`
              : "Se cortó mientras la preparábamos. Tus apuntes están a salvo."}
          </p>
        </main>
        <footer className={sf.foot}>
          <Link className={`secondary press ${sf.small}`} href={`/exams/${examId}/ruta`}>
            Volver a la ruta
          </Link>
          {phase.kind === "failed" && (
            <button className="primary press" onClick={() => void load()}>
              Reintentar
            </button>
          )}
        </footer>
      </div>
    );

  // ── Resultados ──
  if (phase.kind === "results") {
    const r = phase.result;
    const minutes = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    return (
      <div className={sf.frame} data-testid="leccion-resultados">
        <main className={s.results} data-mastered={r.mastered || undefined}>
          <p className={s.big}>
            <span className="num">{r.right}</span>/<span className="num">{r.total}</span>
          </p>
          <h1 className={s.resultTitle}>{r.mastered ? "Dominado" : known ? "Mejor haz la lección" : "Repasa tus fallos"}</h1>
          <p className={s.resultText}>
            {known && !r.mastered
              ? "Aún no lo dominas, y no pasa nada: la lección te lo explica paso a paso."
              : r.mastered
              ? "Te lo sabes. Las tarjetas de esta lección volverán cuando toque."
              : `Ya tienes ${r.mistake_cards} ${r.mistake_cards === 1 ? "tarjeta" : "tarjetas"} con tus fallos. Mañana podrás repetir el test con otras preguntas.`}
          </p>
          <dl className={s.facts}>
            <div>
              <dt>Precisión</dt>
              <dd className="num">{r.pct} %</dd>
            </div>
            <div>
              <dt>Tiempo</dt>
              <dd className="num">{minutes} min</dd>
            </div>
          </dl>
          <div className={s.chips} role="group" aria-label="¿Cómo lo has notado?">
            {felt ? (
              <p className={s.thanks} role="status">
                <Check size={16} aria-hidden="true" /> Gracias
              </p>
            ) : (
              (["facil", "bien", "dificil"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`secondary press ${s.chip}`}
                  onClick={() => {
                    setFelt(f);
                    void saveProgress(ids, { felt_difficulty: f }).catch(() => undefined);
                  }}
                >
                  {f === "facil" ? "Fácil" : f === "bien" ? "Bien" : "Difícil"}
                </button>
              ))
            )}
          </div>
        </main>
        <footer className={sf.foot}>
          <Link className={`secondary press ${sf.small}`} href={tutor}>
            Pregúntale a Dream
          </Link>
          {known && !r.mastered ? (
            // Carga completa: la lección se abre desde el principio, ya sin «Ya me sé este tema».
            <a className="primary press" href={`/exams/${examId}/study/${unitId}`}>
              Hacer la lección
            </a>
          ) : (
            <Link className="primary press" href={`/exams/${examId}/ruta${r.completed ? `?hecho=${unitId}` : ""}`}>
              Continuar
            </Link>
          )}
        </footer>
      </div>
    );
  }

  // ── Pretest: no puntúa ni cuenta para el dominio ──
  if (phase.kind === "pretest") {
    const pq = pretest[phase.question];
    const picked = answers[pq.index];
    const skip = () => {
      setQuizCheck(null);
      setAnswers({});
      setPhase({ kind: "read", section: 0 });
    };
    return (
      <StepFrame
        label="Antes de leer"
        position={phase.question + 1}
        total={pretest.length}
        remaining={null}
        onExit={leave}
        footer={
          quizCheck ? (
            <button
              className="primary press"
              onClick={() => {
                setQuizCheck(null);
                if (phase.question + 1 < pretest.length) setPhase({ kind: "pretest", question: phase.question + 1 });
                else skip();
              }}
            >
              {phase.question + 1 < pretest.length ? "Siguiente" : "Empezar a leer"}
            </button>
          ) : (
            <button className={`secondary press ${sf.small}`} onClick={skip}>
              Saltar
            </button>
          )
        }
      >
        <section className={s.question} key={pq.index} data-testid="leccion-pretest">
          <p className={s.checkLabel}>Antes de leer. Es normal fallarlas: así sabes qué buscar.</p>
          <h1 className={sf.prompt}>
            <Markdown content={pq.prompt} />
          </h1>
          <div className={s.options} role="group" aria-label="Respuestas">
            {(pq.type === "tf" ? ["Falso", "Verdadero"] : pq.options ?? []).map((label) => {
              const value = pq.type === "tf" ? label === "Verdadero" : label;
              const right = quizCheck && quizCheck.correct_answer === value;
              const mine = picked === value;
              return (
                <button
                  key={label}
                  type="button"
                  className={`${s.option} press`}
                  data-picked={mine || undefined}
                  data-right={right || undefined}
                  data-wrong={(mine && quizCheck && !quizCheck.correct) || undefined}
                  disabled={busy || !!quizCheck}
                  onClick={() => void answerQuestion(pq, value)}
                >
                  {label}
                  {right && <Check size={18} aria-label="Respuesta correcta" />}
                  {mine && quizCheck && !quizCheck.correct && <XIcon size={18} aria-label="Tu respuesta" />}
                </button>
              );
            })}
          </div>
          {quizCheck && (
            <Feedback ok={quizCheck.correct}>
              <p>{quizCheck.correct ? "Ya sabes algo de esto." : "Lo verás en la lectura."}</p>
            </Feedback>
          )}
        </section>
      </StepFrame>
    );
  }

  // ── Leer ──
  if (phase.kind === "read") {
    const sec = sections[phase.section];
    return (
      <>
        <StepFrame
          label="Lección"
          position={phase.section + 1}
          total={total}
          remaining={null}
          onExit={leave}
          extra={
            <button type="button" className={`${s.sources} press`} onClick={() => setShowSources(true)}>
              <FileText size={16} aria-hidden="true" /> {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
            </button>
          }
          footer={
            check ? (
              <>
                <Link className={`secondary press ${sf.small}`} href={tutor}>
                  Explícame por qué
                </Link>
                <button className="primary press" onClick={() => void nextSection(phase.section)} disabled={busy}>
                  Continuar
                </button>
              </>
            ) : (
              <div className={s.tf} role="group" aria-label="¿Verdadero o falso?">
                <button className="secondary press" disabled={busy} onClick={() => void answerCheck(phase.section, false)}>
                  Falso
                </button>
                <button className="secondary press" disabled={busy} onClick={() => void answerCheck(phase.section, true)}>
                  Verdadero
                </button>
              </div>
            )
          }
        >
          <article className={s.section} key={phase.section}>
            <h1 className={s.sectionTitle}>{sec.title}</h1>
            <div className={s.body}>
              <Markdown content={sec.body_markdown} />
            </div>
            {sec.why_it_matters && (
              <div className={s.why}>
                <button type="button" className={s.whyToggle} aria-expanded={openWhy} onClick={() => setOpenWhy((v) => !v)}>
                  ¿Por qué es importante? <ChevronDown size={16} aria-hidden="true" />
                </button>
                {openWhy && <p>{sec.why_it_matters}</p>}
              </div>
            )}
            <div className={s.checkCard} data-state={check ? (check.correct ? "ok" : "ko") : undefined}>
              <p className={s.checkLabel}>¿Verdadero o falso?</p>
              <p className={s.statement}>{sec.check.statement}</p>
            </div>
            {check && (
              <Feedback ok={check.correct}>
                <p>
                  Es {check.isTrue ? "verdadero" : "falso"}. {check.explanation}
                </p>
              </Feedback>
            )}
            {error && <p className={sf.saveError} role="alert">{error}</p>}
          </article>
        </StepFrame>
        {showSources && (
          <BottomSheet labelledBy="fuentes-leccion" onClose={() => setShowSources(false)}>
            <h2 id="fuentes-leccion">Fuentes</h2>
            <ul className={s.sourceList}>
              {sources.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
            <p className={s.note}>Contenido generado por IA a partir de tus apuntes. Puede equivocarse: contrasta lo importante.</p>
            <div className="modal-actions">
              <button className="secondary press" onClick={() => setShowSources(false)}>
                Cerrar
              </button>
            </div>
          </BottomSheet>
        )}
      </>
    );
  }

  // ── Test de la lección ──
  const q = questions[phase.question];
  const chosen = answers[q.index];
  return (
    <StepFrame
      label="Test"
      position={sections.length + phase.question + 1}
      total={total}
      remaining={null}
      onExit={leave}
      footer={
        quizCheck ? (
          <>
            <Link className={`secondary press ${sf.small}`} href={tutor}>
              Explícame por qué
            </Link>
            <button className="primary press" disabled={busy} aria-busy={busy || undefined} onClick={() => void nextQuestion(phase.question)}>
              {phase.question + 1 < questions.length ? "Continuar" : "Ver resultados"}
            </button>
          </>
        ) : q.type === "written" ? (
          <button className="primary press" disabled={busy || !draft.trim()} onClick={() => void answerQuestion(q, draft)}>
            Comprobar
          </button>
        ) : (
          <span className={s.hint}>Elige una respuesta</span>
        )
      }
    >
      <section className={s.question} key={q.index}>
        <h1 className={sf.prompt}>
          <Markdown content={q.prompt} />
        </h1>
        {q.type === "written" ? (
          <label className={s.written}>
            <span>Tu respuesta</span>
            <textarea value={draft} maxLength={1500} disabled={!!quizCheck} onChange={(e) => setDraft(e.target.value)} rows={6} />
            <small className="num">{draft.trim() ? draft.trim().split(/\s+/).length : 0} palabras</small>
          </label>
        ) : (
          <div className={s.options} role="group" aria-label="Respuestas">
            {(q.type === "tf" ? ["Falso", "Verdadero"] : q.options ?? []).map((label) => {
              const value = q.type === "tf" ? label === "Verdadero" : label;
              const picked = chosen === value;
              const right = quizCheck && quizCheck.correct_answer === value;
              return (
                <button
                  key={label}
                  type="button"
                  className={`${s.option} press`}
                  data-picked={picked || undefined}
                  data-right={right || undefined}
                  data-wrong={(picked && quizCheck && !quizCheck.correct) || undefined}
                  disabled={busy || !!quizCheck}
                  onClick={() => void answerQuestion(q, value)}
                >
                  {label}
                  {right && <Check size={18} aria-label="Respuesta correcta" />}
                  {picked && quizCheck && !quizCheck.correct && <XIcon size={18} aria-label="Tu respuesta" />}
                </button>
              );
            })}
          </div>
        )}
        {quizCheck && (
          <Feedback ok={quizCheck.correct}>
            {q.type === "written" && quizCheck.rubric?.length ? (
              <p>Ideas clave: {quizCheck.rubric.join(" · ")}.</p>
            ) : (
              !quizCheck.correct && <p>La correcta es «{q.type === "tf" ? (quizCheck.correct_answer ? "Verdadero" : "Falso") : String(quizCheck.correct_answer)}».</p>
            )}
            {quizCheck.explanation && <p>{quizCheck.explanation}</p>}
          </Feedback>
        )}
        {error && <p className={sf.saveError} role="alert">{error}</p>}
      </section>
    </StepFrame>
  );
}
