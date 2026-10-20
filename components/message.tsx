"use client";
import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  FileText,
  ArrowRight,
  ListChecks,
  RotateCw,
} from "lucide-react";
import { Markdown } from "./markdown";
import { AiStatus } from "./ai-status";
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
  return (
    <article
      className={`message message-assistant${enter}${typing ? " is-typing" : ""}${onRegenerate ? " is-last" : ""}${revealing ? " is-revealing" : ""}`}
    >
      {parsed.sources.length > 0 && <WebSources sources={parsed.sources} />}
      {/* Polite live region, busy until the reveal ends: read once, whole,
          never word by word, and it never takes the focus. A tap or click on
          the answer shows it all at once. */}
      <div
        className="message-body"
        ref={body}
        aria-live="polite"
        aria-busy={live || revealing}
        onClick={revealing ? finish : undefined}
      >
        {text && (
          // Block mode for answers born in this session: same tree while it
          // streams, reveals and completes, so the end never remounts it.
          <Markdown content={text} streaming={live || isNew} reveal={isNew} />
        )}
      </div>
      {working && <AiStatus state={state} since={since} />}
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
      {message.stopped && !revealing && (
        <small className="muted">
          Respuesta detenida · Lo recibido se conserva
        </small>
      )}
      {parsed.text && !working && !revealing && (
        <div className="message-actions">
          <button
            className="chip chip-small message-action press"
            onClick={() => onContinue("Explícamelo por pasos.")}
          >
            Explícamelo por pasos
          </button>
          <button
            className={`message-action icon-action copy-action press${copied ? " is-copied" : ""}`}
            aria-label={copied ? "Copiado" : "Copiar respuesta"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(parsed.text);
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
