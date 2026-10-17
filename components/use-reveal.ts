"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  createReveal,
  finishReveal,
  revealDone,
  stepReveal,
  type RevealClock,
} from "@/lib/reveal";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Created on first use (in the browser), in instant mode with reduced motion. */
const clockOf = (ref: { current: RevealClock | null }) =>
  (ref.current ??= createReveal(reducedMotion()));

/**
 * Soft reveal of an answer that is already in the DOM (words wrapped in
 * <span data-w> by rehypeRevealWords). Each frame it only adds a class to
 * the words that become visible: React does not re-render during the reveal,
 * and the Markdown tree is the final one, so nothing moves when it ends.
 *
 * Returns `revealing` (true until everything has arrived and is visible) and
 * `finish` (tap or click: show everything now). With reduced motion the
 * clock starts in instant mode.
 */
export function useReveal(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  complete: boolean,
) {
  const [revealing, setRevealing] = useState(enabled);
  const clock = useRef<RevealClock | null>(null);
  const units = useRef<HTMLElement[]>([]);
  const shown = useRef(0);
  const caret = useRef<HTMLElement | null>(null);
  const frame = useRef(0);
  const stale = useRef(false);
  const completeRef = useRef(complete);

  /** Mark words [from, n) visible, move the caret, unhide started blocks. */
  const apply = useCallback(
    (n: number, from: number) => {
      const list = units.current;
      const end = Math.min(n, list.length);
      for (let i = from; i < end; i++) list[i].classList.add("is-shown");
      shown.current = n;
      const last = end > 0 ? list[end - 1] : null;
      if (caret.current !== last) {
        caret.current?.classList.remove("is-caret");
        last?.classList.add("is-caret");
        caret.current = last;
      }
      // Blocks whose first word is not visible yet take no space, so the
      // thread (and the auto-scroll) grows with what can be read.
      const md = root.current?.querySelector(".markdown");
      if (!md) return;
      let previous = true;
      for (const child of Array.from(md.children)) {
        const first = child.matches("[data-w]")
          ? child
          : child.querySelector("[data-w]");
        const visible: boolean = first
          ? first.classList.contains("is-shown")
          : previous;
        child.toggleAttribute("data-pending", !visible);
        previous = visible;
      }
    },
    [root],
  );

  const tick = useCallback(
    (now: number) => {
      frame.current = 0;
      // The Markdown chunk may still be resolving (plain-text fallback, no
      // words yet), for example when the answer mounted already complete
      // after Inicio's hand-off: wait for the real tree instead of ending
      // the reveal with zero words, then pick the words up again (the
      // Suspense resolution does not re-render this component).
      if (root.current?.querySelector(".markdown-pending")) {
        stale.current = true;
        frame.current = requestAnimationFrame(tick);
        return;
      }
      if (stale.current && root.current) {
        stale.current = false;
        units.current = Array.from(
          root.current.querySelectorAll<HTMLElement>("[data-w]"),
        );
        apply(shown.current, 0);
      }
      const c = clockOf(clock);
      const total = units.current.length;
      const done = completeRef.current;
      // The last word may still be half received while the answer streams.
      const available = done || c.instant ? total : Math.max(0, total - 1);
      const n = stepReveal(c, now, available, done);
      if (n !== shown.current) apply(n, Math.min(n, shown.current));
      if (revealDone(c, available)) {
        setRevealing(false);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    },
    [apply],
  );

  // After every commit (a streamed block re-rendered its spans): pick up the
  // words again and mark the visible ones before the browser paints.
  useLayoutEffect(() => {
    completeRef.current = complete;
    if (!revealing || !root.current) return;
    units.current = Array.from(
      root.current.querySelectorAll<HTMLElement>("[data-w]"),
    );
    // Instant (reduced motion, or after a tap): visible in this same paint.
    apply(clockOf(clock).instant ? units.current.length : shown.current, 0);
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  });
  useEffect(() => {
    const f = frame;
    return () => cancelAnimationFrame(f.current);
  }, []);

  const finish = useCallback(() => {
    const c = clockOf(clock);
    if (c.instant) return;
    finishReveal(c);
    apply(units.current.length, shown.current);
  }, [apply]);

  return { revealing, finish };
}
