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
import type { Attachment } from "@/lib/types";
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
      <span className="attachment-info">
        <strong>{a.file.name}</strong>
        <small>
          {status} · {kind} · {size}
        </small>
        {a.error && <small className="attachment-error">{a.error}</small>}
      </span>
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
        aria-label={`Quitar ${a.file.name}`}
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
  onRemove,
  onRetry,
  busy,
}: {
  attachment: Attachment;
  onAnalyze: () => void;
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
        Puedes pedir un resumen, preguntar por un concepto o preparar un test.
      </p>
      <button
        className="primary"
        disabled={busy || attachment.status !== "ready"}
        onClick={onAnalyze}
      >
        Analizar archivo <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
