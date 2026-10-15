"use client";
import type { ReactNode } from "react";

/** Empty state of /chat (design: "Inicio"). The composer is passed in. */
export function ChatHome({
  composer,
  onPrompt,
  onAttach,
  children,
}: {
  composer: ReactNode;
  onPrompt: (prompt: string) => void;
  onAttach: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="display rise">¿Qué quieres entender hoy?</h1>
        <div className="rise rise-1">{composer}</div>
        <div className="chips rise rise-2" aria-label="Atajos">
          <button type="button" className="chip press" onClick={onAttach}>
            Subir apuntes
          </button>
          <button
            type="button"
            className="chip press"
            onClick={() =>
              onPrompt("Quiero practicar ejercicios de ")
            }
          >
            Practicar ejercicios
          </button>
          <button
            type="button"
            className="chip press"
            onClick={() => onPrompt("Hazme un test de ")}
          >
            Hacer un test
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
