"use client";
// Pregunta de la lección «tipo burbuja de tutor» y hoja de corrección de
// color (prompt de la ruta, 0.11 · 4-5 y 0.12 · 1-7):
// - Arriba la Orb con la pregunta en una burbuja; debajo las respuestas como
//   botones anchos; «Comprobar» (en el pie) desactivado hasta elegir.
// - Al comprobar: la correcta en verde, la elegida mal en rojo (con un saltito)
//   y el resto apagado; sube una hoja de color con icono y texto (nunca solo
//   color), «¿Por qué?» y «Continuar»/«Entendido», y el pulgar para valorar.
// - Teclado: 1-4 eligen, Intro comprueba y continúa (Esc lo lleva StepFrame).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, ThumbsDown, ThumbsUp, X as XIcon } from "lucide-react";
import { Markdown } from "../markdown";
import { Orb } from "../orb";
import s from "./quiz-question.module.css";

export type Answer = string | boolean;
export interface Verdict {
  correct: boolean;
  correctAnswer: Answer;
}

export function QuizQuestion({
  prompt,
  options,
  picked,
  onPick,
  verdict,
  retry = false,
  written,
  eyebrow,
}: {
  prompt: string;
  /** Etiqueta y valor de cada respuesta (V/F: «Verdadero» → true). */
  options: { label: string; value: Answer }[] | null;
  picked: Answer | null;
  onPick: (a: Answer) => void;
  verdict: Verdict | null;
  /** «ERROR ANTERIOR»: la pregunta vuelve en la ronda de repaso (0.11 · 7). */
  retry?: boolean;
  /** Pregunta escrita: el cuadro de texto va en lugar de las respuestas. */
  written?: ReactNode;
  eyebrow?: string;
}) {
  const locked = !!verdict;
  const listRef = useRef<HTMLDivElement>(null);
  // Foco al primer botón de respuesta al llegar una pregunta nueva (0.12 · 7).
  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [prompt]);
  // 1-4 eligen respuesta (0.12, reglas).
  useEffect(() => {
    if (!options || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role='dialog']")) return;
      if ((e.target as HTMLElement | null)?.closest("textarea, input")) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        onPick(options[n - 1].value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, locked, onPick]);

  return (
    <section className={s.question} data-checked={locked || undefined} data-testid="pregunta">
      {/* El hueco de la etiqueta se reserva siempre: sin saltos de maquetación (0.12 · 11). */}
      <p className={s.retry} data-on={retry || undefined} aria-hidden={!retry || undefined}>
        {retry && (
          <>
            <CircleAlert size={14} aria-hidden="true" /> Error anterior
          </>
        )}
      </p>
      <div className={s.tutor}>
        <span className={s.orb} aria-hidden="true">
          <Orb size={64} breathing />
        </span>
        <div className={s.bubble}>
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h1 className={s.prompt}>
            <Markdown content={prompt} />
          </h1>
        </div>
      </div>
      {written ??
        (options && (
          <div className={s.options} role="radiogroup" aria-label="Respuestas" ref={listRef}>
            {options.map((o) => {
              const mine = picked === o.value;
              const right = locked && verdict.correctAnswer === o.value;
              const wrong = locked && mine && !verdict.correct;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={mine}
                  aria-disabled={locked || undefined}
                  className={s.option}
                  data-picked={mine || undefined}
                  data-right={right || undefined}
                  data-wrong={wrong || undefined}
                  data-dim={(locked && !right && !wrong) || undefined}
                  onClick={() => !locked && onPick(o.value)}
                >
                  {(right || wrong) && (
                    <span className={s.mark} aria-hidden="true">
                      {right ? <Check size={18} strokeWidth={2.5} /> : <XIcon size={18} strokeWidth={2.5} />}
                    </span>
                  )}
                  <span className={s.label}>{o.label}</span>
                  {right && <span className="visually-hidden"> (respuesta correcta)</span>}
                  {wrong && <span className="visually-hidden"> (tu respuesta, incorrecta)</span>}
                </button>
              );
            })}
          </div>
        ))}
    </section>
  );
}

/** «Comprobar»: gris hasta elegir (aria-disabled, sin hover) y luego relleno (0.12 · 3). */
export function CheckButton({ ready, busy, onCheck }: { ready: boolean; busy: boolean; onCheck: () => void }) {
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || document.querySelector("[role='dialog']")) return;
      if ((e.target as HTMLElement | null)?.closest("textarea, a, button:not([role='radio'])")) return;
      e.preventDefault();
      onCheck();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onCheck]);
  return (
    <button
      type="button"
      className={`primary press ${s.check}`}
      aria-disabled={!ready || busy || undefined}
      aria-busy={busy || undefined}
      data-ready={ready || undefined}
      onClick={() => ready && !busy && onCheck()}
    >
      Comprobar
    </button>
  );
}

/**
 * Hoja de corrección (0.11 · 5 y 0.12 · 5-6): sube desde abajo en ~400 ms con
 * la curva tipo Apple, con tirador, icono + título, pulgares y dos botones.
 * `role="status"` anuncia el resultado.
 */
export function CorrectionSheet({
  ok,
  title,
  children,
  onWhy,
  onNext,
  nextLabel,
  onRate,
  busy = false,
}: {
  ok: boolean;
  title?: string;
  children?: ReactNode;
  onWhy?: () => void;
  onNext: () => void;
  nextLabel?: string;
  onRate?: (up: boolean) => void;
  busy?: boolean;
}) {
  const [rated, setRated] = useState<boolean | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => next.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || document.querySelector("[role='dialog']")) return;
      if ((e.target as HTMLElement | null)?.closest("textarea, a, button")) return;
      e.preventDefault();
      if (!busy) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, busy]);
  return (
    <div className={s.sheet} data-ok={ok || undefined} data-testid="hoja-correccion">
      <span className={s.grip} aria-hidden="true" />
      <div className={s.sheetHead} role="status">
        <span className={s.sheetIcon} aria-hidden="true">
          {ok ? <Check size={20} strokeWidth={3} /> : <XIcon size={20} strokeWidth={3} />}
        </span>
        <strong className={s.sheetTitle}>{title ?? (ok ? "¡Genial!" : "Incorrecto")}</strong>
        {onRate && (
          <span className={s.thumbs} role="group" aria-label="¿Te ha servido esta pregunta?">
            {[true, false].map((up) => (
              <button
                key={String(up)}
                type="button"
                className={s.thumb}
                aria-pressed={rated === up}
                aria-label={up ? "Buena pregunta" : "Mala pregunta"}
                onClick={() => {
                  if (rated === up) return;
                  setRated(up);
                  onRate(up);
                }}
              >
                {up ? <ThumbsUp size={18} aria-hidden="true" /> : <ThumbsDown size={18} aria-hidden="true" />}
              </button>
            ))}
          </span>
        )}
      </div>
      {children && <div className={s.sheetBody}>{children}</div>}
      <div className={s.sheetActions}>
        {onWhy && (
          <button type="button" className={s.why} onClick={onWhy}>
            ¿Por qué?
          </button>
        )}
        <button type="button" ref={next} className={s.next} disabled={busy} aria-busy={busy || undefined} onClick={onNext}>
          {nextLabel ?? (ok ? "Continuar" : "Entendido")}
        </button>
      </div>
    </div>
  );
}
