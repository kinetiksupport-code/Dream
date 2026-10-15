"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { installPath, installStore, type InstallPath } from "@/lib/pwa";

/** "Instalar Dream" in Ajustes. Optional: never blocks the app. */
export function InstallDream() {
  const prompt = useSyncExternalStore(
    installStore.subscribe,
    installStore.getPrompt,
    () => null,
  );
  const installed = useSyncExternalStore(
    installStore.subscribe,
    installStore.getInstalled,
    () => false,
  );
  const [path, setPath] = useState<InstallPath>("unavailable");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setPath(
      installed
        ? "installed"
        : installPath({
            standalone:
              matchMedia("(display-mode: standalone)").matches ||
              (navigator as Navigator & { standalone?: boolean })
                .standalone === true,
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints,
            hasPrompt: !!prompt,
          }),
    );
  }, [prompt, installed]);
  if (path === "unavailable") return null;
  return (
    <section className="group" aria-labelledby="install-title">
      <h2 className="section-title" id="install-title">
        Instalar Dream
      </h2>
      {path === "installed" ? (
        <p className="page-intro">Dream ya está instalado en este dispositivo.</p>
      ) : path === "prompt" ? (
        <>
          <p className="page-intro">
            Ábrelo desde tu pantalla de inicio, a pantalla completa.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="primary press"
              onClick={async () => {
                if (!prompt) return;
                await prompt.prompt();
                const choice = await prompt.userChoice;
                installStore.setPrompt(null);
                if (choice.outcome === "accepted") installStore.markInstalled();
                else setMessage("Puedes instalarlo cuando quieras.");
              }}
            >
              Instalar Dream
            </button>
          </div>
          {message && (
            <p className="page-intro" role="status">
              {message}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="page-intro">
            En iPhone y iPad, añade Dream a tu pantalla de inicio:
          </p>
          <ol className="install-steps">
            <li>Toca el botón Compartir de Safari.</li>
            <li>Elige «Añadir a pantalla de inicio».</li>
            <li>Confirma con «Añadir».</li>
          </ol>
        </>
      )}
    </section>
  );
}
