"use client";
import Link from "next/link";
import { AlertIcon, CheckIcon, ClockIcon } from "./icons";
import { UploadButtons } from "./upload-buttons";
import { notesSource, type StudyNote } from "@/lib/study-data";
import { useCollection, type CollectionState } from "@/lib/use-collection";

/** Design: "Apuntes". */
export function NotesView() {
  const { state, retry } = useCollection(notesSource);
  return <NotesLayout state={state} onRetry={retry} />;
}

export function NotesLayout({
  state,
  onRetry,
}: {
  state: CollectionState<StudyNote>;
  onRetry: () => void;
}) {
  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1 className="title">Apuntes</h1>
        <UploadButtons
          camera={false}
          uploadLabel="Subir apuntes"
          uploadClassName="primary"
        />
      </header>
      {state.status === "loading" && (
        <div className="card-grid" role="status" aria-label="Cargando">
          <span className="skeleton-card" />
          <span className="skeleton-card" />
          <span className="skeleton-card" />
        </div>
      )}
      {state.status === "error" && (
        <div className="empty-state state-error" role="alert">
          <h2>No se pudieron cargar tus apuntes</h2>
          <p>{state.message}</p>
          <button className="secondary press" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === "ready" &&
        (state.items.length ? (
          <section className="card-grid" aria-label="Tus apuntes">
            {state.items.map((note) => (
              <NoteCard note={note} key={note.id} />
            ))}
          </section>
        ) : (
          <div className="empty-state">
            <h2>Aún no has subido apuntes</h2>
            <p>
              Sube un PDF o una foto de tus apuntes. Dream los resume, te
              pregunta y prepara tests con ellos.
            </p>
          </div>
        ))}
    </div>
  );
}

function NoteCard({ note }: { note: StudyNote }) {
  const ask = `/chat?q=${encodeURIComponent(`Ayúdame a repasar mis apuntes «${note.title}» de ${note.subject}.`)}`;
  return (
    <article className="note-card">
      <div>
        <h2>{note.title}</h2>
        <p className="meta">
          {note.kind} · {note.subject}
        </p>
        {note.status === "ready" ? (
          <p className="note-status ready">
            <CheckIcon />
            Listo
          </p>
        ) : note.status === "processing" ? (
          <p className="note-status">
            <ClockIcon />
            Procesando
          </p>
        ) : (
          <p className="note-status failed">
            <AlertIcon />
            No se pudo leer este archivo. Súbelo de nuevo con más nitidez.
          </p>
        )}
      </div>
      {note.status === "processing" ? (
        <p className="meta">Puedes seguir usando Dream mientras termina.</p>
      ) : (
        <div className="button-row">
          {note.status === "ready" && (
            <Link className="card-action press" href={ask}>
              Repasar con Dream
            </Link>
          )}
          <Link
            className="card-action press"
            href={`/exams/${note.examId}`}
          >
            Ver examen
          </Link>
        </div>
      )}
    </article>
  );
}
