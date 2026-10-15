"use client";
import Link from "next/link";
import { CheckIcon } from "./icons";
import { UploadButtons } from "./upload-buttons";
import { tasksSource, type StudyTask } from "@/lib/study-data";
import { useCollection, type CollectionState } from "@/lib/use-collection";

/** Design: "Tareas". */
export function TasksView() {
  const { state, retry } = useCollection(tasksSource);
  return <TasksLayout state={state} onRetry={retry} />;
}

function TasksLayout({
  state,
  onRetry,
}: {
  state: CollectionState<StudyTask>;
  onRetry: () => void;
}) {
  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="title">Tareas</h1>
      </header>
      <section className="panel" aria-label="Resolver un ejercicio">
        <p>
          Haz una foto del ejercicio o súbelo. Dream te guía paso a paso, sin
          darte todo hecho.
        </p>
        <UploadButtons />
      </section>
      {state.status === "loading" && (
        <div className="skeleton-list" role="status" aria-label="Cargando">
          <span />
          <span />
          <span />
        </div>
      )}
      {state.status === "error" && (
        <div className="empty-state state-error" role="alert">
          <h2>No se pudieron cargar tus tareas</h2>
          <p>{state.message}</p>
          <button className="secondary press" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === "ready" && <TaskLists tasks={state.items} />}
    </div>
  );
}

function TaskLists({ tasks }: { tasks: StudyTask[] }) {
  const pending = tasks.filter((t) => t.status === "pending");
  const done = tasks.filter((t) => t.status === "done");
  if (!tasks.length)
    return (
      <div className="empty-state">
        <h2>No tienes tareas pendientes</h2>
        <p>
          Cuando prepares un examen, Dream organiza el temario en tareas y las
          verás aquí.
        </p>
        <Link className="primary press" href="/exams/new">
          Preparar un examen
        </Link>
      </div>
    );
  return (
    <>
      <TaskSection title="Pendientes" tasks={pending} />
      {done.length > 0 && <TaskSection title="Hechas" tasks={done} />}
    </>
  );
}

function TaskSection({ title, tasks }: { title: string; tasks: StudyTask[] }) {
  const id = `tasks-${title.toLowerCase()}`;
  return (
    <section className="list-section" aria-labelledby={id}>
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {tasks.length ? (
        <ul className="row-list">
          {tasks.map((task) => (
            <li
              className={`task-row${task.status === "done" ? " is-done" : ""}`}
              key={task.id}
            >
              <span
                className={`task-status${task.status === "done" ? " done" : ""}`}
              >
                {task.status === "done" ? (
                  <CheckIcon size={22} />
                ) : (
                  <span className="box" />
                )}
                <span className="visually-hidden">
                  {task.status === "done" ? "Hecha" : "Pendiente"}
                </span>
              </span>
              <span className="row-text">
                <strong>{task.title}</strong>
                {task.context && <small>{task.context}</small>}
              </span>
              {task.href && (
                <Link
                  className="row-action press"
                  href={task.href}
                  aria-label={`Resolver con Dream: ${task.title}`}
                >
                  Resolver con Dream
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="page-intro">Lo tienes todo al día.</p>
      )}
    </section>
  );
}
