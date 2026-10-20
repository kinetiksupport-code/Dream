"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { captureDiagnostic } from "@/lib/observability/diagnostics";
import {
  installStore,
  updateReducer,
  type InstallPromptEvent,
  type UpdateEvent,
  type UpdateStatus,
} from "@/lib/pwa";
import { useOnline } from "@/lib/use-online";
import { Toast } from "./toast";

/**
 * App-wide PWA plumbing: registers the service worker, offers the update
 * ("Hay una versión nueva · Actualizar") and reports connectivity. The chat
 * needs a connection; the composer keeps whatever the user typed meanwhile.
 */
export function ConnectionStatus() {
  const online = useOnline();
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const statusRef = useRef<UpdateStatus>("idle");
  const waiting = useRef<ServiceWorker | null>(null);
  const dispatch = useCallback((event: UpdateEvent) => {
    const result = updateReducer(statusRef.current, event);
    statusRef.current = result.status;
    setStatus(result.status);
    if (result.post) waiting.current?.postMessage({ type: result.post });
    if (result.reload) window.location.reload();
  }, []);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      installStore.setPrompt(event as InstallPromptEvent);
    };
    const installed = () => installStore.markInstalled();
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let alive = true;
    let timer = 0;
    const onControllerChange = () => dispatch({ type: "controllerchange" });
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (
          alive &&
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          waiting.current = worker;
          dispatch({ type: "waiting" });
        }
      };
      check();
      worker.addEventListener("statechange", check);
    };
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (!alive) return;
        track(registration.waiting);
        registration.addEventListener("updatefound", () =>
          track(registration.installing),
        );
        // Long-lived tabs (installed app) look for new versions every 30 min.
        timer = window.setInterval(
          () => void registration.update().catch(() => {}),
          30 * 60 * 1000,
        );
      })
      .catch(() =>
        captureDiagnostic(new Error("PWA registration failed"), {
          section: "other",
          outcome: "network_error",
        }),
      );
    return () => {
      alive = false;
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [dispatch]);

  return (
    <>
      {!online && (
        <div className="connection-status" role="status" aria-live="polite">
          Sin conexión. El chat necesita red; lo que escribas se conserva.
        </div>
      )}
      {(status === "available" || status === "activating") && (
        <div className="toast-position">
          <Toast
            message="Hay una versión nueva"
            action={{
              label: status === "activating" ? "Actualizando…" : "Actualizar",
              run: () => dispatch({ type: "accept" }),
            }}
            onClose={() => dispatch({ type: "dismiss" })}
          />
        </div>
      )}
    </>
  );
}
