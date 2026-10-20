"use client";
import { useEffect, useRef, useState } from "react";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

/**
 * Toast with an optional action (Deshacer, Reintentar). With `duration` it
 * closes itself through `onExpire`, but the countdown pauses while the
 * pointer is over it, while it holds keyboard focus and while the tab is
 * hidden (emil-design-eng › Sonner principles; apple-design
 * accessibility.md › Minimize use of time-boxed interface elements).
 */
export function Toast({
  message,
  error = false,
  onClose,
  action,
  duration,
  onExpire,
  announce = true,
}: {
  message: string;
  error?: boolean;
  /** False when a parent aria-live region already announces the message. */
  announce?: boolean;
  onClose?: () => void;
  action?: { label: string; run: () => void };
  duration?: number;
  onExpire?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const remaining = useRef(duration ?? 0);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const paused = hovered || focused || hidden;

  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (!duration || paused) return;
    const started = Date.now();
    const timer = window.setTimeout(
      () => {
        remaining.current = 0;
        expire.current?.();
      },
      Math.max(0, remaining.current),
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [duration, paused]);

  return (
    <div
      className={`toast${error ? " toast-error" : ""}`}
      role={announce ? (error ? "alert" : "status") : undefined}
      aria-live={announce ? (error ? "assertive" : "polite") : undefined}
      aria-atomic={announce ? true : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      {error ? <AlertIcon /> : <CheckIcon />}
      <span>{message}</span>
      {action && (
        <button className="toast-action press" onClick={action.run}>
          {action.label}
        </button>
      )}
      {onClose && (
        <button
          className="icon-button press"
          aria-label="Cerrar aviso"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
