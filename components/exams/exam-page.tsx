"use client";
// Exámenes (design/examenes): page frame, cards, states and skeleton that
// follow Claude Design «Examenes.dc.html» / «MovilExamenes.dc.html».
// The test/simulacro session keeps ExamFrame (exam-ui.tsx).
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FileText,
  RotateCcw,
} from "lucide-react";
import { Orb } from "../orb";
import {
  daysUntil,
  examDateLabel,
  preparation,
  type ExamIndex,
  type ExamUnit,
} from "@/lib/exam-plans";
import s from "./examenes.module.css";
export { s as examStyles };

export function ExamPage({
  title,
  subtitle,
  back,
  action,
  children,
  wide = false,
}: {
  title: string;
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
          <h1>{title}</h1>
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

function statusLine(exam: ExamIndex) {
  const p = preparation(exam);
  switch (exam.status) {
    case "draft":
      return { icon: <FileText size={16} />, text: "Borrador guardado" };
    case "preparing":
      return {
        icon: <CircleDashed size={16} />,
        text: "Dream está preparando el plan",
      };
    case "failed":
      return {
        icon: <AlertCircle size={16} />,
        text: "El plan no se pudo preparar",
        danger: true,
      };
    case "completed":
      return { icon: <Check size={16} />, text: "Examen completado" };
    default:
      return {
        icon: null,
        text: (
          <>
            <span className="num">{p.percentage} %</span> del plan ·{" "}
            <span className="num">{p.completed}</span> de{" "}
            <span className="num">{p.total}</span> unidades
          </>
        ),
        progress: p.percentage,
      };
  }
}

export function ExamCard({ exam, index }: { exam: ExamIndex; index: number }) {
  const href = ["draft", "failed"].includes(exam.status)
    ? exam.status === "failed"
      ? `/exams/${exam.id}`
      : `/exams/new?id=${exam.id}`
    : `/exams/${exam.id}`;
  const line = statusLine(exam);
  const topics = exam.topics.length;
  return (
    <Link
      href={href}
      className={s.examCard}
      style={{ "--i": Math.min(index, 6) } as React.CSSProperties}
    >
      <div className={s.cardTop}>
        <div className={s.cardHeading}>
          <span className={s.subject}>{exam.subject}</span>
          <h2 className={s.cardTitle}>{exam.title}</h2>
        </div>
        <DaysChip date={exam.exam_date} />
      </div>
      <span className={s.meta}>
        {examDateLabel(exam.exam_date)} · <span className="num">{topics}</span>{" "}
        {topics === 1 ? "tema" : "temas"}
        {exam.materials.length > 0 && (
          <>
            {" "}
            · <span className="num">{exam.materials.length}</span>{" "}
            {exam.materials.length === 1 ? "material" : "materiales"}
          </>
        )}
      </span>
      <span className={s.status} data-danger={line.danger || undefined}>
        {line.icon}
        <span>{line.text}</span>
      </span>
      {line.progress !== undefined && (
        <span
          className={s.track}
          role="progressbar"
          aria-label={`Preparación de ${exam.title}`}
          aria-valuenow={line.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ transform: `scaleX(${line.progress / 100})` }} />
        </span>
      )}
      <span className={s.cardCta}>
        {exam.status === "draft"
          ? "Seguir preparando"
          : exam.status === "failed"
            ? "Ver qué pasó"
            : "Ver examen"}
        <ArrowRight className={s.arrow} size={18} aria-hidden="true" />
      </span>
    </Link>
  );
}

/** Same shape as the list: header, segmented control and two cards. */
export function ExamListSkeleton() {
  return (
    <div className={s.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Cargando tus exámenes
      </span>
      <div className={s.header} aria-hidden="true">
        <div className={s.titleRow}>
          <span className={`${s.bone} ${s.boneTitle}`} />
          <span className={`${s.bone} ${s.boneButton}`} />
        </div>
      </div>
      <div className={s.list} aria-hidden="true">
        <span className={`${s.bone} ${s.boneTabs}`} />
        {[0, 1].map((i) => (
          <div className={s.boneCard} key={i}>
            <span className={`${s.bone} ${s.boneLine}`} style={{ width: "28%" }} />
            <span className={`${s.bone} ${s.boneLine}`} style={{ width: "62%", height: 22 }} />
            <span className={`${s.bone} ${s.boneLine}`} style={{ width: "44%" }} />
            <span className={`${s.bone} ${s.boneLine}`} style={{ width: "100%", height: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail/plan skeleton: hero block and three plan rows. */
export function ExamDetailSkeleton() {
  return (
    <div className={s.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Cargando el examen
      </span>
      <div className={s.header} aria-hidden="true">
        <span className={`${s.bone} ${s.boneLine}`} style={{ width: 96 }} />
        <span className={`${s.bone} ${s.boneTitle}`} />
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

export function EmptyExams({ completed = false }: { completed?: boolean }) {
  return (
    <section className={s.empty}>
      <svg
        className={s.illustration}
        width="160"
        height="120"
        viewBox="0 0 160 120"
        fill="none"
        aria-hidden="true"
      >
        <rect x="28" y="22" width="104" height="86" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
        <path d="M28 46h104" stroke="var(--border)" strokeWidth="2" />
        <path d="M56 14v16M104 14v16" stroke="var(--text-secondary)" strokeWidth="4" strokeLinecap="round" />
        <rect x="44" y="58" width="16" height="12" rx="4" fill="var(--border)" />
        <rect x="72" y="58" width="16" height="12" rx="4" fill="var(--border)" />
        <rect x="100" y="58" width="16" height="12" rx="4" fill="var(--primary)" />
        <rect x="44" y="80" width="16" height="12" rx="4" fill="var(--border)" />
        <rect x="72" y="80" width="16" height="12" rx="4" fill="var(--border)" />
        <circle cx="128" cy="96" r="18" fill="var(--accent)" />
        <path d="m120 96 6 6 10-12" stroke="var(--on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2>{completed ? "Aún no has completado ningún examen" : "Aún no tienes exámenes"}</h2>
      <p>
        {completed
          ? "Cuando marques un examen como completado, aparecerá aquí."
          : "Añade la fecha y los temas. Dream te prepara un plan por unidades."}
      </p>
      {!completed && (
        <Link className="primary press" href="/exams/new">
          Preparar un examen
        </Link>
      )}
    </section>
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
