"use client";
import { useEffect, useState } from "react";
import { captureDiagnostic } from "@/lib/observability/diagnostics";
export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    let alive = true;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (!alive) return;
          if (reg.waiting) setUpdate(true);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                alive &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(true);
            });
          });
        })
        .catch(() =>
          captureDiagnostic(new Error("PWA registration failed"), {
            section: "other",
            outcome: "network_error",
          }),
        );
    return () => {
      alive = false;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  if (!offline && !update) return null;
  return (
    <div className="connection-status" role="status" aria-live="polite">
      {offline
        ? "Sin conexión. Conservamos el texto abierto; vuelve a intentarlo cuando tengas red."
        : "Hay una actualización disponible. Se instalará cuando cierres todas las ventanas de Dream."}
      {!offline && (
        <button
          type="button"
          aria-label="Ocultar aviso de actualización"
          onClick={() => setUpdate(false)}
        >
          ×
        </button>
      )}
    </div>
  );
}
