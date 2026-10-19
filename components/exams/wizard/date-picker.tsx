"use client";
// Selector de fecha propio (§5.5): calendario grande, sin días pasados,
// accesible (rejilla con foco itinerante: flechas, Re Pág/Av Pág, Inicio y
// Fin; Intro o espacio eligen) y la cuenta atrás en vivo debajo.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatedNumber } from "../../animated-number";
import { examDateLabel } from "@/lib/exam-plans";
import {
  MAX_DAYS_AHEAD,
  addDays,
  addMonths,
  countdownParts,
  isoDay,
  monthGrid,
} from "@/lib/exam-wizard";
import s from "./wizard.module.css";

const WEEKDAYS = [
  ["L", "lunes"],
  ["M", "martes"],
  ["X", "miércoles"],
  ["J", "jueves"],
  ["V", "viernes"],
  ["S", "sábado"],
  ["D", "domingo"],
] as const;
const monthName = (y: number, m: number) => {
  const text = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m, 1));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const dayName = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
};

export function DatePicker({
  value,
  onChange,
  today = isoDay(new Date()),
}: {
  value: string;
  onChange: (iso: string) => void;
  today?: string;
}) {
  const max = addDays(today, MAX_DAYS_AHEAD);
  const start = value || today;
  const [focus, setFocus] = useState(start);
  const [view, setView] = useState(() => {
    const [y, m] = start.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const grid = useRef<HTMLTableElement>(null);
  const moved = useRef(false);

  // Keyboard moves focus to the new day (also across months).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, view]);

  function go(iso: string) {
    const target = iso < today ? today : iso > max ? max : iso;
    const [y, m] = target.split("-").map(Number);
    moved.current = true;
    setFocus(target);
    setView({ y, m: m - 1 });
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>, iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(iso, -1),
      ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      PageUp: () => addMonths(iso, -1),
      PageDown: () => addMonths(iso, 1),
      Home: () => addDays(iso, -weekday),
      End: () => addDays(iso, 6 - weekday),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    go(move());
  }
  const [ty, tm] = today.split("-").map(Number);
  const [my, mm] = max.split("-").map(Number);
  const atStart = view.y === ty && view.m === tm - 1;
  const atEnd = view.y === my && view.m === mm - 1;
  const weeks = monthGrid(view.y, view.m);
  const focusInView = weeks.flat().includes(focus);
  const firstFree = weeks.flat().find((d) => d && d >= today && d <= max);
  const tabDay = focusInView && focus >= today ? focus : firstFree;
  const parts = value ? countdownParts(value) : null;

  return (
    <div className={`${s.panel} ${s.calendar}`}>
      <div className={s.calHead}>
        <button
          type="button"
          className={`${s.calNav} press`}
          aria-label="Mes anterior"
          disabled={atStart}
          onClick={() => setView((v) => (v.m ? { y: v.y, m: v.m - 1 } : { y: v.y - 1, m: 11 }))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 id="cal-month" aria-live="polite">
          {monthName(view.y, view.m)}
        </h2>
        <button
          type="button"
          className={`${s.calNav} press`}
          aria-label="Mes siguiente"
          disabled={atEnd}
          onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <table
        ref={grid}
        className={s.calGrid}
        role="grid"
        aria-labelledby="cal-month"
        key={`${view.y}-${view.m}`}
      >
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th key={long} scope="col">
                <abbr title={long}>{short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((iso, j) => (
                <td key={j} role="gridcell" aria-selected={iso ? iso === value : undefined}>
                  {iso && (
                    <button
                      type="button"
                      className={s.day}
                      data-day={iso}
                      data-today={iso === today || undefined}
                      aria-pressed={iso === value}
                      aria-label={`${dayName(iso)}${iso === today ? ", hoy" : ""}`}
                      disabled={iso < today || iso > max}
                      tabIndex={iso === tabDay ? 0 : -1}
                      onKeyDown={(e) => onKey(e, iso)}
                      onClick={() => {
                        setFocus(iso);
                        onChange(iso);
                      }}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={s.countdown} aria-live="polite">
        {parts ? (
          <>
            <span className={s.countdownBig}>
              {parts.n === null ? (
                parts.after
              ) : (
                <>
                  {parts.before}{" "}
                  <AnimatedNumber value={parts.n} label={`${parts.n}`} />{" "}
                  {parts.after}
                </>
              )}
            </span>
            <span className={s.countdownDate}>{examDateLabel(value)}</span>
          </>
        ) : (
          <span className={s.countdownDate}>Toca el día de tu examen.</span>
        )}
      </div>
    </div>
  );
}
