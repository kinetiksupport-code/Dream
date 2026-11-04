"use client";
import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  FileText,
  ArrowRight,
  LayoutGrid,
  Puzzle,
  ListChecks,
  RotateCw,
  Download,
} from "lucide-react";
import { wordsLabel } from "@/lib/pasted-text";
import { Markdown } from "./markdown";
import { plainMath } from "@/lib/math";
import { AiStatus } from "./ai-status";
import { TypingIndicator } from "./typing-indicator";
import { WebSources } from "./web-sources";
import { useReveal } from "./use-reveal";
import { parseDreamContent } from "@/lib/widgets";
import { settleStreaming } from "@/lib/stream-text";
import type { Message, DreamState } from "@/lib/types";

const WORKING = new Set<DreamState>([
  "thinking",
  "searching",
  "composing",
  "shaping",
]);
/** States in which text can still arrive (the cursor blinks). */
const STREAMING = new Set<DreamState>(["thinking", "searching", "composing"]);

/**
 * Reads a new answer once, when it has finished typing (polite, never takes
 * the focus). The text is plain (no Markdown) and leaves the region a few
 * seconds later, so browsing the thread does not read it twice.
 */
function Announce({ text }: { text: string }) {
  const [said, setSaid] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (!text || done.current) return;
    done.current = true;
    setSaid(plainMath(text).replace(/[*_#>`]/g, ""));
    const timer = window.setTimeout(() => setSaid(""), 6000);
    return () => window.clearTimeout(timer);
  }, [text]);
  return (
    <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {said}
    </span>
  );
}

export const MessageView = memo(function MessageView({
  message,
  state = "done",
  since = null,
  isNew = false,
  onContinue,
  onRegenerate,
}: {
  message: Message;
  state?: DreamState;
  /** When the current wait started (send), for the 2 s status delay. */
  since?: number | null;
  /** Only messages created in this session enter with motion. */
  isNew?: boolean;
  onContinue: (text: string) => void;
  /** Only on the last answer, once it has finished (or was stopped). */
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // The label only cross-fades after a click, never on first render.
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const parsed = parseDreamContent(message.content);
  const live = STREAMING.has(state);
  // Answers born in this session appear word by word (lib/reveal.ts); the
  // history is shown as is.
  const body = useRef<HTMLDivElement>(null);
  const { revealing, finish } = useReveal(
    body,
    isNew && message.role === "assistant",
    !live,
  );
  const enter = isNew ? " message-enter" : "";
  if (message.role === "user")
    return (
      <article className={`message message-user${enter}`}>
        {message.files && message.files.length > 0 && (
          <div className="message-files">
            {message.files.map((name, i) => (
              <span key={i}>
                <FileText size={16} />
                {name}
              </span>
            ))}
          </div>
        )}
        {parsed.text && (
          <div className="bubble">
            <Markdown content={parsed.text} />
          </div>
        )}
      </article>
    );
  const working = WORKING.has(state);
  const text = live ? settleStreaming(parsed.text) : parsed.text;
  const typing = live && !!text;
  // Before the first character: «Dream está escribiendo…» (P5). Searching
  // and preparing a test keep their own status line.
  const waitingFirst = !text && (state === "thinking" || state === "composing");
  return (
    <article
      className={`message message-assistant${enter}${typing ? " is-typing" : ""}${onRegenerate ? " is-last" : ""}${revealing ? " is-revealing" : ""}`}
    >
      {parsed.sources.length > 0 && <WebSources sources={parsed.sources} />}
      {/* Not a live region while it types (aria-live="off"): screen readers
          get the answer once, whole, from the announcer below when it ends,
          never word by word. A tap or click on the answer shows it all. */}
      <div
        className="message-body"
        ref={body}
        aria-live="off"
        aria-busy={live || revealing}
        onClick={revealing ? finish : undefined}
      >
        {text && (
          // Block mode for answers born in this session: same tree while it
          // streams, reveals and completes, so the end never remounts it.
          <Markdown content={text} streaming={live || isNew} reveal={isNew} />
        )}
      </div>
      {/* While it thinks or writes, the indicator and then the cursor say it;
          searching and preparing a test keep their status line. */}
      {waitingFirst ? (
        <TypingIndicator />
      ) : (
        working &&
        state !== "thinking" &&
        state !== "composing" && <AiStatus state={state} since={since} />
      )}
      {/* A stopped answer is not read out: the student stopped it. */}
      {isNew && (
        <Announce
          text={!live && !revealing && !message.stopped ? parsed.text : ""}
        />
      )}
      {/* Respuesta larga (apuntes, resumen): también como documento .md para
          descargar; está en «Dreams» y en el historial solo viaja su título. */}
      {!live && !revealing && parsed.doc && (
        <div className="quiz-widget doc-widget" data-kind="doc">
          <span className="quiz-icon" aria-hidden="true">
            <FileText size={22} />
          </span>
          <span className="quiz-text">
            <small>Dreams · Documento</small>
            <strong>{parsed.doc.title}</strong>
            <span>{wordsLabel(parsed.doc.words)}</span>
          </span>
          <button type="button" className="quiz-start press doc-download" onClick={() => downloadMarkdown(parsed.doc!.title, parsed.text)}>
            <Download size={18} aria-hidden="true" />
            Descargar .md
          </button>
        </div>
      )}
      {/* The test card, the notice and the actions wait for the last word. */}
      {!revealing &&
        parsed.widgets.map((w) => (
          <Link
            className="quiz-widget press"
            data-mode={w.mode === "exam" ? "exam" : "practice"}
            href={`/tests/${w.testId}`}
            key={w.testId}
          >
            <span className="quiz-icon" aria-hidden="true">
              <ListChecks size={22} />
            </span>
            <span className="quiz-text">
              <small>{w.mode === "exam" ? "Examen" : "Práctica"}</small>
              <strong>{w.title}</strong>
              {w.questionCount ? (
                <span>
                  <span className="num">{w.questionCount}</span>{" "}
                  {w.questionCount === 1 ? "pregunta" : "preguntas"}
                </span>
              ) : null}
            </span>
            <span className="quiz-start">
              Empezar
              <ArrowRight size={18} className="quiz-arrow" aria-hidden="true" />
            </span>
          </Link>
        ))}
      {!revealing &&
        parsed.schemes.map((w) => (
          <Link
            className="quiz-widget press"
            data-kind="scheme"
            href={`/esquemas/${w.schemeId}`}
            key={w.schemeId}
          >
            <span className="quiz-icon" aria-hidden="true">
              <LayoutGrid size={22} />
            </span>
            <span className="quiz-text">
              <small>Dreams · Esquema</small>
              <strong>{w.title}</strong>
              {w.sections ? (
                <span>
                  <span className="num">{w.sections}</span>{" "}
                  {w.sections === 1 ? "apartado" : "apartados"}
                </span>
              ) : null}
            </span>
            <span className="quiz-start">
              Ver esquema
              <ArrowRight size={18} className="quiz-arrow" aria-hidden="true" />
            </span>
          </Link>
        ))}
      {!revealing &&
        parsed.games.map((w) => (
          <Link
            className="quiz-widget press"
            data-kind="game"
            href={`/juegos/${w.gameId}`}
            key={w.gameId}
          >
            <span className="quiz-icon" aria-hidden="true">
              <Puzzle size={22} />
            </span>
            <span className="quiz-text">
              <small>Dreams · {w.kind === "classify" ? "Clasificar" : "Emparejar"}</small>
              <strong>{w.title}</strong>
              {w.count ? (
                <span>
                  <span className="num">{w.count}</span>{" "}
                  {w.kind === "classify" ? (w.count === 1 ? "elemento" : "elementos") : w.count === 1 ? "pareja" : "parejas"}
                </span>
              ) : null}
            </span>
            <span className="quiz-start">
              Jugar
              <ArrowRight size={18} className="quiz-arrow" aria-hidden="true" />
            </span>
          </Link>
        ))}
      {message.stopped && !revealing && (
        <small className="muted">
          Respuesta detenida · Lo recibido se conserva
        </small>
      )}
      {parsed.text && !working && !revealing && (
        <div className="message-actions">
          <button
            className="chip chip-small message-action press"
            onClick={() => onContinue("Explícamelo poco a poco, un paso cada vez.")}
          >
            Explícamelo poco a poco
          </button>
          <button
            className={`message-action icon-action copy-action press${copied ? " is-copied" : ""}`}
            aria-label={copied ? "Copiado" : "Copiar respuesta"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(plainMath(parsed.text));
                setError("");
                setTouched(true);
                setCopied(true);
              } catch {
                setError(
                  "No se pudo copiar la respuesta. Selecciona el texto.",
                );
              }
            }}
          >
            <span
              className={`copy-swap${touched ? " is-swapping" : ""}`}
              key={copied ? "on" : "off"}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              <span aria-hidden="true">{copied ? "Copiado" : "Copiar"}</span>
            </span>
          </button>
          {onRegenerate && (
            <button
              className="message-action icon-action regen-action press"
              aria-label="Regenerar respuesta"
              onClick={onRegenerate}
            >
              <RotateCw size={18} aria-hidden="true" />
              <span aria-hidden="true">Regenerar</span>
            </button>
          )}
          <span className="visually-hidden" role="status" aria-live="polite">
            {copied ? "Copiado" : ""}
          </span>
        </div>
      )}
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
    </article>
  );
});

/** Descarga la respuesta como archivo .md (sin pasar por el servidor). */
function downloadMarkdown(title: string, text: string) {
  const name = `${title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) || "documento"}.md`;
  const url = URL.createObjectURL(new Blob([text.trim() + "\n"], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
