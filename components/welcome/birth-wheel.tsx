"use client";
// Fecha de nacimiento con ruedas tipo iOS (día, mes, año), hechas como la
// ruedecita de la nota (components/exams/wizard/grade-wheel.tsx): rodillo con
// scroll-snap, el valor central grande y los vecinos más pequeños y claros
// (transform y opacity escritos en cada fotograma), rebote corto al asentarse
// y vibración de 8 ms donde exista. Cada rueda es un slider accesible
// (flechas, Re Pág/Av Pág, Inicio, Fin) con su valor en texto. Alternativa:
// «Escribir la fecha» abre un campo de fecha nativo.
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { wheelItemStyle } from "@/lib/exam-wizard";
import {
  MONTHS,
  birthYears,
  daysInMonth,
  setBirthPart,
  wheelIndexForKey,
  type BirthParts,
} from "@/lib/onboarding";
import s from "./welcome.module.css";

const ITEM = 52;

function WheelColumn({
  label,
  values,
  value,
  format,
  page,
  onChange,
}: {
  label: string;
  values: number[];
  value: number;
  format: (v: number) => string;
  page: number;
  onChange: (v: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const current = useRef(value);
  const frame = useRef(0);
  const settleTimer = useRef(0);
  const change = useRef(onChange);
  change.current = onChange;
  // Index the wheel is gliding to after a key press: until it gets there, the
  // values it passes on the way are not the student's choice.
  const target = useRef<number | null>(null);
  const list = useRef(values);
  list.current = values;
  const index = Math.max(0, values.indexOf(value));

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
    const i = Math.min(list.current.length - 1, Math.max(0, Math.round(exact)));
    if (target.current !== null) {
      if (Math.abs(exact - target.current) > 0.05) return;
      target.current = null;
    }
    const v = list.current[i];
    if (v !== current.current) {
      current.current = v;
      change.current(v);
      if ("vibrate" in navigator) navigator.vibrate?.(8);
    }
  }, []);

  const settle = useCallback(() => {
    const item = items.current[list.current.indexOf(current.current)];
    if (!item) return;
    delete item.dataset.settle;
    void item.offsetWidth; // restart the one-off bounce
    item.dataset.settle = "";
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = index * ITEM;
    paint();
    // Only on mount: later changes scroll smoothly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  // Value changed from outside (keyboard, the day clamped to the month, the
  // date field): scroll to it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || value === current.current) return;
    current.current = value;
    target.current = index;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: index * ITEM, behavior: reduce ? "auto" : "smooth" });
  }, [value, index]);

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
    const next = wheelIndexForKey(index, values.length, e.key, page);
    if (next === null) return;
    e.preventDefault();
    if (next !== index) onChange(values[next]);
  }

  return (
    <div
      className={s.wheel}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={values[0]}
      aria-valuemax={values[values.length - 1]}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      <div
        ref={scroller}
        className={s.wheelScroller}
        onScroll={onScroll}
        onPointerDown={() => (target.current = null)}
        onWheel={() => (target.current = null)}
        aria-hidden="true"
      >
        {values.map((v, i) => (
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
            {format(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const MONTH_VALUES = range(1, 12);

export function BirthWheel({
  value,
  onChange,
}: {
  value: BirthParts;
  onChange: (v: BirthParts) => void;
}) {
  const days = range(1, daysInMonth(value.year, value.month));
  const years = birthYears();
  return (
    <div className={s.wheels} role="group" aria-label="Fecha de nacimiento">
      <WheelColumn
        label="Día"
        values={days}
        value={value.day}
        format={String}
        page={7}
        onChange={(v) => onChange(setBirthPart(value, "day", v))}
      />
      <WheelColumn
        label="Mes"
        values={MONTH_VALUES}
        value={value.month}
        format={(m) => MONTHS[m - 1]}
        page={3}
        onChange={(v) => onChange(setBirthPart(value, "month", v))}
      />
      <WheelColumn
        label="Año"
        values={years}
        value={value.year}
        format={String}
        page={10}
        onChange={(v) => onChange(setBirthPart(value, "year", v))}
      />
    </div>
  );
}
