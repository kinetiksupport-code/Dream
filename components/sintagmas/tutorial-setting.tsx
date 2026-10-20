"use client";
// Ajustes › Sintagmas: volver a mostrar el tutorial de la actividad al
// entrar (prompt «sintagmas»: «en Ajustes un modo de reactivarlo»). Si
// dream-api aún no tiene la actividad, la fila no aparece.
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/dream-api";
import { readTutorialHidden, syntaxSettings, syntaxState, writeTutorialHidden } from "@/lib/sintagmas";

export function SyntaxTutorialSetting() {
  const [shown, setShown] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    syntaxState(controller.signal)
      .then(({ state }) => setShown(!state.tutorial_hidden && !readTutorialHidden()))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (shown === null) return null;
  async function toggle() {
    if (busy || shown === null) return;
    const next = !shown;
    setBusy(true);
    setError("");
    setShown(next);
    writeTutorialHidden(!next);
    try {
      await syntaxSettings(!next);
    } catch (e) {
      setShown(!next);
      writeTutorialHidden(next);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="group" aria-labelledby="syntax-title">
      <h2 className="section-title" id="syntax-title">
        Sintagmas
      </h2>
      <div className="group-list">
        <div className="group-row">
          <span className="row-text" id="syntax-tutorial-label">
            <strong>Tutorial al empezar</strong>
            <small>Explica cómo marcar los sintagmas cada vez que abres la actividad.</small>
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={shown}
            aria-labelledby="syntax-tutorial-label"
            aria-busy={busy || undefined}
            onClick={() => void toggle()}
          />
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
