"use client";
import { useEffect, useState } from "react";
import { TYPING } from "@/lib/typing";

/**
 * «Dream está escribiendo…» before the first character of an answer (P5).
 * Waits TYPING.indicatorDelayMs so a fast answer does not flash it. The dots
 * only change opacity and position (transform); with reduced motion they
 * stay still. Read once by screen readers.
 */
export function TypingIndicator() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), TYPING.indicatorDelayMs);
    return () => window.clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      <span className="typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="typing-label">Dream está escribiendo…</span>
    </div>
  );
}
