"use client";
import Image from "next/image";
import {
  FileText,
  ImageIcon,
  Presentation,
  FileSpreadsheet,
  X,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Attachment } from "@/lib/types";
import { isPastedName, wordCount, wordsLabel } from "@/lib/pasted-text";
import { BottomSheet } from "./bottom-sheet";
export function AttachmentItem({
  attachment: a,
  busy = false,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  busy?: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const ext = a.file.name.split(".").pop()?.toLowerCase();
  const kind = a.file.type.startsWith("image/")
    ? "Imagen"
    : ext === "docx"
      ? "Word"
      : ext === "pptx"
        ? "PPT"
        : ext === "xlsx"
          ? "Excel"
          : ext?.toUpperCase() || "Archivo";
  const Icon =
    kind === "Imagen"
      ? ImageIcon
      : kind === "PPT"
        ? Presentation
        : kind === "Excel"
          ? FileSpreadsheet
          : FileText;
  const status = a.queued
    ? "En espera"
    : a.status === "ready"
      ? "Listo"
      : a.status === "uploading"
        ? "Subiendo"
        : a.status === "processing"
          ? "Procesando"
          : "Error";
  // «Texto pegado · 2.340 palabras»: se puede abrir para verlo y quitar.
  const pasted = isPastedName(a.file.name);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!pasted) return;
    let alive = true;
    void a.file.text().then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, [pasted, a.file]);
  const size =
    a.file.size >= 1024 * 1024
      ? `${(a.file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(a.file.size / 1024))} KB`;
  return (
    <div className={`attachment-chip ${a.status}`}>
      <span className="attachment-icon">
        {a.preview ? (
          <Image
            src={a.preview}
            unoptimized
            width={40}
            height={40}
            alt={`Vista previa de ${a.file.name}`}
          />
        ) : (
          <Icon size={20} />
        )}
      </span>
      {pasted ? (
        <button type="button" className="attachment-info pasted-open" onClick={() => setOpen(true)} aria-label="Ver el texto pegado">
          <strong>Texto pegado</strong>
          <small>
            {status} · {text === null ? "…" : wordsLabel(wordCount(text))}
          </small>
        </button>
      ) : (
      <span className="attachment-info">
        <strong>{a.file.name}</strong>
        <small>
          {status} · {kind} · {size}
        </small>
        {a.error && <small className="attachment-error">{a.error}</small>}
      </span>
      )}
      {open && (
        <BottomSheet labelledBy={`pegado-${a.localId}`} onClose={() => setOpen(false)}>
          <h2 id={`pegado-${a.localId}`}>Texto pegado</h2>
          <pre className="pasted-view">{text}</pre>
          <div className="modal-actions">
            <button className="secondary press" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </BottomSheet>
      )}
      {a.status === "error" && (
        <button
          className="icon-button"
          disabled={busy}
          aria-label={`Reintentar ${a.file.name}`}
          onClick={onRetry}
        >
          <RotateCcw size={16} />
        </button>
      )}
      <button
        className="icon-button"
        disabled={busy}
        aria-label={pasted ? "Quitar el texto pegado" : `Quitar ${a.file.name}`}
        onClick={onRemove}
      >
        <X size={16} />
      </button>
    </div>
  );
}
export function FileCard({
  attachment,
  onAnalyze,
  onScheme,
  onRemove,
  onRetry,
  busy,
}: {
  attachment: Attachment;
  onAnalyze: () => void;
  /** «Esquema de estos apuntes» (docs/ESQUEMAS.md). */
  onScheme?: () => void;
  onRemove: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <section className="file-card">
      <AttachmentItem
        attachment={attachment}
        busy={busy}
        onRemove={onRemove}
        onRetry={onRetry}
      />
      <h2>Tus apuntes, más claros.</h2>
      <p>
        Puedes pedir un resumen, un esquema, preguntar por un concepto o preparar un test.
      </p>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || attachment.status !== "ready"}
          onClick={onAnalyze}
        >
          Analizar archivo <span aria-hidden="true">→</span>
        </button>
        {onScheme ? (
          <button
            className="secondary"
            disabled={busy || attachment.status !== "ready"}
            onClick={onScheme}
          >
            Esquema de estos apuntes
          </button>
        ) : null}
      </div>
    </section>
  );
}
