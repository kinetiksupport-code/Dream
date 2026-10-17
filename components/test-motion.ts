"use client";
// Motion helpers for the Test and Simulacro screens (emil-design-eng):
// enter-only question slides with WAAPI (interruptible, never blocking),
// a skippable score count with rAF, and a discreet selection haptic.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Same curve as --ease in app/globals.css (strong ease-out for entering UI).
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type Direction = "forward" | "back";

/**
 * Short slide (14 px) plus fade when a new question mounts, 220 ms with the
 * strong ease-out. Enter-only, so a fast tap on «Siguiente» is never held
 * back: the new element simply replaces the old one and any running
 * animation is cancelled. Reduced motion keeps only the fade.
 */
export function useQuestionEnter<T extends HTMLElement>(
  key: string | undefined,
  direction: Direction,
) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !key) return;
    // The first question of a test arrives with the page; no slide then.
    if (first.current) {
      first.current = false;
      return;
    }
    if (typeof el.animate !== "function") return;
    const reduce = prefersReducedMotion();
    const dx = direction === "forward" ? 14 : -14;
    el.dataset.enter = direction;
    const animation = el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${dx}px)` },
            { opacity: 1, transform: "translateX(0)" },
          ],
      { duration: 220, easing: EASE_OUT },
    );
    animation.id = "question-enter";
    return () => animation.cancel();
  }, [key, direction]);
  return ref;
}

/**
 * Counts from 0 to 1 over ~600 ms (ease-out), for the result score. Any key
 * or tap skips to the end; reduced motion shows the final value at once.
 */
export function useCountProgress(duration = 600) {
  // Reduced motion starts at the final value: not even one frame at 0.
  const [progress, setProgress] = useState(() =>
    prefersReducedMotion() ? 1 : 0,
  );
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const start = performance.now();
    const skip = () => {
      cancelAnimationFrame(frame);
      setProgress(1);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(tick);
      else cleanup();
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, [duration]);
  return progress;
}

/**
 * A 10 ms tap when someone picks an answer on a touch screen. Never with
 * reduced motion, never on desktop (apple-design playing-haptics.md: short,
 * consistent, complementing the visual change).
 */
export function selectionHaptic() {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  navigator.vibrate?.(10);
}
