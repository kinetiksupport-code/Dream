"use client";
import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { AlertIcon } from "./icons";
import { MAX_CHAT_FILES, fileAccept, validateFile } from "@/lib/attachments";
import { setPendingFiles } from "@/lib/pending-files";
import s from "./notes-view.module.css";

/** Same limit the chat composer accepts in one go (lib/pending-files.ts). */
const MAX_FILES = MAX_CHAT_FILES;

type Phase =
  | { name: "idle" }
  | { name: "uploading"; count: number }
  | { name: "error"; file: string; cause: string; tip: string };

/**
 * Apuntes upload: file picker and drag and drop. Files are validated here and
 * handed (in memory only, never stored) to a new chat, where the existing
 * upload flow sends them to dream-api. No endpoint creates notes directly yet
 * (notesSource.canCreate is false), so "uploading" covers validation and the
 * hand-off until the chat opens.
 */
export function useNotesUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  const pick = useCallback(() => input.current?.click(), []);

  const handle = useCallback(
    (files: FileList | File[] | null) => {
      const list = Array.from(files ?? []);
      if (!list.length) return;
      if (list.length > MAX_FILES) {
        setPhase({
          name: "error",
          file: `${list.length} archivos`,
          cause: `Puedes subir ${MAX_FILES} archivos a la vez.`,
          tip: "Elige menos archivos y vuelve a intentarlo.",
        });
        return;
      }
      for (const file of list) {
        try {
          validateFile(file);
        } catch (e) {
          const cause = e instanceof Error ? e.message : "No se pudo leer.";
          setPhase({
            name: "error",
            file: `«${file.name}»`,
            cause,
            tip: /formato/.test(cause)
              ? "Usa PDF, Word, PowerPoint, Excel, una imagen o texto."
              : /supera/.test(cause)
                ? "Divide el PDF o haz una foto de cada página."
                : "Elige otro archivo.",
          });
          return;
        }
      }
      setPendingFiles(list);
      setPhase({ name: "uploading", count: list.length });
      startTransition(() => router.push(`/chat?new=${Date.now()}`));
    },
    [router],
  );

  const isFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const dropHandlers = {
    onDragEnter(e: DragEvent) {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(e: DragEvent) {
      if (!isFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(e: DragEvent) {
      if (!isFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    },
    onDrop(e: DragEvent) {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      handle(e.dataTransfer.files);
    },
  };

  return {
    phase,
    dragging,
    pick,
    handle,
    input,
    dropHandlers,
  };
}

export type NotesUpload = ReturnType<typeof useNotesUpload>;

/** Hidden native picker shared by every "Subir apuntes" button. */
export function NotesFileInput({
  input,
  onFiles,
}: {
  input: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={input}
      className="visually-hidden"
      type="file"
      accept={fileAccept}
      multiple
      tabIndex={-1}
      aria-hidden="true"
      data-testid="notes-file-input"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ""; // picking the same file again still fires
        onFiles(files);
      }}
    />
  );
}

/**
 * Upload status: idle hint (pointer devices with notes), dragging, uploading
 * and error. Icon and text in every state; the live region announces changes.
 */
export function NotesUploadStatus({
  upload,
  showHint,
}: {
  upload: NotesUpload;
  showHint: boolean;
}) {
  const { phase, dragging, pick } = upload;
  const state = dragging ? "dragging" : phase.name;
  return (
    <div
      className={s.zone}
      data-state={state}
      data-hint={showHint ? "true" : "false"}
      data-testid="notes-upload"
    >
      <div className={s.zoneLive} aria-live="polite">
        {state === "dragging" ? (
          <p className={s.zoneLine}>
            <UploadIcon />
            <span>
              <strong>Suelta para subir</strong>
              <span className={s.zoneHint}>Hasta {MAX_FILES} archivos a la vez.</span>
            </span>
          </p>
        ) : phase.name === "uploading" ? (
          <div className={s.zoneLine} role="status">
            <UploadIcon />
            <span className={s.zoneText}>
              <strong>
                Preparando{" "}
                {phase.count === 1 ? "1 archivo" : `${phase.count} archivos`}…
              </strong>
              <span className={s.zoneHint}>
                Se abrirá el chat para analizarlos.
              </span>
              <span className={s.progress} aria-hidden="true">
                <span />
              </span>
            </span>
          </div>
        ) : phase.name === "error" ? (
          <div className={s.zoneError} role="alert">
            <p className={s.zoneLine}>
              <AlertIcon />
              <span>
                <strong>No se pudo subir {phase.file}</strong>
                <span className={s.zoneHint}>
                  {phase.cause} {phase.tip}
                </span>
              </span>
            </p>
            <button type="button" className="secondary press" onClick={pick}>
              Reintentar
            </button>
          </div>
        ) : (
          <p className={s.zoneLine}>
            <UploadIcon />
            <span>
              <strong>Arrastra aquí tus apuntes</strong>
              <span className={s.zoneHint}>
                PDF, Word o imagen. Hasta 8 MB.
              </span>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export function UploadIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}
