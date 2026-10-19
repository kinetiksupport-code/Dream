"use client";
// «Tu examen está listo» (§5.9), sobre amarillo (decisión de Carlos): el orbe
// y el objeto de la asignatura con una celebración pequeña (unas chispas que
// salen una vez; sin confeti), el principio de la ruta y «Empezar».
import type { CSSProperties } from "react";
import { examTitle, type DreamExam } from "@/lib/exam-plans";
import { Orb } from "../../orb";
import { LiveSubjectObject } from "../../subject-object-live";
import s from "./wizard.module.css";

const SPARKS = [
  [-70, -40],
  [64, -52],
  [-52, -86],
  [40, -96],
  [-96, -6],
  [92, -14],
];

/** Where «Empezar» goes: the route if the AI made one, else the first unit. */
export function startHref(exam: DreamExam) {
  if (exam.route) return `/exams/${exam.id}/ruta`;
  const first = exam.units.find((u) => u.status !== "completed") ?? exam.units[0];
  return first ? `/exams/${exam.id}/study/${first.id}` : `/exams/${exam.id}`;
}

export function StepReady({ exam }: { exam: DreamExam }) {
  const first = exam.units.slice(0, 3);
  const more = exam.units.length - first.length;
  return (
    <div className={s.ready}>
      <div className={s.celebrate} aria-hidden="true">
        {SPARKS.map(([dx, dy], i) => (
          <span
            key={i}
            className={s.spark}
            style={
              {
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                left: "50%",
                top: "50%",
                animationDelay: `${120 + i * 30}ms`,
              } as CSSProperties
            }
          />
        ))}
        <Orb size={72} reaction="success" reactionKey="ready" breathing />
        <LiveSubjectObject subject={exam.subject} size={112} className={s.objectIn} />
      </div>
      <p className={s.lead}>{examTitle(exam)}</p>
      {first.length > 0 && (
        <>
          <p className={s.footerNote}>Tu ruta empieza así:</p>
          <ol className={s.routeList}>
            {first.map((u, i) => (
              <li className={s.routeItem} key={u.id}>
                <span className={s.routeNum}>{i + 1}</span>
                <span>{u.title}</span>
                <span className={s.routeMin}>
                  <span className="num">{u.estimated_minutes}</span> min
                </span>
              </li>
            ))}
          </ol>
          {more > 0 && (
            <p className={s.footerNote}>
              y <span className="num">{more}</span> {more === 1 ? "paso más" : "pasos más"}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
