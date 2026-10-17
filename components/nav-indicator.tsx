"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Shared active-item pill for the sidebar (slides on Y) and the mobile tab
 * bar (slides on X). It sits behind the link with aria-current="page", so the
 * link keeps announcing the current section; the pill is decorative.
 *
 * emil-design-eng: it moves only with `transform` (CSS transition, so a quick
 * second click retargets it). It does not animate on first paint, after a
 * resize, or when the change came from the keyboard ("never animate
 * keyboard-initiated actions"). Reduced motion: the global rule in
 * globals.css drops the transform transition, so it jumps without sliding.
 */
export function NavIndicator({ activeKey }: { activeKey: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  // Time of the last Enter/Space inside the nav (0 after a pointer press).
  const keyboardAt = useRef(0);

  const place = useCallback((animate: boolean) => {
    const pill = ref.current;
    const container = pill?.parentElement;
    if (!pill || !container) return;
    const target = container.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    // Hidden container (tab bar on desktop) or no current section.
    if (!target || target.offsetParent === null) {
      pill.dataset.state = "hidden";
      container.dataset.indicator = "off";
      placed.current = false;
      return;
    }
    const fromKeyboard =
      keyboardAt.current > 0 && performance.now() - keyboardAt.current < 2000;
    const slide = animate && placed.current && !fromKeyboard;
    if (!slide) pill.style.transition = "none";
    pill.style.width = `${target.offsetWidth}px`;
    pill.style.height = `${target.offsetHeight}px`;
    // Write transform directly (not a CSS variable on the parent): only this
    // element restyles (emil-design-eng › CSS variables are inheritable).
    pill.style.transform = `translateX(${target.offsetLeft}px) translateY(${target.offsetTop}px)`;
    pill.dataset.state = "on";
    container.dataset.indicator = "on";
    if (!slide) {
      void pill.offsetWidth; // commit the jump before transitions come back
      pill.style.transition = "";
    }
    placed.current = true;
    keyboardAt.current = 0;
  }, []);

  // Runs after the new aria-current is in the DOM, before paint.
  useLayoutEffect(() => {
    place(true);
  }, [activeKey, place]);

  useEffect(() => {
    const container = ref.current?.parentElement;
    if (!container) return;
    // Layout changes (sidebar → rail → tab bar, rotation) snap, never slide.
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ")
        keyboardAt.current = performance.now();
    };
    const onPointer = () => {
      keyboardAt.current = 0;
    };
    container.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      observer.disconnect();
      container.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [place]);

  return (
    <span
      ref={ref}
      className="nav-indicator"
      data-state="hidden"
      aria-hidden="true"
    />
  );
}
