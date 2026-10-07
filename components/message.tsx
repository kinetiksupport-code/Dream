"use client";
import { memo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Copy,
  Check,
  BookOpen,
  FileText,
  Route,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Markdown } from "./markdown";
import { DreamActivity } from "./dream-mark";
import { parseDreamContent } from "@/lib/widgets";
import type { Message, DreamState } from "@/lib/types";
export const MessageView = memo(function MessageView({
  message,
  state = "done",
  onContinue,
}: {
  message: Message;
  state?: DreamState;
  onContinue: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const parsed = parseDreamContent(message.content);
  return (
    <article className={`message message-${message.role}`}>
      {message.role === "assistant" && <DreamActivity state={state} />}
      {message.files && (
        <div className="message-files">
          {message.files.map((name, i) => (
            <span key={i}>
              <FileText size={16} />
              {name}
            </span>
          ))}
        </div>
      )}
      <Markdown content={parsed.text} />
      {parsed.widgets.map((w) => (
        <Link
          className="quiz-widget"
          href={`/tests/${w.testId}`}
          key={w.testId}
        >
          <span className="quiz-icon">
            <BookOpen size={22} />
          </span>
          <span>
            <small>{w.mode === "exam" ? "EXAMEN" : "PRÁCTICA"}</small>
            <strong>{w.title}</strong>
            {w.questionCount && (
              <span>{w.questionCount} preguntas · A tu ritmo</span>
            )}
          </span>
          <ArrowUpRight size={20} />
        </Link>
      ))}
      {message.stopped && (
        <small className="muted">
          Respuesta detenida · Lo recibido se conserva
        </small>
      )}
      {message.role === "assistant" && parsed.text && (
        <>
          <button
            className="step-action"
            onClick={() => onContinue("Explícamelo por pasos.")}
          >
            <Route size={18} />
            Explícamelo por pasos
            <ArrowUpRight size={18} />
          </button>
          <div className="message-actions">
            <button
              className="icon-button"
              aria-label="Copiar respuesta"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(parsed.text);
                  setCopied(true);
                } catch {
                  setError("No se pudo copiar la respuesta.");
                }
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button
              className="icon-button"
              disabled
              aria-label="Valoración positiva: todavía no disponible"
              title="La valoración todavía no está disponible"
            >
              <ThumbsUp size={18} />
            </button>
            <button
              className="icon-button"
              disabled
              aria-label="Valoración negativa: todavía no disponible"
              title="La valoración todavía no está disponible"
            >
              <ThumbsDown size={18} />
            </button>
          </div>
        </>
      )}
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
    </article>
  );
});
