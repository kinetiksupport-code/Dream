"use client";
// Paso 2: «Primero, sube tus apuntes» (§5.3). Escritorio: soltar o elegir
// archivos a la izquierda y el QR a la derecha. Móvil: «Hacer foto» (cámara
// trasera, varias seguidas) y «Subir archivo». Lista con Subiendo… →
// Procesando archivo… → tick dibujado.
import { useRef, useState, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Camera, FileText, FileUp, RotateCcw, Upload, X } from "lucide-react";
import { fileAccept } from "@/lib/attachments";
import { MAX_EXAM_MATERIALS } from "@/lib/exam-plans";
import { fileSize, photoName } from "@/lib/exam-wizard";
import { Orb } from "../../orb";
import { DrawnTick } from "../../drawn-tick";
import type { FileRow, useUploads } from "./use-uploads";
import s from "./wizard.module.css";

// The QR (encoder + polling) only loads on desktop, on this step.
const QrPanel = dynamic(() => import("../qr-panel").then((m) => m.QrPanel), {
  ssr: false,
});

type Uploads = ReturnType<typeof useUploads>;

export function StepUpload({
  examId,
  desktop,
  uploads,
  disabled,
}: {
  examId: string;
  desktop: boolean;
  uploads: Uploads;
  disabled: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [photos, setPhotos] = useState(0);
  const depth = useRef(0);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setDrag(false);
    if (!disabled) void uploads.addFiles(Array.from(e.dataTransfer.files));
  }
  const fileInputs = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={fileAccept}
        multiple
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void uploads.addFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = "";
          // Phones name every photo «image.jpg»: number them instead.
          const named = list.map(
            (f, i) => new File([f], photoName(photos + i + 1, f.type), { type: f.type }),
          );
          setPhotos((n) => n + list.length);
          void uploads.addFiles(named);
        }}
      />
    </>
  );

  return (
    <>
      {fileInputs}
      {desktop ? (
        <div className={s.uploadGrid}>
          <div
            className={s.dropzone}
            data-drag={drag ? "over" : undefined}
            onDragEnter={(e) => {
              e.preventDefault();
              depth.current++;
              setDrag(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
              depth.current = Math.max(0, depth.current - 1);
              if (!depth.current) setDrag(false);
            }}
            onDrop={onDrop}
          >
            <span className={s.dropIcon} aria-hidden="true">
              <Upload size={28} />
            </span>
            <strong>{drag ? "Suéltalos aquí" : "Arrastra tus apuntes aquí"}</strong>
            <p>
              PDF, Word, PowerPoint, Excel, imágenes o texto. Hasta{" "}
              <span className="num">{MAX_EXAM_MATERIALS}</span> archivos de{" "}
              <span className="num">8</span> MB.
            </p>
            <button
              type="button"
              className="primary press"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <FileUp size={18} aria-hidden="true" /> Añadir desde este dispositivo
            </button>
          </div>
          <QrPanel examId={examId} onFiles={uploads.onQrFiles} />
        </div>
      ) : (
        <div className={s.mobileButtons}>
          <button
            type="button"
            className={`${s.bigChoice} press`}
            disabled={disabled}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera size={32} aria-hidden="true" />
            {photos ? "Hacer otra foto" : "Hacer foto"}
          </button>
          <button
            type="button"
            className={`${s.bigChoice} press`}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp size={32} aria-hidden="true" />
            Subir archivo
          </button>
        </div>
      )}
      <p className={s.privacy}>No subas datos de otras personas.</p>

      {uploads.duplicates.map((d) => (
        <div className={s.notice} key={d.key} role="status">
          <p>
            <b>«{d.file.name}»</b> parece el mismo archivo que «{d.of}», que ya
            está subido.
          </p>
          <div className={s.noticeActions}>
            <button
              type="button"
              className="secondary press"
              onClick={() => uploads.resolveDuplicate(d.key, false)}
            >
              No subirlo
            </button>
            <button
              type="button"
              className="text-button press"
              onClick={() => uploads.resolveDuplicate(d.key, true)}
            >
              Subirlo igualmente
            </button>
          </div>
        </div>
      ))}
      {uploads.error && (
        <p className={s.fieldError} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {uploads.error}
        </p>
      )}
      {uploads.rows.length > 0 && (
        <ul className={s.files} aria-label="Tus apuntes">
          {uploads.rows.map((row) => (
            <FileItem
              key={row.key}
              row={row}
              onRemove={() => void uploads.remove(row)}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function FileItem({
  row,
  onRemove,
  disabled,
}: {
  row: FileRow;
  onRemove: () => void;
  disabled: boolean;
}) {
  const working = row.status === "uploading" || row.status === "processing";
  return (
    <li className={s.fileRow} data-status={row.status}>
      <span className={s.thumb} aria-hidden="true">
        {row.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={row.preview} alt="" />
        ) : (
          <FileText size={22} />
        )}
      </span>
      <span className={s.fileText}>
        <span className={s.fileName}>{row.name}</span>
        <span className={s.fileMeta} role={row.status === "error" ? "alert" : "status"}>
          {row.status === "uploading" ? (
            <>
              <span className={s.uploadBar} aria-hidden="true" /> Subiendo…
            </>
          ) : row.status === "processing" ? (
            "Procesando archivo…"
          ) : row.status === "ready" ? (
            <>
              Listo · {fileSize(row.size)}
              {row.source === "qr" && " · desde el móvil"}
            </>
          ) : (
            row.error
          )}
        </span>
      </span>
      <span className={s.rowActions}>
        <span className={s.fileState} aria-hidden="true">
          {row.status === "processing" ? (
            <Orb size={24} pulsing />
          ) : row.status === "ready" ? (
            <DrawnTick className={s.tick} />
          ) : null}
        </span>
        {row.retry && (
          <button
            type="button"
            className={`${s.iconButton} press`}
            aria-label={`Reintentar ${row.name}`}
            onClick={row.retry}
            disabled={disabled}
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        )}
        {!working && (
          <button
            type="button"
            className={`${s.iconButton} press`}
            aria-label={`Quitar ${row.name}`}
            onClick={onRemove}
            disabled={disabled}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </span>
    </li>
  );
}
