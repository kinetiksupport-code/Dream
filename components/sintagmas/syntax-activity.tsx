"use client";
// Actividad de sintagmas a pantalla completa (prompt «sintagmas» §1–§5).
// En pantalla solo la frase, las rayas, las etiquetas y Comprobar; fijos
// únicamente Deshacer/Rehacer, Pista y Comprobar, más «?» para el tutorial.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CircleHelp, Lightbulb, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { displayLabel, fullName, sessionSummary } from "@/supabase/functions/dream-api/sintagmas.mjs";
import {
  SESSION_LENGTH,
  commit,
  emptyHistory,
  phaseMessage,
  readTutorialHidden,
  redo,
  syntaxCheck,
  syntaxHint,
  syntaxNext,
  syntaxSettings,
  syntaxState,
  undo,
  writeTutorialHidden,
  type History,
  type LabelStats,
  type SyntaxCheckResponse,
  type SyntaxHint,
  type SyntaxLabel,
  type SyntaxSentence,
  type SyntaxState,
} from "@/lib/sintagmas";
import { DreamActivity } from "../dream-mark";
import { DesktopOnly, useDesktop } from "./desktop-only";
import { NotesStep } from "./notes-step";
import { SentenceBoard } from "./sentence-board";
import { Tutorial } from "./tutorial";
import s from "./sintagmas.module.css";

type Stage = "loading" | "notes" | "play" | "summary" | "error";

export function SyntaxActivity() {
  const desktop = useDesktop();
  const search = useSearchParams();
  const conversationFromChat = search.get("c");
  const [conversation, setConversation] = useState<string | null>(conversationFromChat);
  const back = conversation ? `/chat?c=${conversation}` : "/chat";
  const [stage, setStage] = useState<Stage>("loading");
  const [state, setState] = useState<SyntaxState | null>(null);
  const [error, setError] = useState("");
  const [tutorial, setTutorial] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!desktop) return;
    const controller = new AbortController();
    setStage("loading");
    syntaxState(controller.signal)
      .then(({ state }) => {
        setState(state);
        setTutorial(!state.tutorial_hidden && !readTutorialHidden());
        setStage(state.conventions.source === "notes" ? "play" : "notes");
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(e));
        setStage("error");
      });
    return () => controller.abort();
  }, [desktop, reload]);

  function closeTutorial(hide: boolean) {
    setTutorial(false);
    writeTutorialHidden(hide);
    if (state && hide !== state.tutorial_hidden) {
      setState({ ...state, tutorial_hidden: hide });
      // Si no se guarda en la cuenta, queda el respaldo local.
      void syntaxSettings(hide).catch(() => undefined);
    }
  }

  const ensureConversation = useCallback(async () => {
    const r = await callDream<{ conversation: { id: string } }>("conversation_create", {
      title: "Repaso de sintagmas",
    });
    setConversation(r.conversation.id);
    return r.conversation.id;
  }, []);

  const top = (
    <header className={s.top}>
      <Link className={`${s.back} press`} href={back} aria-label="Volver">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <span className={s.topTitle}>Sintagmas</span>
      {desktop && stage !== "error" && (
        <button
          type="button"
          className={`${s.help} press`}
          aria-label="Ver el tutorial"
          onClick={() => setTutorial(true)}
        >
          <CircleHelp size={20} aria-hidden="true" />
        </button>
      )}
    </header>
  );

  if (desktop === null) return <div className={s.page}>{top}</div>;
  if (!desktop)
    return (
      <div className={s.page}>
        {top}
        <h1 className="visually-hidden">Sintagmas</h1>
        <DesktopOnly />
      </div>
    );
  return (
    <div className={s.page}>
      {top}
      {stage === "loading" && (
        <div className={s.center}>
          <DreamActivity state="thinking" label="Preparando la actividad" />
        </div>
      )}
      {stage === "error" && (
        <div className="status-page">
          <h1>No se pudo abrir la actividad</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="button-row">
            <button className="primary press" onClick={() => setReload((n) => n + 1)}>
              Reintentar
            </button>
            <Link className="secondary press" href={back}>
              Volver al chat
            </Link>
          </div>
        </div>
      )}
      {stage === "notes" && (
        <NotesStep
          conversationId={conversation}
          ensureConversation={ensureConversation}
          onDone={(next) => {
            setState(next);
            setStage("play");
          }}
          onSkip={() => setStage("play")}
        />
      )}
      {stage === "play" && state && (
        <Session state={state} setState={setState} back={back} />
      )}
      {tutorial && state && <Tutorial hidden={state.tutorial_hidden} onClose={closeTutorial} />}
    </div>
  );
}

function Session({
  state,
  setState,
  back,
}: {
  state: SyntaxState;
  setState: (s: SyntaxState) => void;
  back: string;
}) {
  const names = state.conventions.names;
  const [sentence, setSentence] = useState<SyntaxSentence | null>(null);
  const [retry, setRetry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<History>(emptyHistory);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [hint, setHint] = useState<SyntaxHint | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SyntaxCheckResponse | null>(null);
  const [optionsHere, setOptionsHere] = useState(false);
  const [optionsUses, setOptionsUses] = useState(0);
  const [recent, setRecent] = useState<SyntaxLabel[]>([]);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState<LabelStats[]>([]);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const loadRef = useRef(0);
  const marks = history.present;
  const write = state.phase === "write" && !optionsHere;

  const load = useCallback(async () => {
    const ticket = ++loadRef.current;
    setLoading(true);
    setError("");
    setResult(null);
    setHint(null);
    setHintLevel(0);
    setOptionsHere(false);
    setHistory(emptyHistory());
    try {
      const r = await syntaxNext();
      if (ticket !== loadRef.current) return;
      setSentence(r.sentence);
      setRetry(r.retry);
    } catch (e) {
      if (ticket === loadRef.current) setError(errorMessage(e));
    } finally {
      if (ticket === loadRef.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Ctrl/Cmd+Z deshace; Mayús+Ctrl/Cmd+Z o Ctrl+Y rehace. No mientras se escribe.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || result) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        setHistory(undo);
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        setHistory(redo);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [result]);

  const unlabelled = marks.some((m) => !m.label);
  const labelled = marks.filter((m) => m.label).length;

  async function askHint() {
    if (!sentence || hintLevel >= 2) return;
    const level = (hintLevel + 1) as 1 | 2;
    try {
      const r = await syntaxHint(sentence.id, marks, level);
      setHint(r.hint);
      setHintLevel(level);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function check() {
    if (!sentence || checking || !labelled || unlabelled) return;
    setChecking(true);
    setError("");
    try {
      // «Ver opciones» no penaliza la primera vez; después cuenta como pista.
      const r = await syntaxCheck(sentence.id, marks, hintLevel + Math.max(0, optionsUses - 1));
      setResult(r);
      setHint(null);
      setStats((list) => [...list, r.check.labels]);
      setDone((n) => n + 1);
      const levelUp = r.level > state.level;
      setMessage(r.phase_change ? phaseMessage(r.phase_change) : levelUp ? "¡Subes de nivel! Ahora, frases un poco más largas." : "");
      if (r.phase !== state.phase || r.level !== state.level) setState({ ...state, phase: r.phase, level: r.level });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }
  function next() {
    if (done >= SESSION_LENGTH) setFinished(true);
    else void load();
  }

  if (finished) return <Summary stats={stats} names={names} back={back} onRepeat={() => {
    setFinished(false);
    setDone(0);
    setStats([]);
    void load();
  }} />;

  const progress = Math.min(1, done / SESSION_LENGTH);
  return (
    <main className={s.play} id="main">
      <h1 className="visually-hidden">Repaso de sintagmas</h1>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Progreso de la sesión"
        aria-valuemin={0}
        aria-valuemax={SESSION_LENGTH}
        aria-valuenow={done}
        aria-valuetext={`${done} de ${SESSION_LENGTH} frases`}
      >
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
      {loading && (
        <div className={s.center}>
          <DreamActivity state="thinking" label="Preparando una frase" />
        </div>
      )}
      {!loading && !sentence && error && (
        <div className={s.center}>
          <p className="error" role="alert">
            {error}
          </p>
          <button className="primary press" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!loading && sentence && (
        <>
          <p className={s.instruction}>
            {retry ? "Esta ya salió: ¿la sacas ahora? " : ""}
            {write ? "Marca los sintagmas y escribe su etiqueta." : "Marca los sintagmas y elige su etiqueta."}
          </p>
          <SentenceBoard
            key={sentence.id}
            words={sentence.words}
            marks={marks}
            names={names}
            write={write}
            recent={recent}
            onChange={(list) => setHistory((h) => commit(h, list))}
            onLabel={(label) => setRecent((r) => [label, ...r.filter((x) => x !== label)].slice(0, 4))}
            hinted={hint && hint.start !== null && hint.end !== null ? { start: hint.start, end: hint.end } : null}
            result={result ? { spans: result.check.spans, extra: result.check.extra } : null}
            onShowOptions={() => {
              setOptionsHere(true);
              setOptionsUses((n) => n + 1);
            }}
          />
          {hint && (
            <p className={s.hint} role="status">
              <Lightbulb size={16} aria-hidden="true" />
              {hint.text}
            </p>
          )}
          {state.conventions.source === "standard" && !result && (
            <p className={s.standard}>Uso las etiquetas estándar: SN, SV, SAdj, SAdv y SPrep.</p>
          )}
          {result && <Feedback result={result} />}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className={s.bar}>
            {result ? (
              <button type="button" className={`primary press ${s.checkButton}`} onClick={next} autoFocus>
                {done >= SESSION_LENGTH ? "Ver mi resumen" : "Siguiente frase"}
              </button>
            ) : (
              <>
                <div className={s.barTools}>
                  <button
                    type="button"
                    className={`${s.tool} press`}
                    onClick={() => setHistory(undo)}
                    disabled={!history.past.length}
                    aria-keyshortcuts="Control+Z Meta+Z"
                  >
                    <Undo2 size={18} aria-hidden="true" />
                    Deshacer
                  </button>
                  <button
                    type="button"
                    className={`${s.tool} press`}
                    onClick={() => setHistory(redo)}
                    disabled={!history.future.length}
                    aria-label="Rehacer"
                    aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                  >
                    <Redo2 size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${s.tool} press`}
                    onClick={() => void askHint()}
                    disabled={hintLevel >= 2}
                  >
                    <Lightbulb size={18} aria-hidden="true" />
                    Pista
                  </button>
                </div>
                <button
                  type="button"
                  className={`primary press ${s.checkButton}`}
                  onClick={() => void check()}
                  disabled={!labelled || unlabelled || checking}
                  aria-busy={checking || undefined}
                  aria-describedby={unlabelled ? "sintagmas-gris" : undefined}
                >
                  {checking ? "Comprobando…" : "Comprobar"}
                </button>
              </>
            )}
          </div>
          {unlabelled && !result && (
            <p id="sintagmas-gris" className={s.standard}>
              Ponle etiqueta a la raya gris antes de comprobar.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Feedback({ result }: { result: SyntaxCheckResponse }) {
  const { check } = result;
  const wrong = check.spans.filter((x) => x.status !== "correct");
  return (
    <section className={s.feedback} aria-live="polite" data-perfect={check.perfect ? "" : undefined}>
      <h2 className={s.feedbackTitle}>
        {check.perfect ? <Check size={20} aria-hidden="true" /> : null}
        {check.alternative
          ? "Tu análisis también vale."
          : check.perfect
            ? "¡Perfecto! Todo bien marcado."
            : `Bien: ${check.correct} de ${check.total}. Mira lo que falta:`}
      </h2>
      {check.explanation && !check.perfect && <p className={s.explanation}>{check.explanation}</p>}
      {!check.perfect && (
        <ul className={s.feedbackList}>
          {wrong.slice(0, 4).map((x) => (
            <li key={`${x.start}-${x.end}-${x.label}`}>{x.feedback}</li>
          ))}
          {check.extra.length > 0 && <li>Sobra alguna raya: no corresponde a ningún sintagma.</li>}
        </ul>
      )}
      {!check.perfect && <p className={s.later}>No pasa nada: esta frase volverá a salir más tarde.</p>}
    </section>
  );
}

function Summary({
  stats,
  names,
  back,
  onRepeat,
}: {
  stats: LabelStats[];
  names: SyntaxState["conventions"]["names"];
  back: string;
  onRepeat: () => void;
}) {
  const { mastered, review } = sessionSummary(stats);
  const label = (l: SyntaxLabel) => `${displayLabel(l, names)} (${fullName(l, names)})`;
  return (
    <main className={s.summary} id="main">
      <h1 className={s.summaryTitle}>¡Sesión terminada!</h1>
      {mastered.length > 0 && (
        <section>
          <h2>Lo que dominas</h2>
          <ul>
            {mastered.map((l) => (
              <li key={l}>
                <Check size={16} aria-hidden="true" /> {label(l)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {review.length > 0 && (
        <section>
          <h2>Para repasar</h2>
          <ul>
            {review.map((l) => (
              <li key={l}>
                <RotateCcw size={16} aria-hidden="true" /> {label(l)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!mastered.length && !review.length && <p>Sigue practicando: con unas frases más verás qué dominas.</p>}
      <div className={s.summaryActions}>
        <button type="button" className="primary press" onClick={onRepeat} autoFocus>
          Repetir
        </button>
        <Link className="secondary press" href={back}>
          Volver al chat
        </Link>
      </div>
    </main>
  );
}
