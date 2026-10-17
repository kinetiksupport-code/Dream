"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { Toast } from "./toast";
import { UploadButtons } from "./upload-buttons";
import { errorMessage } from "@/lib/dream-api";
import {
  completeStudyTask,
  tasksSource,
  type StudyTask,
} from "@/lib/study-data";
import { useCollection, type CollectionState } from "@/lib/use-collection";
import styles from "./tasks-view.module.css";

/** Time to undo «Tarea hecha» before it is saved (dream-api has no undo). */
export const UNDO_MS = 5000;
const DONE_HEADING = "tasks-done";

/** Design: "Tareas" (escritorio) and "Móvil · Tareas". */
export function TasksView() {
  const { state, retry } = useCollection(tasksSource);
  const completion = useCompletion();
  return <TasksLayout state={state} onRetry={retry} completion={completion} />;
}

type Completion = ReturnType<typeof useCompletion>;

/**
 * Marking a task as done: the row stays checked in place while «Tarea hecha ·
 * Deshacer» is on screen, then it is saved and moves to «Hechas». Saving
 * happens early when another task is checked, the toast is closed, the tab is
 * hidden or the screen unmounts, so nothing is lost.
 */
function useCompletion() {
  const [settling, setSettling] = useState<StudyTask | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<{
    task: StudyTask;
    message: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<StudyTask | null>(null);

  const save = useCallback((task: StudyTask) => {
    setDone((prev) => new Set(prev).add(task.id));
    completeStudyTask(task).catch((e: unknown) => {
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      setFailed({ task, message: errorMessage(e) });
    });
  }, []);

  /** Saves the task waiting in the undo window, if any. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const task = current.current;
    current.current = null;
    if (!task) return;
    // Keep keyboard focus when the row moves to «Hechas».
    const hadFocus = document.activeElement?.id === checkboxId(task);
    setSettling(null);
    save(task);
    if (hadFocus)
      requestAnimationFrame(() =>
        document.getElementById(DONE_HEADING)?.focus(),
      );
  }, [save]);

  const complete = useCallback(
    (task: StudyTask) => {
      flush();
      setFailed(null);
      current.current = task;
      setSettling(task);
      timer.current = setTimeout(flush, UNDO_MS);
    },
    [flush],
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const task = current.current;
    current.current = null;
    setSettling(null);
    if (task)
      requestAnimationFrame(() =>
        document.getElementById(checkboxId(task))?.focus(),
      );
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [flush]);

  return {
    settling,
    done,
    failed,
    complete,
    undo,
    flush,
    retry: () => failed && complete(failed.task),
    dismissError: () => setFailed(null),
  };
}

const checkboxId = (task: StudyTask) => `task-${task.id}`;

function TasksLayout({
  state,
  onRetry,
  completion,
}: {
  state: CollectionState<StudyTask>;
  onRetry: () => void;
  completion: Completion;
}) {
  return (
    <div className={`page page-narrow ${styles.page}`}>
      <header className="page-header">
        <h1 className="title">Tareas</h1>
      </header>
      <section
        className={`panel ${styles.solve}`}
        aria-label="Resolver un ejercicio"
      >
        <p className={styles.solveText}>
          Haz una foto del ejercicio o súbelo. Dream te guía paso a paso, sin
          darte todo hecho.
        </p>
        <UploadButtons
          cameraLabel={
            // One text node: the button's flex gap must not split the words.
            <span>
              Hacer foto
              <span className={styles.compactOnly}> del ejercicio</span>
            </span>
          }
        />
      </section>
      {state.status === "loading" && <TasksSkeleton />}
      {state.status === "error" && (
        <div className="empty-state state-error" role="alert">
          <h2>No se pudieron cargar tus tareas</h2>
          <p>{state.message}</p>
          <button className="secondary press" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <TaskLists tasks={state.items} completion={completion} />
      )}
      {/* One stack, so «Tarea hecha» and a save error never overlap. */}
      <div className={`toast-position ${styles.toasts}`}>
        {completion.failed && (
          <Toast
            error
            message={`No se pudo guardar «${completion.failed.task.title}». ${completion.failed.message}`}
            action={{ label: "Reintentar", run: completion.retry }}
            onClose={completion.dismissError}
          />
        )}
        <div aria-live="polite" aria-atomic="true">
          {completion.settling && (
            <Toast
              announce={false}
              message="Tarea hecha."
              action={{ label: "Deshacer", run: completion.undo }}
              onClose={completion.flush}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Loading: the shape of the list (heading, three rows), not a spinner. */
function TasksSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Cargando tareas">
      <span className={styles.skeletonHeading} aria-hidden="true" />
      {[0.62, 0.48, 0.7].map((width, i) => (
        <span className={styles.skeletonRow} aria-hidden="true" key={i}>
          <span className={styles.skeletonBox} />
          <span className={styles.skeletonText}>
            <span style={{ width: `${width * 100}%` }} />
            <span style={{ width: "38%" }} />
          </span>
          <span className={styles.skeletonAction} />
        </span>
      ))}
    </div>
  );
}

function TaskLists({
  tasks,
  completion,
}: {
  tasks: StudyTask[];
  completion: Completion;
}) {
  const isDone = (t: StudyTask) =>
    t.status === "done" || completion.done.has(t.id);
  const pending = tasks.filter((t) => !isDone(t));
  const done = tasks.filter(isDone);
  if (!tasks.length) return <EmptyTasks />;
  return (
    <>
      <section className={styles.section} aria-labelledby="tasks-pending">
        <h2 className={styles.sectionTitle} id="tasks-pending">
          Pendientes
        </h2>
        {pending.length ? (
          <ul className={styles.list}>
            {pending.map((task) => (
              <PendingRow
                task={task}
                key={task.id}
                checked={completion.settling?.id === task.id}
                onCheck={() => completion.complete(task)}
                onUncheck={completion.undo}
              />
            ))}
          </ul>
        ) : (
          <p className={styles.allDone}>
            <CheckIcon size={18} />
            Lo tienes todo al día.
          </p>
        )}
      </section>
      {done.length > 0 && (
        <section className={styles.section} aria-labelledby={DONE_HEADING}>
          <h2 className={styles.sectionTitle} id={DONE_HEADING} tabIndex={-1}>
            Hechas
          </h2>
          <ul className={styles.list}>
            {done.map((task) => (
              <DoneRow
                task={task}
                key={task.id}
                fresh={task.status !== "done"}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PendingRow({
  task,
  checked,
  onCheck,
  onUncheck,
}: {
  task: StudyTask;
  checked: boolean;
  onCheck: () => void;
  onUncheck: () => void;
}) {
  return (
    <li className={styles.row} data-checked={checked || undefined}>
      <label className={`${styles.main} press`}>
        <span className={styles.checkSlot}>
          <input
            id={checkboxId(task)}
            className={styles.check}
            type="checkbox"
            checked={checked}
            onChange={(e) => (e.target.checked ? onCheck() : onUncheck())}
          />
          <span className={styles.tick} aria-hidden="true">
            <CheckIcon size={16} />
          </span>
        </span>
        <TaskText task={task} done={checked} />
      </label>
      {task.href && !checked && (
        <Link
          className={`${styles.action} press`}
          href={task.href}
          aria-label={`Resolver con Dream: ${task.title}`}
        >
          Resolver con Dream
        </Link>
      )}
    </li>
  );
}

function DoneRow({ task, fresh }: { task: StudyTask; fresh: boolean }) {
  return (
    <li className={`${styles.row}${fresh ? " rise" : ""}`} data-done="">
      <span className={styles.main}>
        <span className={styles.checkSlot}>
          <span className={styles.doneBox} aria-hidden="true">
            <CheckIcon size={16} />
          </span>
        </span>
        <TaskText task={task} done />
      </span>
    </li>
  );
}

/** Title and «Asignatura · Examen el 27 oct», wrapping between parts only. */
function TaskText({ task, done }: { task: StudyTask; done: boolean }) {
  const parts = [done ? "Hecha" : "", ...task.context.split(" · ")].filter(
    Boolean,
  );
  return (
    <span className={styles.text}>
      <span className={styles.title}>{task.title}</span>
      {parts.length > 0 && (
        <span className={styles.meta}>
          {parts.map((part, i) => (
            <Fragment key={i}>
              {/* The space sits between the blocks so lines break there. */}
              {i > 0 && " "}
              <span
                className={i === 0 && done ? styles.doneLabel : styles.part}
              >
                {part}
                {i < parts.length - 1 && " ·"}
              </span>
            </Fragment>
          ))}
        </span>
      )}
    </span>
  );
}

function EmptyTasks() {
  return (
    <div className={`empty-state ${styles.empty}`}>
      <EmptyIllustration />
      <h2>Aún no tienes tareas</h2>
      <p>Prepara un examen y Dream lo divide en tareas cortas.</p>
      <Link className="primary press" href="/exams/new">
        Preparar un examen
      </Link>
    </div>
  );
}

/** Clipboard with a short checklist; colours are theme tokens. */
function EmptyIllustration() {
  return (
    <svg
      className={styles.illustration}
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="26" y="10" width="68" height="80" rx="12" fill="var(--bg)" />
      <rect
        x="26"
        y="10"
        width="68"
        height="80"
        rx="12"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <rect x="46" y="4" width="28" height="12" rx="6" fill="var(--primary)" />
      <rect
        x="38"
        y="32"
        width="12"
        height="12"
        rx="3.5"
        fill="var(--primary)"
      />
      <path
        d="m41 38 2.2 2.2 4-4.4"
        stroke="var(--on-primary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="56" y="35" width="26" height="6" rx="3" fill="var(--border)" />
      <rect
        x="38.75"
        y="52.75"
        width="10.5"
        height="10.5"
        rx="3"
        stroke="var(--text-secondary)"
        strokeWidth="1.5"
      />
      <rect x="56" y="55" width="20" height="6" rx="3" fill="var(--border)" />
      <rect
        x="38.75"
        y="70.75"
        width="10.5"
        height="10.5"
        rx="3"
        stroke="var(--text-secondary)"
        strokeWidth="1.5"
      />
      <rect x="56" y="73" width="24" height="6" rx="3" fill="var(--border)" />
      <circle cx="96" cy="70" r="11" fill="var(--accent)" />
      <path
        d="m91.5 70 3 3 5.5-6"
        stroke="var(--on-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
