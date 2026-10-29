"use client";
import { useEffect, useId, useRef, useState } from "react";
import { HUMAN_CHECK_MESSAGE, currentTheme, loadTurnstile, turnstileSiteKey, type TurnstileAction } from "@/lib/turnstile";
import styles from "./human-check.module.css";

/**
 * Widget de Turnstile (modo managed, en español, tema de Dream). Llama a
 * onToken con un token nuevo; tras un error o al caducar se reinicia solo.
 * Cada vez que cambia `resetKey` pide un token nuevo (un token vale una vez).
 */
export function Turnstile({
  action,
  onToken,
  resetKey = 0,
  error = "",
}: {
  action: TurnstileAction;
  onToken: (token: string | null) => void;
  resetKey?: number;
  /** Mensaje que viene del servidor (por ejemplo, token rechazado). */
  error?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  report.current = onToken;
  const [problem, setProblem] = useState("");
  const id = useId();

  useEffect(() => {
    let gone = false;
    const sitekey = turnstileSiteKey();
    if (!sitekey) return;
    loadTurnstile()
      .then((api) => {
        if (gone || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey,
          action,
          language: "es",
          theme: currentTheme(),
          size: "flexible",
          "response-field": false,
          "refresh-expired": "auto",
          callback: (token) => {
            setProblem("");
            report.current(token);
          },
          "error-callback": () => {
            setProblem(HUMAN_CHECK_MESSAGE);
            report.current(null);
            if (widget.current) api.reset(widget.current);
            return true; // Ya lo gestionamos: sin error en la consola.
          },
          "expired-callback": () => report.current(null),
          "timeout-callback": () => {
            report.current(null);
            if (widget.current) api.reset(widget.current);
          },
        });
      })
      .catch(() => {
        if (!gone) setProblem(HUMAN_CHECK_MESSAGE);
      });
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [action]);

  // Token usado (o rechazado por el servidor): pide uno nuevo.
  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    report.current(null);
    window.turnstile?.reset(widget.current);
  }, [resetKey]);

  const message = error || problem;
  return (
    <div className={styles.check} role="group" aria-labelledby={`${id}-label`} aria-describedby={message ? `${id}-error` : undefined}>
      <p id={`${id}-label`} className={styles.label}>
        Comprobación de seguridad
      </p>
      <div ref={box} className={styles.widget} />
      {message && (
        <p id={`${id}-error`} className="error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
