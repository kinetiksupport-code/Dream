"use client";
import { HomeStudyToday } from "./study-today";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useDream } from "@/components/providers";
import { PencilIcon, QuizIcon, UploadIcon } from "@/components/icons";
import { callDream } from "@/lib/dream-api";
import { accountIdentity } from "@/lib/account";
import type { DreamExam, ExamIndex } from "@/lib/exam-plans";
import {
  greetingFor,
  homeContext,
  homeTopic,
  suggestionPrompt,
  upcomingExam,
  type HomeContext,
} from "@/lib/home-context";

type ContextState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; context: HomeContext };

/**
 * Nearest exam → «Hoy toca … · N días para tu examen». Two light reads
 * (`exams`, then `exam_get` only if the plan has units), no AI. It never
 * blocks the page: any failure or missing data simply hides the line.
 */
function useHomeContext(): ContextState {
  const [state, setState] = useState<ContextState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const now = new Date();
      const index = await callDream<{ exams?: ExamIndex[] }>(
        "exams",
        {},
        controller.signal,
      );
      const next = upcomingExam(
        Array.isArray(index?.exams) ? index.exams : [],
        now,
      );
      if (!next) return null;
      if (!next.units?.length) return homeContext({ ...next, units: [] }, now);
      const exam = (
        await callDream<{ exam?: DreamExam }>(
          "exam_get",
          { exam_id: next.id },
          controller.signal,
        )
      )?.exam;
      return homeContext(exam ?? { ...next, units: [] }, now);
    })()
      .then((context) => {
        if (!controller.signal.aborted)
          setState(context ? { status: "ready", context } : { status: "none" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "none" });
      });
    return () => controller.abort();
  }, []);
  return state;
}

function ContextLine({ context }: { context: HomeContext }) {
  const days =
    context.days === 0 ? null : (
      <>
        <span className="num">{context.days}</span>{" "}
        {context.days === 1 ? "día" : "días"}
      </>
    );
  if (context.days === 0)
    return (
      <>
        Hoy es tu examen
        {context.subject && (
          <>
            {" "}
            de <strong>{context.subject}</strong>
          </>
        )}
        .
      </>
    );
  if (context.unit)
    return (
      <>
        Hoy toca <strong>{context.unit}</strong> · {days} para tu examen.
      </>
    );
  return (
    <>
      {days} para tu examen
      {context.subject && (
        <>
          {" "}
          de <strong>{context.subject}</strong>
        </>
      )}
      .
    </>
  );
}

/** Empty state of /chat (design: "Inicio"). The composer is passed in. */
export function ChatHome({
  composer,
  onPrompt,
  onAttach,
  leaving = false,
  children,
}: {
  composer: ReactNode;
  /** Puts the text in the box with the cursor at the end. Never sends. */
  onPrompt: (prompt: string) => void;
  onAttach: () => void;
  /** The first message was just sent: the hero fades out towards the chat. */
  leaving?: boolean;
  children?: ReactNode;
}) {
  const { session, profile } = useDream();
  const { name } = accountIdentity(session?.user, profile);
  const [now] = useState(() => new Date());
  const state = useHomeContext();
  const topic = homeTopic(state.status === "ready" ? state.context : null);
  const chips = [
    { label: "Subir apuntes", icon: <UploadIcon />, run: onAttach },
    {
      label: "Practicar ejercicios",
      icon: <PencilIcon />,
      run: () => onPrompt(suggestionPrompt("practice", topic)),
    },
    {
      label: "Hacer un test",
      icon: <QuizIcon />,
      run: () => onPrompt(suggestionPrompt("test", topic)),
    },
  ];
  return (
    <div className={`home${leaving ? " is-leaving" : ""}`}>
      <div className="home-inner">
        <header className="home-head">
          <p className="home-hello rise">
            <span className="home-greeting">{greetingFor(now, name)}.</span>{" "}
            <span className="home-context" aria-live="polite">
              {state.status === "loading" ? (
                <span className="home-context-skeleton" aria-hidden="true">
                  <span />
                </span>
              ) : state.status === "ready" ? (
                <span className="home-context-text">
                  <ContextLine context={state.context} />
                </span>
              ) : null}
            </span>
          </p>
          <h1 className="display rise">¿Qué quieres entender hoy?</h1>
        </header>
        <div className="rise rise-1">{composer}</div>
        <div className="chips home-chips" role="group" aria-label="Sugerencias">
          {chips.map((chip, i) => (
            <button
              key={chip.label}
              type="button"
              className="chip home-chip press"
              style={{ "--i": i } as CSSProperties}
              onClick={chip.run}
              disabled={leaving}
            >
              <span className="chip-icon">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
        <HomeStudyToday />
        {children}
      </div>
    </div>
  );
}
