"use client";
// «¿Por qué?» (prompt de la ruta, 0.11 · 6 y 0.12 · 8): el tutor de Dream en
// un panel a la derecha (escritorio) o a pantalla completa (móvil). Es el chat
// de siempre (de la unidad o del test), con la pregunta, la respuesta del
// alumno y la correcta ya cargadas: se envía sola y Dream responde con el
// formato corto de las explicaciones (explanation-style.mjs). Debajo queda la
// caja para seguir preguntando. Solo para preguntas ya corregidas.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ChatExperience } from "../chat-experience";
import { Orb } from "../orb";
import s from "./why-panel.module.css";

export function WhyPanel({
  examId,
  unitId,
  conversationId,
  title,
  draft,
  onClose,
}: {
  examId?: string;
  unitId?: string;
  conversationId: string | null;
  title: string;
  draft: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <aside className={s.panel} role="dialog" aria-modal="false" aria-labelledby="por-que-titulo" data-testid="panel-por-que">
      <header className={s.head}>
        <Orb size={28} breathing />
        <h2 id="por-que-titulo" className={s.title}>
          ¿Por qué?
        </h2>
        <button ref={closeRef} type="button" className={`${s.close} press`} aria-label="Cerrar la explicación" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className={s.body} aria-live="polite">
        {conversationId ? (
          <ChatExperience key={draft} study={{ examId, unitId, conversationId, title, draft, why: true }} />
        ) : (
          <p className={s.wait}>Preparando al tutor…</p>
        )}
      </div>
    </aside>
  );
}
