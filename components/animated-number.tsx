"use client";
// Number that rolls when it changes (PROMPT_EXAMEN_ESTILO.md §6): the new
// value slides in from below when it grows and from above when it shrinks,
// the old one leaves the other way. 200 ms (--dur-number), transform and
// opacity only; reduced motion cross-fades. Screen readers read one value.
import { useEffect, useState } from "react";
import { formatNumber, rollDirection } from "@/lib/motion";

export function AnimatedNumber({
  value,
  decimals = 0,
  format,
  label,
  className,
}: {
  value: number;
  decimals?: number;
  /** Custom text, e.g. (n) => `${n} días`. */
  format?: (value: number) => string;
  /** Accessible text when the bare number is not enough ("8 sobre 10"). */
  label?: string;
  className?: string;
}) {
  const text = format ? format(value) : formatNumber(value, decimals);
  const [shown, setShown] = useState({
    value,
    text,
    previous: null as string | null,
    dir: "up" as "up" | "down",
    n: 0,
  });
  if (shown.text !== text) {
    setShown({
      value,
      text,
      previous: shown.text,
      dir: rollDirection(shown.value, value),
      n: shown.n + 1,
    });
  }
  // Safety net when animations don't run: drop the old value anyway.
  const n = shown.n;
  useEffect(() => {
    if (n === 0) return;
    const id = window.setTimeout(
      () => setShown((s) => (s.n === n ? { ...s, previous: null } : s)),
      400,
    );
    return () => window.clearTimeout(id);
  }, [n]);
  return (
    <span className={`num-roll${className ? ` ${className}` : ""}`}>
      <span className="visually-hidden">{label ?? text}</span>
      {shown.previous !== null && (
        <span
          key={`out-${shown.n}`}
          className="num-roll-out"
          data-dir={shown.dir}
          aria-hidden="true"
          onAnimationEnd={() =>
            setShown((s) => (s.n === shown.n ? { ...s, previous: null } : s))
          }
        >
          {shown.previous}
        </span>
      )}
      <span
        key={`in-${shown.n}`}
        className="num-roll-in"
        data-dir={shown.n > 0 ? shown.dir : undefined}
        aria-hidden="true"
      >
        {shown.text}
      </span>
    </span>
  );
}
