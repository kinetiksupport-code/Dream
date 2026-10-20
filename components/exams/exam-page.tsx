"use client";
// Exámenes (design/examenes): page frame, cards, states and skeleton that
// follow Claude Design «Examenes.dc.html» / «MovilExamenes.dc.html».
// The test/simulacro session keeps ExamFrame (exam-ui.tsx).
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Orb } from "../orb";
import { SubjectObject } from "../subject-object";
import {
  daysUntil,
  type ExamUnit,
} from "@/lib/exam-plans";
import s from "./examenes.module.css";
export { s as examStyles };

export function ExamPage({
  title,
  subtitle,
  back,
  action,
  object,
  children,
  wide = false,
}: {
  title: string;
  /** Objeto de la asignatura junto al título (viaja desde la tarjeta). */
  object?: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string; phoneOnly?: boolean };
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`${s.page} ${wide ? s.wide : ""}`}>
      <header className={s.header}>
        {back && (
          <Link
            className={`${s.back} press ${back.phoneOnly ? s.phoneOnly : ""}`}
            href={back.href}
          >
            <ChevronLeft size={22} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <div className={s.titleRow}>
          {object ? (
            <div className={s.titleWithObject}>
              {object}
              <h1>{title}</h1>
            </div>
          ) : (
            <h1>{title}</h1>
          )}
          {action}
        </div>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </header>
      {children}
      <p className={s.disclaimer}>
        Dream puede equivocarse. Pregunta, compara y comprende.
      </p>
    </div>
  );
}

/** Days left, with number (.num), icon and words: never colour alone. */
export function DaysChip({ date }: { date: string }) {
  const days = daysUntil(date);
  const soon = days !== null && days >= 0 && days <= 3;
  const Icon = soon ? AlarmClock : CalendarDays;
  const text =
    days === null
      ? "Sin fecha"
      : days < 0
        ? "Fecha pasada"
        : days === 0
          ? "Es hoy"
          : days === 1
            ? "Es mañana"
            : null;
  return (
    <span className={`${s.days} ${soon ? s.soon : ""}`} data-soon={soon || undefined}>
      <Icon size={16} aria-hidden="true" />
      {text ?? (
        <>
          <span>
            <b className="num">{days}</b> días
          </span>
          <span className="visually-hidden"> para el examen</span>
        </>
      )}
    </span>
  );
}

/**
 * Examen recién abierto desde el historial (solo en memoria, nunca en
 * almacenamiento): el esqueleto del detalle pinta ya su objeto en el mismo
 * sitio, para que la View Transition lo lleve de la tarjeta al título.
 */
let opened: { id: string; subject: string } | null = null;
export function rememberOpenedExam(id: string, subject: string) {
  opened = { id, subject };
}
export function openedExamSubject(id?: string) {
  return id && opened?.id === id ? opened.subject : null;
}
/** Nombre compartido del objeto entre la tarjeta y el detalle. */
export const OBJECT_TRANSITION = "exam-object";
export const OBJECT_SIZE_DETAIL = 56;

/** Detail/plan skeleton: hero block and three plan rows. */
export function ExamDetailSkeleton({ examId }: { examId?: string } = {}) {
  const subject = openedExamSubject(examId);
  return (
    <div className={s.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Cargando el examen
      </span>
      <div className={s.header} aria-hidden="true">
        <span className={s.boneBack}>
          <span className={`${s.bone} ${s.boneLine}`} style={{ width: 96 }} />
        </span>
        <div className={s.titleRow}>
          <div className={s.titleWithObject}>
            {subject !== null && (
              <SubjectObject
                subject={subject}
                size={OBJECT_SIZE_DETAIL}
                style={{ viewTransitionName: OBJECT_TRANSITION }}
              />
            )}
            <span className={`${s.bone} ${s.boneTitle}`} />
          </div>
        </div>
      </div>
      <div className={s.list} aria-hidden="true">
        <div className={s.boneCard} style={{ height: 196 }} />
        {[0, 1, 2].map((i) => (
          <span className={`${s.bone} ${s.boneRow}`} key={i} />
        ))}
      </div>
    </div>
  );
}

export function LoadError({
  error,
  reload,
  title = "No se han podido cargar tus exámenes",
}: {
  error: string;
  reload: () => void;
  title?: string;
}) {
  return (
    <div className={s.page}>
      <section className={`${s.stateCard} ${s.failed}`} role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{error}</p>
        <button className="primary press" onClick={reload}>
          <RotateCcw size={18} aria-hidden="true" /> Reintentar
        </button>
      </section>
    </div>
  );
}

/** Plan rows (Claude Design «Plan de estudio»): Hecha / Hoy / Unidad N. */
export function PlanRows({
  examId,
  units,
  detailed = false,
}: {
  examId: string;
  units: ExamUnit[];
  detailed?: boolean;
}) {
  const nextId = units.find((u) => u.status !== "completed")?.id;
  return (
    <ol className={s.plan}>
      {units.map((u) => {
        const done = u.status === "completed";
        const next = u.id === nextId;
        const label = done ? "Hecha" : next ? "Hoy" : `Unidad ${u.position + 1}`;
        const action = done ? "Repasar" : u.status === "in_progress" ? "Seguir" : "Empezar";
        return (
          <li key={u.id}>
            <Link
              className={s.planRow}
              href={`/exams/${examId}/study/${u.id}`}
              data-state={done ? "done" : next ? "next" : "later"}
            >
              <span className={s.when}>
                {done && <Check size={16} aria-hidden="true" />}
                {label}
              </span>
              <span className={s.what}>
                <span className={s.unitTitle}>{u.title}</span>
                {detailed && <span className={s.unitSummary}>{u.summary}</span>}
                <span className={s.unitMeta}>
                  <span className="num">{u.estimated_minutes}</span> min
                  {u.status === "in_progress" ? " · En marcha" : ""}
                </span>
              </span>
              <span className={s.rowAction}>
                <span className={s.rowActionText}>{action}</span>
                <ChevronRight className={s.arrow} size={18} aria-hidden="true" />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Plan generándose. Hook for thinking-orbs (pending Carlos's OK): replace the
 * <Orb> inside [data-hook="thinking-orb"] with <ThinkingOrb state="thinking" />.
 */
export function PreparingState({
  topics,
  onRefresh,
  checking,
}: {
  topics: string[];
  onRefresh?: () => void;
  checking?: boolean;
}) {
  const list = topics.slice(0, 3).join(", ");
  return (
    <section className={s.stateCard} aria-busy="true">
      <span className={s.orbHook} data-hook="thinking-orb">
        <Orb size={40} pulsing />
      </span>
      <h2 role="status" aria-live="polite">
        Dream está preparando tu plan
      </h2>
      <ul className={s.steps}>
        <li>
          Divide {list ? <b>{list}</b> : "tus temas"}
          {topics.length > 3 ? " y más" : ""} en unidades cortas.
        </li>
        <li>Prepara una conversación para entender cada unidad.</li>
        <li>Calcula los minutos de cada unidad según tu ritmo.</li>
      </ul>
      <p className={s.note}>
        Puedes salir: el plan se guarda en tu cuenta y esta página se
        actualiza sola.
      </p>
      {onRefresh && (
        <button
          className="secondary press"
          onClick={onRefresh}
          disabled={checking}
          aria-busy={checking || undefined}
        >
          {checking ? "Comprobando…" : "Comprobar ahora"}
        </button>
      )}
    </section>
  );
}

export function FailedState({
  cause,
  onRetry,
  retrying,
  editHref,
}: {
  cause: string | null;
  onRetry: () => void;
  retrying: boolean;
  editHref: string;
}) {
  return (
    <section className={`${s.stateCard} ${s.failed}`}>
      <AlertCircle size={28} aria-hidden="true" />
      <h2>El plan no se pudo preparar</h2>
      <p role="alert">
        {cause || "Algo falló al organizar tus temas."} Tus datos y materiales
        siguen guardados.
      </p>
      <div className={s.stateActions}>
        <button
          className="primary press"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying || undefined}
        >
          <RotateCcw size={18} aria-hidden="true" />
          {retrying ? "Reintentando…" : "Reintentar"}
        </button>
        <Link className="secondary press" href={editHref}>
          Revisar datos
        </Link>
      </div>
    </section>
  );
}
