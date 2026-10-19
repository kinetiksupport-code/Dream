"use client";
// Pantalla Exámenes: historial + «Crear examen» (PROMPT_EXAMEN_ESTILO.md §4).
// Tarjeta con el objeto de la asignatura, cuenta atrás, pegatina de estado
// (color y texto) y barra de unidades; menú con «Marcar como hecho» y
// «Borrar» (con confirmación y Deshacer). El objeto viaja al detalle con la
// View Transition de las páginas (globals.css › Objeto de la asignatura).
import { useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { BottomSheet } from "../bottom-sheet";
import { Orb } from "../orb";
import { Sticker } from "../sticker";
import { SubjectObject } from "../subject-object";
import {
  STATUS_STICKER,
  countdownText,
  daysUntil,
  examDateLabel,
  examTitle,
  preparation,
  type ExamIndex,
} from "@/lib/exam-plans";
import {
  OBJECT_TRANSITION,
  rememberOpenedExam,
  examStyles as s,
} from "./exam-page";

/** Big «Crear examen»: 3D pill (the face sinks) plus the shared .press. */
export function CreateExamButton({ className }: { className?: string }) {
  return (
    <Link
      href="/exams/new"
      className={`button-3d tone-yellow press ${className ?? ""}`}
    >
      <span className="button-3d-face">
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        Crear examen
      </span>
    </Link>
  );
}

export function HistoryHero({ cta = true }: { cta?: boolean }) {
  return (
    <header className={`${s.listHero} pop tone-blue pop-grid`}>
      <Link className={`${s.heroBack} ${s.phoneOnly} press`} href="/more">
        <ChevronLeft size={22} aria-hidden="true" />
        Más
      </Link>
      <div className={s.listHeroText}>
        <h1 className="hero-title">Exámenes</h1>
        <p>Sube tus apuntes y Dream te prepara la ruta.</p>
        {cta && <CreateExamButton />}
      </div>
      <div className={s.heroObjects} aria-hidden="true">
        <SubjectObject object="cap" size={124} className={s.heroObjectA} />
        <SubjectObject object="globe" size={76} className={s.heroObjectB} />
      </div>
    </header>
  );
}

function hrefFor(exam: ExamIndex) {
  return exam.status === "draft" ? `/exams/new?id=${exam.id}` : `/exams/${exam.id}`;
}

export function HistoryCard({
  exam,
  index,
  onActions,
}: {
  exam: ExamIndex;
  index: number;
  onActions: (exam: ExamIndex) => void;
}) {
  const object = useRef<HTMLSpanElement>(null);
  const sticker = STATUS_STICKER[exam.status];
  const p = preparation(exam);
  const showProgress = p.total > 0 && exam.status !== "draft";
  const days = exam.exam_date ? daysUntil(exam.exam_date) : null;
  const soon = days !== null && days >= 0 && days <= 3 && exam.status !== "completed";
  const title = examTitle(exam);
  const titleId = useId();
  return (
    <article
      className={s.hCard}
      style={{ "--i": Math.min(index, 7) } as CSSProperties}
      aria-labelledby={titleId}
    >
      <Link
        href={hrefFor(exam)}
        className={s.hLink}
        onClick={() => {
          // Only this card's object travels to the detail.
          if (exam.status === "draft" || !object.current) return;
          rememberOpenedExam(exam.id, exam.subject);
          object.current.style.viewTransitionName = OBJECT_TRANSITION;
        }}
      >
        <span ref={object} className={s.hObject}>
          <SubjectObject subject={exam.subject} size={56} float={false} />
        </span>
        <span className={s.hBody}>
          <span className={s.hSubject}>
            {exam.subject.trim() || "Asignatura por decidir"}
          </span>
          <h3 className={s.hTitle} id={titleId}>
            {title}
          </h3>
          <span className={s.hMeta}>
            <Sticker tone={sticker.tone} shape="pill" className={s.hSticker}>
              {sticker.label}
            </Sticker>
            <span className={s.hWhen} data-soon={soon || undefined}>
              <CalendarDays size={16} aria-hidden="true" />
              <span>
                {countdownText(exam.exam_date)}
                {exam.exam_date && (
                  <span className={s.hDate}> · {examDateLabel(exam.exam_date, true)}</span>
                )}
              </span>
            </span>
          </span>
          {showProgress && (
            <span className={s.hProgress}>
              <span
                className={s.track}
                role="progressbar"
                aria-label={`Unidades completadas de ${title}`}
                aria-valuenow={p.completed}
                aria-valuemin={0}
                aria-valuemax={p.total}
                aria-valuetext={`${p.completed} de ${p.total} unidades`}
              >
                <i style={{ transform: `scaleX(${p.completed / p.total})` }} />
              </span>
              <span className={s.hUnits}>
                <span className="num">{p.completed}</span> de{" "}
                <span className="num">{p.total}</span> unidades
              </span>
            </span>
          )}
        </span>
      </Link>
      <button
        type="button"
        className={`${s.hMore} press`}
        aria-label={`Más opciones de ${title}`}
        aria-haspopup="dialog"
        onClick={() => onActions(exam)}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </article>
  );
}

/** Actions for one exam: «Marcar como hecho» and «Borrar» with a confirm step. */
export function ExamActionsSheet({
  exam,
  onClose,
  onComplete,
  onDelete,
  busy,
  error,
}: {
  exam: ExamIndex;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  busy: boolean;
  error: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const title = examTitle(exam);
  return (
    <BottomSheet
      labelledBy="exam-actions-title"
      describedBy={confirm ? "exam-actions-desc" : undefined}
      onClose={onClose}
    >
      {confirm ? (
        <>
          <h2 id="exam-actions-title">¿Borrar «{title}»?</h2>
          <p id="exam-actions-desc" className={s.sheetText}>
            Se borran sus apuntes, su ruta y sus simulacros. Tendrás unos
            segundos para deshacerlo.
          </p>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={() => setConfirm(false)}>
              Cancelar
            </button>
            <button type="button" className="danger-button press" onClick={onDelete} autoFocus>
              Sí, borrar
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="exam-actions-title">{title}</h2>
          <div className={s.sheetActions}>
            {exam.status !== "completed" && exam.status !== "draft" && (
              <button
                type="button"
                className={`${s.sheetAction} press`}
                onClick={onComplete}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                <Check size={20} aria-hidden="true" />
                {busy ? "Guardando…" : "Marcar como hecho"}
              </button>
            )}
            <button
              type="button"
              className={`${s.sheetAction} ${s.sheetDanger} press`}
              onClick={() => setConfirm(true)}
              disabled={busy}
            >
              <Trash2 size={20} aria-hidden="true" />
              Borrar examen
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

/** Same shape as the list: hero, section title and three cards. */
export function HistorySkeleton() {
  return (
    <div className={s.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Cargando tus exámenes
      </span>
      <div className={`${s.listHero} ${s.boneHero}`} aria-hidden="true" />
      <div className={s.list} aria-hidden="true">
        <span className={`${s.bone} ${s.boneLine}`} style={{ width: 120, height: 22 }} />
        {[0, 1, 2].map((i) => (
          <div className={s.boneCard} key={i}>
            <span className={`${s.bone} ${s.boneObject}`} />
            <span className={s.boneLines}>
              <span className={`${s.bone} ${s.boneLine}`} style={{ width: "30%" }} />
              <span className={`${s.bone} ${s.boneLine}`} style={{ width: "64%", height: 20 }} />
              <span className={`${s.bone} ${s.boneLine}`} style={{ width: "44%" }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyHistory() {
  return (
    <section className={s.emptyPop} aria-labelledby="exams-empty">
      <Orb size={88} breathing />
      <h2 id="exams-empty">Aún no tienes ningún examen</h2>
      <p>Sube tus apuntes, dime la fecha y la nota que quieres. Yo preparo el resto.</p>
      <CreateExamButton />
    </section>
  );
}
