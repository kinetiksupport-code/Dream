"use client";
import { AttachmentItem } from "./attachment";
import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { PASTE_LIMIT, nextPastedNumber, pastedFile } from "@/lib/pasted-text";
import { PlusIcon, SendIcon, StopIcon } from "./icons";
import type { Attachment, DreamState } from "@/lib/types";
import { fileAccept } from "@/lib/attachments";
import { useOnline } from "@/lib/use-online";
import { useMediaQuery } from "@/lib/use-media-query";
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onFiles,
  attachments,
  onRemove,
  onRetry,
  busy,
  state,
  unavailable = false,
  variant = "dock",
  placeholder,
  modes,
  sending = false,
}: {
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFiles: (f: File[]) => void;
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  busy: boolean;
  state: DreamState;
  unavailable?: boolean;
  /** "hero": large composer of the empty state. "dock": single row under a thread. */
  variant?: "hero" | "dock";
  placeholder?: string;
  /** Selector de modo de la IA (Rápido, Normal, Pensar más). */
  modes?: ReactNode;
  /** Inicio: the message is on its way and the box is fading out. */
  sending?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const compact = useMediaQuery("(max-width: 639.98px)");
  // The box grows with the text. Browsers with `field-sizing: content` do it
  // in CSS; the rest get the height set here, without any transition.
  useEffect(() => {
    const el = textarea.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value, variant]);
  const blocked =
    unavailable || !online || attachments.some((a) => a.status !== "ready");
  const [savedAsFile, setSavedAsFile] = useState(false);
  useEffect(() => {
    if (!savedAsFile) return;
    const t = window.setTimeout(() => setSavedAsFile(false), 5000);
    return () => window.clearTimeout(t);
  }, [savedAsFile]);
  // Texto largo → archivo «Texto pegado» (como Claude): no va en el mensaje y
  // Dream lee solo los trozos que necesita en cada turno.
  const asFile = (text: string) =>
    onFiles([pastedFile(text, nextPastedNumber(attachments.map((a) => a.file.name)))]);
  function paste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      onFiles(files);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.length > PASTE_LIMIT && attachments.length < 4) {
      e.preventDefault();
      asFile(text);
    }
  }
  function type(next: string) {
    // Si escribe más de 1.500 caracteres seguidos, también se guarda como archivo.
    if (next.length > PASTE_LIMIT && value.length <= PASTE_LIMIT && attachments.length < 4) {
      asFile(next);
      onChange("");
      setSavedAsFile(true);
      return;
    }
    onChange(next);
  }
  const attach = (
    <>
      <button
        type="button"
        className="icon-button attach-button press"
        disabled={busy || unavailable || attachments.length >= 4}
        aria-label="Adjuntar archivo"
        onClick={() => input.current?.click()}
      >
        <PlusIcon />
      </button>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept={fileAccept}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
  const send = (
    <button
      type="button"
      className={`send-button press${busy ? " stop-button" : ""}`}
      aria-label={busy ? "Detener respuesta" : "Enviar mensaje"}
      onClick={sending ? undefined : busy ? onStop : onSend}
      disabled={
        !busy && ((!value.trim() && attachments.length === 0) || blocked)
      }
    >
      {busy ? <StopIcon /> : <SendIcon />}
    </button>
  );
  const field = (
    <textarea
      ref={textarea}
      value={value}
      maxLength={12000}
      onChange={(e) => type(e.target.value)}
      onPaste={paste}
      placeholder={
        placeholder ??
        (variant === "hero"
          ? compact
            ? "Haz una pregunta"
            : "Haz una pregunta o pega un ejercicio"
          : "Escribe tu mensaje")
      }
      aria-label="Mensaje para Dream"
      rows={1}
      readOnly={sending}
      enterKeyHint="send"
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!busy && !blocked && !sending) onSend();
        }
      }}
    />
  );
  return (
    <div
      className={`composer composer-${variant}${busy ? " is-streaming" : ""}${sending ? " is-sending" : ""}`}
      // Hook for the "border-beam" (> 3 s wait) once Carlos approves it.
      data-state={busy ? state : undefined}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((a) => (
            <AttachmentItem
              key={a.localId}
              attachment={a}
              busy={busy}
              onRemove={() => onRemove(a.localId)}
              onRetry={() => onRetry(a.localId)}
            />
          ))}
        </div>
      )}
      {variant === "hero" ? (
        <>
          {field}
          <div className="composer-controls">
            <div className="composer-tools">
              {attach}
              {modes}
            </div>
            {send}
          </div>
        </>
      ) : (
        <>
          {modes && <div className="composer-modes">{modes}</div>}
          <div className="composer-row">
            {attach}
            {field}
            {send}
          </div>
        </>
      )}
      {savedAsFile && (
        <p className="composer-note" role="status">
          Lo guardo como archivo para que Dream lo lea mejor.
        </p>
      )}
      {!online && (
        <p className="composer-offline" role="status">
          Sin conexión. Tu texto se queda aquí y podrás enviarlo cuando vuelva
          la red.
        </p>
      )}
      {/* The detailed state (Pensando, Buscando…) is announced by AiStatus in
          the thread; here only that an answer is in progress. */}
      <span className="visually-hidden" role="status">
        {busy ? "Dream está respondiendo" : ""}
      </span>
    </div>
  );
}
