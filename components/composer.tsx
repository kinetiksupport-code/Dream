"use client";
import { AttachmentItem } from "./attachment";
import { useEffect, useRef, type ClipboardEvent } from "react";
import { ArrowUp, Plus, Square } from "lucide-react";
import type { Attachment, DreamState } from "@/lib/types";
import { fileAccept } from "@/lib/attachments";
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
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [value]);
  const blocked = unavailable || attachments.some((a) => a.status !== "ready");
  function paste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      onFiles(files);
    }
  }
  return (
    <div
      className={`composer ${busy ? "is-streaming" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
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
      <textarea
        ref={textarea}
        value={value}
        maxLength={12000}
        onChange={(e) => onChange(e.target.value)}
        onPaste={paste}
        placeholder="Pregunta, pega o suelta un archivo"
        aria-label="Mensaje para Dream"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy && !blocked) onSend();
          }
        }}
      />
      <div className="composer-controls">
        <div>
          <button
            className="icon-button attach-button"
            disabled={busy || unavailable || attachments.length >= 4}
            aria-label="Adjuntar archivo"
            onClick={() => input.current?.click()}
          >
            <Plus size={20} />
          </button>
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept={fileAccept}
            multiple
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <span className="composer-hint">PDF, imagen y más</span>
        </div>
        <div>
          <button
            className={`send-button ${busy ? "stop-button" : ""}`}
            aria-label={busy ? "Detener respuesta" : "Enviar mensaje"}
            onClick={busy ? onStop : onSend}
            disabled={
              !busy && ((!value.trim() && attachments.length === 0) || blocked)
            }
          >
            {busy ? (
              <Square size={15} fill="currentColor" />
            ) : (
              <ArrowUp size={19} />
            )}
          </button>
        </div>
      </div>
      <span className="visually-hidden" role="status">
        {state === "searching"
          ? "Buscando en la web"
          : busy
            ? "Dream está respondiendo"
            : ""}
      </span>
    </div>
  );
}
