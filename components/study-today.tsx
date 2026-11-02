"use client";
// Repaso de hoy y meta diaria suave (prompt de la ruta, Bloque 6.1 y 6.7):
// «14 tarjetas para repasar (≈5 min)» y «Hoy: 1 lección o 10 tarjetas». Sin
// rachas, puntos ni avisos que presionen: si no se cumple, no pasa nada.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Layers } from "lucide-react";
import { studyStepsEnabled } from "@/lib/study-steps";
import { studyToday, type StudyToday } from "@/lib/study-api";

export function useStudyToday() {
  const [today, setToday] = useState<StudyToday | null>(null);
  useEffect(() => {
    if (!studyStepsEnabled()) return;
    let alive = true;
    studyToday()
      .then((t) => alive && Number.isInteger(t?.due) && t.goal && setToday(t))
      .catch(() => undefined); // si falla, simplemente no se enseña
    return () => {
      alive = false;
    };
  }, []);
  return today;
}

export function goalText(t: StudyToday) {
  const met = t.lessons_today >= t.goal.lessons || t.reviewed_today >= t.goal.cards;
  return met ? "Meta de hoy hecha" : `Hoy: ${t.goal.lessons} lección o ${t.goal.cards} tarjetas`;
}

/** Enlace al repaso de hoy; solo aparece si hay tarjetas que tocan. */
export function DueLink({ today, className, from }: { today: StudyToday | null; className?: string; from?: string }) {
  if (!today?.due) return null;
  return (
    <Link className={className} href={`/exams/repaso${from ? `?desde=${from}` : ""}`} data-testid="repaso-hoy">
      <Layers size={16} aria-hidden="true" />
      <span>
        <span className="num">{today.due}</span> {today.due === 1 ? "tarjeta" : "tarjetas"} para repasar (≈<span className="num">{today.minutes}</span> min)
      </span>
    </Link>
  );
}

/** En Inicio: el repaso de hoy y la meta, en una línea. */
export function HomeStudyToday() {
  const today = useStudyToday();
  if (!today || (!today.due && today.lessons_today < 1 && today.reviewed_today < 1)) return null;
  const met = today.lessons_today >= today.goal.lessons || today.reviewed_today >= today.goal.cards;
  return (
    <div className="home-study-today rise rise-2">
      <DueLink today={today} className="chip home-chip press" />
      <span className="home-study-goal">
        {met && <Check size={14} aria-hidden="true" />} {goalText(today)}
      </span>
    </div>
  );
}
