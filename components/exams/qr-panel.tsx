"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/dream-api";
import {
  closeUploadSession,
  createUploadSession,
  renewUploadSession,
  shouldRenew,
  watchUploadSession,
  type UploadSessionFile,
} from "@/lib/upload-session";
import styles from "@/components/upload/upload.module.css";

type View =
  | { kind: "loading" }
  | { kind: "ready"; path: string; size: number; connected: boolean }
  | { kind: "expired" }
  | { kind: "error"; message: string };

/**
 * Desktop panel "O súbelos desde tu móvil": shows a one-time QR for the
 * exam draft and reports the phone's files as they arrive. Ready to drop
 * into the exam wizard's upload step (wide screens with a fine pointer).
 * Mount it while that step is visible; unmounting closes the code.
 */
export function QrPanel({
  examId,
  onFiles,
  onConnectedChange,
}: {
  examId: string;
  /** Every change in the phone's list (processing, processed, failed). */
  onFiles?: (files: UploadSessionFile[]) => void;
  onConnectedChange?: (connected: boolean) => void;
}) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onFiles, onConnectedChange });
  callbacks.current = { onFiles, onConnectedChange };

  useEffect(() => {
    const abort = new AbortController();
    let sessionId = "";
    let expiresAt = "";
    let renewTimer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const [session, qr] = await Promise.all([
          createUploadSession(examId, abort.signal),
          import("@/lib/qr"),
        ]);
        if (abort.signal.aborted) {
          void closeUploadSession(session.id).catch(() => {});
          return;
        }
        sessionId = session.id;
        expiresAt = session.expiresAt;
        const code = qr.encodeQr(session.url);
        setView({
          kind: "ready",
          path: qr.qrPath(code),
          size: code.size + 8,
          connected: false,
        });
        watchUploadSession(
          session.id,
          {
            onStatus: (status) => {
              expiresAt = status.expires_at;
              callbacks.current.onFiles?.(status.files);
              callbacks.current.onConnectedChange?.(status.connected);
              if (status.state === "expired" || status.state === "closed")
                setView({ kind: "expired" });
              else
                setView((v) =>
                  v.kind === "ready"
                    ? { ...v, connected: status.connected }
                    : v,
                );
            },
          },
          abort.signal,
        );
        // Keep the code alive while it is on screen (10 more minutes each time).
        renewTimer = setInterval(() => {
          if (document.hidden || !shouldRenew(expiresAt)) return;
          renewUploadSession(sessionId, abort.signal)
            .then((next) => (expiresAt = next))
            .catch(() => {
              if (!abort.signal.aborted) setView({ kind: "expired" });
            });
        }, 30_000);
      } catch (error) {
        if (!abort.signal.aborted)
          setView({ kind: "error", message: errorMessage(error) });
      }
    })();
    return () => {
      abort.abort();
      clearInterval(renewTimer);
      // Leaving the step invalidates the code at once.
      if (sessionId) void closeUploadSession(sessionId).catch(() => {});
    };
  }, [examId, attempt]);

  const again = useCallback(() => {
    setView({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <section className={styles.panel} aria-labelledby="qr-panel-title">
      <h2 id="qr-panel-title" className={styles.panelTitle}>
        O súbelos desde tu móvil. Escanea el código
      </h2>
      <div
        className={styles.qrFrame}
        data-stale={view.kind === "expired" || undefined}
        aria-busy={view.kind === "loading"}
      >
        {view.kind === "ready" && (
          <svg
            viewBox={`0 0 ${view.size} ${view.size}`}
            role="img"
            aria-label="Código QR para subir apuntes desde tu móvil"
            shapeRendering="crispEdges"
          >
            <path d={view.path} fill="#000000" />
          </svg>
        )}
      </div>
      {view.kind === "ready" && (
        <p
          className={styles.status}
          data-connected={view.connected}
          role="status"
        >
          <span className={styles.dot} aria-hidden="true" />
          {view.connected ? "Móvil conectado" : "Esperando a tu móvil…"}
        </p>
      )}
      {view.kind === "loading" && (
        <p className={styles.status} role="status">
          Preparando el código…
        </p>
      )}
      {view.kind === "expired" && (
        <>
          <p className={styles.status} role="status">
            Este código ha caducado.
          </p>
          <button type="button" className="secondary press" onClick={again}>
            Crear otro código
          </button>
        </>
      )}
      {view.kind === "error" && (
        <>
          <p className={styles.status} role="alert">
            {view.message}
          </p>
          <button type="button" className="secondary press" onClick={again}>
            Volver a probar
          </button>
        </>
      )}
      <p className={styles.hint}>
        Este código es solo para ti y caduca. No lo compartas.
      </p>
    </section>
  );
}
