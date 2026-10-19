"use client";
// Bottom sheet of the new style (PROMPT_EXAMEN_ESTILO.md §6), built on Modal
// (focus trap, Escape, inert app, portal). On phones it rises with the drawer
// curve and closes with a drag or a quick flick on the grabber
// (emil-design-eng: velocity > 0.11 px/ms dismisses, friction when dragged
// up, pointer capture, one finger at a time). On wider screens it is the
// usual centred dialog. Always keep a visible way out in the content
// (a button), as apple-design sheets.md asks; Escape and the backdrop also
// close it.
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Modal } from "./modal";
import { dragOffset, shouldDismiss } from "@/lib/motion";

const PHONE = "(max-width: 639.98px)";
const OUT_MS = 200; // --dur-base

export function BottomSheet({
  children,
  labelledBy,
  describedBy,
  onClose,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{
    id: number;
    y: number;
    t: number;
    last: number;
    el: HTMLElement;
  } | null>(null);

  function settle(el: HTMLElement, to: string, done?: () => void) {
    el.dataset.drag = "settle";
    el.style.transform = to;
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      // "rest" keeps the entry animation off, so it never replays.
      if (!done) el.dataset.drag = "rest";
      done?.();
    };
    el.addEventListener("transitionend", end, { once: true });
    window.setTimeout(end, OUT_MS + 80); // reduced motion: no transition
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (drag.current || !window.matchMedia(PHONE).matches) return;
    const el = e.currentTarget.closest<HTMLElement>(".bottom-sheet");
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      y: e.clientY,
      t: performance.now(),
      last: 0,
      el,
    };
    el.dataset.drag = "move";
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.last = e.clientY - d.y;
    // Transform on the element itself, no CSS variable (no style recalc
    // on the children).
    d.el.style.transform = `translateY(${dragOffset(d.last)}px)`;
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>, cancelled = false) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const close =
      !cancelled &&
      shouldDismiss(d.last, performance.now() - d.t, d.el.offsetHeight);
    if (!close) return settle(d.el, "");
    setLeaving(true);
    settle(d.el, "translateY(110%)", onClose);
  }

  return (
    <Modal
      labelledBy={labelledBy}
      describedBy={describedBy}
      onClose={onClose}
      leaving={leaving}
      className="bottom-sheet"
    >
      <div
        className="sheet-grabber"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e)}
        onPointerCancel={(e) => onPointerEnd(e, true)}
      />
      {children}
    </Modal>
  );
}
