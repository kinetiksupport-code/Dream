"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SLOW_TEXT, retryText, slowNotice } from "@/lib/slow-requests";
import { Toast } from "./toast";

/**
 * Aviso global cuando una lectura a Dream tarda más de 8 s o falla un momento:
 * «Dream está tardando más de lo habitual…» y, si hay que reintentar, la
 * cuenta atrás de 10 s o 20 s con «Reintentar ya». El chat de IA tiene su
 * propia espera y no pasa por aquí.
 */
export function SlowNotice() {
  const notice = useSyncExternalStore(
    slowNotice.subscribe,
    slowNotice.get,
    () => null,
  );
  const [now, setNow] = useState(() => Date.now());
  const retrying = notice?.kind === "retry";
  useEffect(() => {
    if (!retrying) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retrying]);
  return (
    <div className="toast-position" role="status" aria-live="polite">
      {notice && (
        <Toast
          error={retrying}
          message={
            notice.kind === "retry"
              ? retryText((notice.until - now) / 1000)
              : SLOW_TEXT
          }
          action={
            notice.kind === "retry"
              ? { label: "Reintentar ya", run: slowNotice.retryNow }
              : undefined
          }
          announce={false}
        />
      )}
    </div>
  );
}
