"use client";
// La lección de la ruta «tipo Knowunity» (prompt de la ruta, 0.11 y 0.12;
// Bloques 1-3): preparando → tarjetas «Qué saber» cortas (Continuar / Saltar;
// en la última, «Empezar test» con flecha para volver) → test con la Orb, en
// el que van mezcladas las V/F de las tarjetas y las preguntas del banco, cada
// una con «Comprobar» y la hoja de corrección de color → «Repasemos las
// preguntas que fallaste» (vuelven con «ERROR ANTERIOR» hasta acertarlas) →
// resultados (acierto y tiempo; Continuar y Repetir).
// El servidor genera, corrige y guarda; aquí solo se pinta. Nunca se ve una
// respuesta antes de contestar. La nota sale del primer intento.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, FileText, X as XIcon } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import {
  answerQuiz,
  finishQuiz,
  getLesson,
  getPretest,
  getQuiz,
  rateQuestion,
  saveProgress,
  type LessonSection,
  type QuizQuestion,
  type QuizResult,
} from "@/lib/study-api";
import { BottomSheet } from "../bottom-sheet";
import { DreamActivity } from "../dream-mark";
import { Markdown } from "../markdown";
import { Orb } from "../orb";
import { PlayWhileWaiting } from "../games/play-while-waiting";
import { mixItems, type Item } from "@/lib/lesson-items";
import { StepFrame } from "./step-frame";
import { CheckButton, CorrectionSheet, QuizQuestion as QuestionView, type Answer, type Verdict } from "./quiz-question";
import { WhyPanel } from "./why-panel";
import sf from "./step-frame.module.css";
import s from "./lesson-flow.module.css";

type Phase =
  | { kind: "loading" }
  | { kind: "generating"; step: number }
  | { kind: "limit"; used: number; cap: number }
  | { kind: "failed"; message: string }
  | { kind: "pretest"; question: number }
  | { kind: "read"; section: number }
  | { kind: "quiz"; at: number }
  | { kind: "review" }
  | { kind: "results"; result: QuizResult };

interface Checked extends Verdict {
  explanation: string;
  rubric?: string[];
}

const TF = [
  { label: "Verdadero", value: true },
  { label: "Falso", value: false },
];
const clock = (ms: number) => {
  const t = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const STEPS = ["Pidiendo tu lección", "Escribiendo la lectura, las preguntas y las tarjetas", "Comprobando que todo cuadre"];
const POLL_MS = 4000;

export function LessonFlow({
  examId,
  unitId,
  title,
  known = false,
  conversationId = null,
}: {
  examId: string;
  unitId: string;
  title: string;
  known?: boolean;
  /** Conversación de la unidad, para el panel «¿Por qué?». */
  conversationId?: string | null;
}) {
  const ids = { exam_id: examId, unit_id: unitId };
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [sections, setSections] = useState<LessonSection[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [pretest, setPretest] = useState<QuizQuestion[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [missed, setMissed] = useState<QuizQuestion[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [picked, setPicked] = useState<Answer | null>(null);
  const [verdict, setVerdict] = useState<Checked | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | boolean>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openWhy, setOpenWhy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [round, setRound] = useState(0);
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
        if (known || at >= r.reading.sections.length) await startQuiz(known ? 0 : r.reading.sections.length);
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

  /** Empieza el test: `withChecks` = cuántas V/F de las tarjetas van mezcladas (0 sin leer). */
  async function startQuiz(withChecks = sections.length, nextRound = 0) {
    const { questions: qs } = await getQuiz(ids, nextRound);
    if (!alive.current) return;
    setItems(mixItems(withChecks, qs));
    setAnswers({});
    setMissed([]);
    setReviewing(false);
    setPicked(null);
    setVerdict(null);
    setDraft("");
    started.current = Date.now();
    setPhase({ kind: "quiz", at: 0 });
  }
  async function begin() {
    setBusy(true);
    try {
      void saveProgress(ids, { reading_section: sections.length }).catch(() => undefined);
      await startQuiz();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function goSection(next: number) {
    setOpenWhy(false);
    void saveProgress(ids, { reading_section: next }).catch(() => undefined);
    setPhase({ kind: "read", section: next });
  }
  /** «Comprobar» (0.12 · 4): bloquea las respuestas y pide la corrección. */
  async function check(item: Item) {
    const value: Answer | null = item.kind === "quiz" && item.q.type === "written" ? draft : picked;
    if (busy || verdict || value === null || value === "") return;
    setBusy(true);
    setError("");
    try {
      if (item.kind === "check") {
        const r = await saveProgress(ids, { check: { section: item.section, answer: value === true } });
        if (r.check) setVerdict({ correct: r.check.correct, correctAnswer: !!r.check.is_true, explanation: r.check.explanation });
      } else {
        const r = await answerQuiz(ids, item.q.index, value);
        // La nota sale del primer intento; la ronda de repaso no la cambia.
        if (!item.retry) setAnswers((a) => ({ ...a, [item.q.index]: value }));
        setVerdict({ correct: r.correct, correctAnswer: r.correct_answer, explanation: r.explanation, rubric: r.rubric });
        if (!r.correct && item.q.type !== "written") {
          if (reviewing) setItems((list) => [...list, { kind: "quiz", q: item.q, retry: true }]);
          else setMissed((m) => [...m, item.q]);
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
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
  /** «Continuar»/«Entendido»: la hoja se va y llega la siguiente casi a la vez (0.12 · 7). */
  function advance(at: number) {
    setVerdict(null);
    setPicked(null);
    setDraft("");
    setOpenWhy(false);
    setWhy(null);
    if (at + 1 < items.length) return setPhase({ kind: "quiz", at: at + 1 });
    if (!reviewing && missed.length) return setPhase({ kind: "review" });
    void finish();
  }
  const onPick = useCallback((a: Answer) => setPicked(a), []);
  const leave = () => router.push(`/exams/${examId}/ruta`);

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

  // ── Resultados (0.11 · 8): dos datos útiles, «Continuar» y «Repetir» ──
  if (phase.kind === "results") {
    const r = phase.result;
    return (
      <div className={sf.frame} data-testid="leccion-resultados">
        <main className={s.results} data-mastered={r.mastered || undefined}>
          <span className={s.resultOrb} aria-hidden="true">
            <Orb size={88} breathing />
          </span>
          <h1 className={s.resultTitle}>{r.mastered ? "¡Dominado!" : known ? "Mejor haz la lección" : "Casi"}</h1>
          <ul className={s.pills} aria-label="Tu resultado">
            <li className={s.pill} data-kind="score">
              <span className={s.pillLabel}>Aciertos</span>
              <strong className="num">
                {r.right}/{r.total}
              </strong>
            </li>
            <li className={s.pill} data-kind="time">
              <span className={s.pillLabel}>Tiempo</span>
              <strong className="num">{clock(Date.now() - started.current)}</strong>
            </li>
          </ul>
          <p className={s.resultText} role="status">
            {known && !r.mastered
              ? "Aún no lo dominas, y no pasa nada: la lección te lo explica paso a paso."
              : r.mastered
              ? "Te lo sabes. Las tarjetas de esta lección volverán cuando toque."
              : `Repasa tus fallos y vuelve a intentarlo: ya tienes ${r.mistake_cards} ${r.mistake_cards === 1 ? "tarjeta" : "tarjetas"} con ellos.`}
          </p>
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
          {known && !r.mastered ? (
            <>
              <Link className={`secondary press ${sf.small}`} href={`/exams/${examId}/ruta`}>
                Volver
              </Link>
              {/* Carga completa: la lección se abre desde el principio, ya sin «Ya me sé este tema». */}
              <a className="primary press" href={`/exams/${examId}/study/${unitId}`}>
                Hacer la lección
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`secondary press ${sf.small}`}
                disabled={busy}
                onClick={() => {
                  const next = round + 1;
                  setRound(next);
                  setBusy(true);
                  void startQuiz(0, next)
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Repetir
              </button>
              <Link className="primary press" href={`/exams/${examId}/ruta${r.completed ? `?hecho=${unitId}` : ""}`}>
                Continuar
              </Link>
            </>
          )}
        </footer>
        {error && <p className={sf.saveError} role="alert">{error}</p>}
      </div>
    );
  }

  // ── «Repasemos las preguntas que fallaste» (0.11 · 7) ──
  if (phase.kind === "review")
    return (
      <div className={sf.frame} data-testid="leccion-repaso">
        <main className={s.results}>
          <span className={s.resultOrb} aria-hidden="true">
            <Orb size={88} breathing />
          </span>
          <h1 className={s.resultTitle}>¡Repasemos las preguntas que fallaste!</h1>
          <p className={s.resultText}>
            {missed.length === 1 ? "Es solo una" : `Son ${missed.length}`}. Vuelven hasta que las aciertes; tu nota no cambia.
          </p>
        </main>
        <footer className={sf.foot}>
          <button
            type="button"
            className="primary press"
            autoFocus
            onClick={() => {
              setItems(missed.map((q) => ({ kind: "quiz", q, retry: true })));
              setReviewing(true);
              setPhase({ kind: "quiz", at: 0 });
            }}
          >
            Continuar
          </button>
        </footer>
      </div>
    );

  // ── Pretest: no puntúa ni cuenta para el dominio ──
  if (phase.kind === "pretest") {
    const pq = pretest[phase.question];
    const skip = () => {
      setVerdict(null);
      setPicked(null);
      setPhase({ kind: "read", section: 0 });
    };
    const nextPre = () => {
      setVerdict(null);
      setPicked(null);
      if (phase.question + 1 < pretest.length) setPhase({ kind: "pretest", question: phase.question + 1 });
      else skip();
    };
    return (
      <StepFrame
        label="Antes de leer"
        position={phase.question + 1}
        total={pretest.length}
        remaining={null}
        showCounter={false}
        onExit={leave}
        footer={
          verdict ? null : (
            <>
              <button className={`secondary press ${sf.small}`} onClick={skip}>
                Saltar
              </button>
              <CheckButton
                ready={picked !== null}
                busy={busy}
                onCheck={() => {
                  if (picked === null) return;
                  setBusy(true);
                  void answerQuiz(ids, pq.index, picked)
                    .then((r) => setVerdict({ correct: r.correct, correctAnswer: r.correct_answer, explanation: "" }))
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              />
            </>
          )
        }
      >
        <div data-testid="leccion-pretest" key={pq.index}>
          <QuestionView
            eyebrow="Antes de leer · es normal fallarlas"
            prompt={pq.prompt}
            options={pq.type === "tf" ? TF : (pq.options ?? []).map((o) => ({ label: o, value: o }))}
            picked={picked}
            onPick={onPick}
            verdict={verdict}
          />
        </div>
        {verdict && (
          <CorrectionSheet ok={verdict.correct} title={verdict.correct ? "¡Ya sabes algo de esto!" : "Lo verás en la lectura"} onNext={nextPre} nextLabel={phase.question + 1 < pretest.length ? "Siguiente" : "Empezar a leer"} />
        )}
        {error && <p className={sf.saveError} role="alert">{error}</p>}
      </StepFrame>
    );
  }

  // ── Leer: tarjetas «Qué saber» (0.11 · 3 y 0.12 · 10) ──
  if (phase.kind === "read") {
    const sec = sections[phase.section];
    const last = phase.section + 1 >= sections.length;
    return (
      <>
        <StepFrame
          label="Lección"
          position={phase.section + 1}
          total={sections.length}
          remaining={null}
          showBar={false}
          showCounter={false}
          onExit={leave}
          extra={
            <button type="button" className={`${s.sources} press`} onClick={() => setShowSources(true)}>
              <FileText size={16} aria-hidden="true" /> {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
            </button>
          }
          footer={
            <>
              {/* Mismo sitio: «Saltar» y, en la última tarjeta, la flecha para volver a leer. */}
              {last && phase.section > 0 ? (
                <button type="button" className={`secondary press ${s.square}`} aria-label="Volver a la tarjeta anterior" onClick={() => goSection(phase.section - 1)}>
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              ) : !last ? (
                <button type="button" className={`secondary press ${sf.small}`} onClick={() => goSection(sections.length - 1)}>
                  Saltar
                </button>
              ) : null}
              {/* El botón no se mueve: solo cambia el texto (0.12 · 10). */}
              <button className="primary press" disabled={busy} aria-busy={busy || undefined} onClick={() => (last ? void begin() : goSection(phase.section + 1))}>
                {last ? "Empezar test" : "Continuar"}
              </button>
            </>
          }
        >
          <article className={s.section} key={phase.section} data-testid="tarjeta-que-saber">
            <p className={s.cardEyebrow}>
              Qué saber · <span className="num">{phase.section + 1}</span>/<span className="num">{sections.length}</span>
            </p>
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

  // ── Test: la pregunta con la Orb y la hoja de corrección (0.11 · 4-6) ──
  const item = items[phase.at];
  const isCheck = item.kind === "check";
  const prompt = isCheck ? sections[item.section].check.statement : item.q.prompt;
  const options = isCheck
    ? TF
    : item.q.type === "tf"
    ? TF
    : item.q.type === "mcq"
    ? (item.q.options ?? []).map((o) => ({ label: o, value: o }))
    : null;
  const label = (a: Answer) => (typeof a === "boolean" ? (a ? "Verdadero" : "Falso") : a);
  const whyDraft = () => {
    if (!verdict) return "";
    const mine = isCheck || item.q.type !== "written" ? picked : draft;
    return `En la pregunta «${prompt.replace(/\s+/g, " ").slice(0, 200)}»${
      mine !== null && !verdict.correct && !(item.kind === "quiz" && item.q.type === "written") ? ` contesté «${label(mine)}» y` : ""
    } la respuesta es «${label(verdict.correctAnswer)}». ¿Por qué?`;
  };
  return (
    <>
      <StepFrame
        label="Test"
        position={phase.at + (verdict ? 1 : 0)}
        total={items.length}
        remaining={null}
        showCounter={false}
        shifted={!!why}
        onExit={leave}
        footer={verdict ? null : <CheckButton ready={item.kind === "quiz" && item.q.type === "written" ? !!draft.trim() : picked !== null} busy={busy} onCheck={() => void check(item)} />}
      >
        <div key={`${reviewing ? "r" : "t"}-${phase.at}`} className={s.qWrap} data-sheet={verdict ? "" : undefined}>
          <QuestionView
            eyebrow={isCheck ? "¿Verdadero o falso?" : undefined}
            prompt={prompt}
            options={options}
            picked={picked}
            onPick={onPick}
            verdict={verdict}
            retry={item.kind === "quiz" && item.retry}
            written={
              item.kind === "quiz" && item.q.type === "written" ? (
                <label className={s.written}>
                  <span>Tu respuesta</span>
                  <textarea value={draft} maxLength={1500} disabled={!!verdict} onChange={(e) => setDraft(e.target.value)} rows={6} />
                  <small className="num">{draft.trim() ? draft.trim().split(/\s+/).length : 0} palabras</small>
                </label>
              ) : undefined
            }
          />
          {error && <p className={sf.saveError} role="alert">{error}</p>}
        </div>
        {verdict && (
          <CorrectionSheet
            ok={verdict.correct}
            busy={busy}
            onWhy={() => setWhy(whyDraft())}
            onNext={() => advance(phase.at)}
            nextLabel={phase.at + 1 >= items.length && (reviewing || !missed.length) ? "Ver resultados" : undefined}
            onRate={item.kind === "quiz" ? (up) => void rateQuestion(ids, item.q.index, up).catch(() => undefined) : undefined}
          >
            {item.kind === "quiz" && item.q.type === "written" && verdict.rubric?.length ? (
              <p>Ideas clave: {verdict.rubric.join(" · ")}.</p>
            ) : !verdict.correct ? (
              <p>La correcta es «{label(verdict.correctAnswer)}».</p>
            ) : null}
            {verdict.explanation && <p>{verdict.explanation}</p>}
          </CorrectionSheet>
        )}
      </StepFrame>
      {why !== null && (
        <WhyPanel examId={examId} unitId={unitId} conversationId={conversationId} title={title} draft={why} onClose={() => setWhy(null)} />
      )}
    </>
  );
}
