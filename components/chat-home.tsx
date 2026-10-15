"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { callDream } from "@/lib/dream-api";
import type { DreamExam, ExamIndex } from "@/lib/exam-plans";
import {
  MAIN_SHORTCUTS,
  MODE_SHORTCUTS,
  editableExamPath,
  greeting,
  lastStudied,
  todayFocus,
  upcomingExam,
  type ChatShortcut,
  type TodayFocus,
} from "@/lib/chat-shortcuts";

interface StudyContext {
  focus: TodayFocus | null;
  last: string | null;
  editPath: string | null;
}

/**
 * Reads the nearest exam plan (two light reads, no AI) for the greeting,
 * "Repasa mi último test o lección" and "La fecha de mi examen ha cambiado".
 * Any failure keeps the neutral greeting.
 */
function useStudyContext() {
  const [context, setContext] = useState<StudyContext | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const index = await callDream<{ exams?: ExamIndex[] }>(
        "exams",
        {},
        controller.signal,
      );
      const next = upcomingExam(Array.isArray(index?.exams) ? index.exams : []);
      if (!next) return null;
      const exam = (
        await callDream<{ exam?: DreamExam }>(
          "exam_get",
          { exam_id: next.id },
          controller.signal,
        )
      )?.exam;
      return {
        focus: exam ? todayFocus(exam) : null,
        last: exam ? lastStudied(exam) : null,
        editPath: editableExamPath(next),
      };
    })()
      .then((value) => {
        if (!controller.signal.aborted && value) setContext(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return context;
}

/** Empty state of /chat (design: "Inicio"). The composer is passed in. */
export function ChatHome({
  composer,
  onShortcut,
  onAttach,
  disabled = false,
  children,
}: {
  composer: ReactNode;
  /** Sends the shortcut; `detail` names what it refers to, if known. */
  onShortcut: (shortcut: ChatShortcut, detail?: string) => void;
  onAttach: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const context = useStudyContext();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const modesId = useId();
  const chip = (s: ChatShortcut, detail?: string) => (
    <button
      key={`${s.id}-${s.label}`}
      type="button"
      className="chip press"
      disabled={disabled}
      onClick={() => onShortcut(s, detail)}
    >
      {s.label}
    </button>
  );
  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="display rise">{greeting(context?.focus ?? null)}</h1>
        <div className="rise rise-1">{composer}</div>
        <div className="chat-shortcuts rise rise-2">
          <div className="chips" role="group" aria-label="Atajos">
            <button type="button" className="chip press" onClick={onAttach}>
              Subir apuntes
            </button>
            {MAIN_SHORTCUTS.map((s) =>
              s.id === "exam_date" && context?.editPath ? (
                <Link key={s.id} className="chip press" href={context.editPath}>
                  {s.label}
                </Link>
              ) : (
                chip(s, s.id === "review_last" ? (context?.last ?? "") : "")
              ),
            )}
            <button
              ref={more}
              type="button"
              className="chip chip-more press"
              aria-expanded={open}
              aria-controls={modesId}
              onClick={() => setOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            >
              Más
              <span className="chip-chevron" aria-hidden="true" />
            </button>
          </div>
          <div
            id={modesId}
            className="chips chat-modes"
            role="group"
            aria-label="Modos de estudio"
            hidden={!open}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                more.current?.focus();
              }
            }}
          >
            {MODE_SHORTCUTS.map((s) => chip(s))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
