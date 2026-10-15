"use client";
import { memo, useState } from "react";
import Link from "next/link";
import { Copy, Check, FileText, ArrowUpRight } from "lucide-react";
import { Markdown } from "./markdown";
import { DreamActivity } from "./dream-mark";
import { parseDreamContent } from "@/lib/widgets";
import type { Message, DreamState } from "@/lib/types";

const WORKING = new Set<DreamState>([
  "thinking",
  "searching",
  "composing",
  "shaping",
]);

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
  if (message.role === "user")
    return (
      <article className="message message-user">
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
  return (
    <article className="message message-assistant">
      {working && <DreamActivity state={state} />}
      {parsed.text && <Markdown content={parsed.text} />}
      {parsed.widgets.map((w) => (
        <Link
          className="quiz-widget press"
          href={`/tests/${w.testId}`}
          key={w.testId}
        >
          <span className="quiz-text">
            <small>{w.mode === "exam" ? "Examen" : "Práctica"}</small>
            <strong>{w.title}</strong>
            {w.questionCount && <span>{w.questionCount} preguntas</span>}
          </span>
          <ArrowUpRight size={20} />
        </Link>
      ))}
      {message.stopped && (
        <small className="muted">
          Respuesta detenida · Lo recibido se conserva
        </small>
      )}
      {parsed.text && !working && (
        <div className="message-actions">
          <button
            className="chip chip-small press"
            onClick={() => onContinue("Explícamelo por pasos.")}
          >
            Explícamelo por pasos
          </button>
          <button
            className="icon-button press"
            aria-label={copied ? "Respuesta copiada" : "Copiar respuesta"}
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
