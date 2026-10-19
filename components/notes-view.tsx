"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AlertIcon, CheckIcon, ClockIcon } from "./icons";
import {
  NotesFileInput,
  NotesUploadStatus,
  useNotesUpload,
} from "./notes-upload";
import { notesSource, type StudyNote } from "@/lib/study-data";
import { useCollection, type CollectionState } from "@/lib/use-collection";
import s from "./notes-view.module.css";

/** Claude Design: «Apuntes» (Apuntes.dc.html). */
export function NotesView() {
  const { state, retry } = useCollection(notesSource);
  return <NotesLayout state={state} onRetry={retry} />;
}

function NotesLayout({
  state,
  onRetry,
}: {
  state: CollectionState<StudyNote>;
  onRetry: () => void;
}) {
  const upload = useNotesUpload();
  const hasNotes = state.status === "ready" && state.items.length > 0;
  const isEmpty = state.status === "ready" && !state.items.length;
  return (
    <div className="page page-wide" {...upload.dropHandlers}>
      <header className="page-header">
        <h1 className="title">Apuntes</h1>
        {/* Empty: the empty state carries the only «Subir apuntes». */}
        {!isEmpty && (
          <button
            type="button"
            className={`primary press ${s.upload}`}
            onClick={upload.pick}
          >
            Subir apuntes
          </button>
        )}
        <NotesFileInput input={upload.input} onFiles={upload.handle} />
      </header>
      <NotesUploadStatus upload={upload} showHint={hasNotes} />
      {state.status === "loading" && <NotesSkeleton />}
      {state.status === "error" && (
        <div className="empty-state state-error" role="alert">
          <h2 className={s.errorTitle}>
            <AlertIcon />
            No se pudieron cargar tus apuntes
          </h2>
          <p>{state.message}</p>
          <button type="button" className="secondary press" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === "ready" &&
        (state.items.length ? (
          <section className={s.grid} aria-label="Tus apuntes">
            {state.items.map((note, i) => (
              <NoteCard
                note={note}
                index={i}
                key={note.id}
                onReupload={upload.pick}
              />
            ))}
          </section>
        ) : (
          <div className={s.empty}>
            <EmptyIllustration />
            <h2>
              Aún no tienes <span className="marker">apuntes</span>
            </h2>
            <p>
              Sube un PDF o una foto. Dream te ayuda a resumirlos y a preparar
              tests.
            </p>
            <p className={s.emptyHint}>También puedes arrastrarlos aquí.</p>
            <button
              type="button"
              className={`primary press ${s.upload}`}
              onClick={upload.pick}
            >
              Subir apuntes
            </button>
          </div>
        ))}
    </div>
  );
}

/** "Tema 4 · Ecuaciones.pdf" → "Tema 4 · Ecuaciones": the type is in the meta line. */
function displayTitle(title: string) {
  return title.replace(/\.[a-z0-9]{2,5}$/i, "") || title;
}

function NoteCard({
  note,
  index,
  onReupload,
}: {
  note: StudyNote;
  index: number;
  onReupload: () => void;
}) {
  const title = displayTitle(note.title);
  const about = `mis apuntes «${title}» de ${note.subject}`;
  const summarize = `/chat?q=${encodeURIComponent(`Resume ${about} con sus ideas clave.`)}`;
  const quiz = `/chat?q=${encodeURIComponent(`Hazme un test corto sobre ${about}.`)}`;
  return (
    <article
      className={s.card}
      data-status={note.status}
      style={{ "--i": Math.min(index, 6) } as CSSProperties}
    >
      <div className={s.cardBody}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>
            <Link className={s.cardLink} href={`/exams/${note.examId}`}>
              {title}
              <span className="visually-hidden"> · Ver examen</span>
            </Link>
          </h2>
          <span className={s.arrow} aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
        <p className={s.meta}>
          <KindIcon kind={note.kind} />
          {note.kind} · {note.subject}
        </p>
        {note.status === "ready" ? (
          <p className={s.status} data-tone="success">
            <CheckIcon />
            Listo
          </p>
        ) : note.status === "processing" ? (
          // Hook for thinking-orbs (pending Carlos's OK): long wait, > 2 s.
          <p className={s.status} data-tone="neutral" data-orb-slot="">
            <ClockIcon />
            Procesando
          </p>
        ) : (
          <p className={s.status} data-tone="danger">
            <AlertIcon />
            No se pudo leer el archivo. Prueba con una foto más nítida.
          </p>
        )}
      </div>
      {note.status === "processing" ? (
        <p className={s.note}>Puedes seguir usando Dream mientras termina.</p>
      ) : (
        <div className={s.actions}>
          {note.status === "ready" ? (
            <>
              <Link className={`${s.action} press`} href={summarize}>
                Resumir
              </Link>
              <Link className={`${s.action} press`} href={quiz}>
                Crear test
              </Link>
            </>
          ) : (
            <button
              type="button"
              className={`${s.action} press`}
              onClick={onReupload}
            >
              Volver a subir
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (kind === "Imagen")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m21 16-5-5-9 8" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** Same shape as the grid: title, meta, status and the two actions. */
function NotesSkeleton() {
  return (
    <div className={s.grid} aria-busy="true">
      <p className="visually-hidden" role="status">
        Cargando apuntes…
      </p>
      {[0, 1, 2].map((i) => (
        <div className={s.skeleton} key={i} aria-hidden="true">
          <span className={s.skTitle} />
          <span className={s.skMeta} />
          <span className={s.skStatus} />
          <span className={s.skActions}>
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Stacked sheets with an upload arrow. Colours from tokens; decorative. */
function EmptyIllustration() {
  return (
    <svg
      className={s.illustration}
      width="160"
      height="120"
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className={s.ilBack}
        x="34"
        y="18"
        width="72"
        height="88"
        rx="10"
        transform="rotate(-8 70 62)"
      />
      <rect
        className={s.ilSheet}
        x="46"
        y="14"
        width="72"
        height="92"
        rx="10"
      />
      <path className={s.ilLine} d="M60 36h44M60 48h44M60 60h30" />
      <circle className={s.ilBadge} cx="112" cy="88" r="20" />
      <path className={s.ilArrow} d="M112 97V79M104 86l8-8 8 8" />
      <circle className={s.ilAccent} cx="132" cy="30" r="6" />
    </svg>
  );
}
