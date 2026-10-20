"use client";
// La ruedecita de la nota (§5.6 y §6): rodillo vertical con scroll-snap de
// 0 a 10 en saltos de 0,5. El valor central es grande y nítido; los vecinos
// encogen y se aclaran con la distancia (transform y opacity, escritos en el
// propio elemento en cada fotograma). Al asentarse, un pequeño rebote con el
// muelle suave; vibración de 8 ms donde exista (Android). Accesible como
// slider: flechas ±0,5, Re Pág/Av Pág ±1, Inicio y Fin.
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import {
  GRADE,
  GRADE_VALUES,
  formatGrade,
  gradeForKey,
  gradeIndexAt,
  wheelItemStyle,
} from "@/lib/exam-wizard";
import s from "./wizard.module.css";

const ITEM = 64;
/** Top of the wheel is 10: «up» means a higher grade. */
const VALUES = [...GRADE_VALUES].reverse();
const indexOf = (v: number) => VALUES.indexOf(v);

export function GradeWheel({
  value,
  onChange,
  labelledBy,
}: {
  value: number;
  onChange: (v: number) => void;
  labelledBy: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const current = useRef(value);
  const frame = useRef(0);
  const settleTimer = useRef(0);
  const change = useRef(onChange);
  change.current = onChange;

  const paint = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const exact = el.scrollTop / ITEM;
    items.current.forEach((item, i) => {
      if (!item) return;
      const { scale, opacity } = wheelItemStyle(i - exact);
      item.style.transform = `scale(${scale})`;
      item.style.opacity = String(opacity);
    });
    const v = VALUES[gradeIndexAt(el.scrollTop, ITEM)];
    if (v !== current.current) {
      current.current = v;
      change.current(v);
      if ("vibrate" in navigator) navigator.vibrate?.(8);
    }
  }, []);

  const settle = useCallback(() => {
    const item = items.current[indexOf(current.current)];
    if (!item) return;
    delete item.dataset.settle;
    void item.offsetWidth; // restart the one-off bounce
    item.dataset.settle = "";
  }, []);

  // Initial position, without animation.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = indexOf(current.current) * ITEM;
    paint();
  }, [paint]);

  // Value changed from outside (keyboard): scroll to it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || value === current.current) return;
    current.current = value;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: indexOf(value) * ITEM, behavior: reduce ? "auto" : "smooth" });
  }, [value]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settleTimer.current);
    },
    [],
  );

  function onScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
    clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 140);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = gradeForKey(value, e.key);
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onChange(next);
  }

  return (
    <div
      className={s.wheel}
      role="slider"
      tabIndex={0}
      aria-labelledby={labelledBy}
      aria-valuemin={GRADE.min}
      aria-valuemax={GRADE.max}
      aria-valuenow={value}
      aria-valuetext={`${formatGrade(value)} sobre 10`}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      <div
        ref={scroller}
        className={s.wheelScroller}
        onScroll={onScroll}
        aria-hidden="true"
        data-testid="grade-wheel-scroller"
      >
        {VALUES.map((v, i) => (
          <div
            key={v}
            ref={(el) => {
              items.current[i] = el;
            }}
            className={s.wheelItem}
            onClick={() => {
              const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
              scroller.current?.scrollTo({ top: i * ITEM, behavior: reduce ? "auto" : "smooth" });
            }}
          >
            {formatGrade(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
