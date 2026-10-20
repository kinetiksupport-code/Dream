"use client";
// Antes de empezar (prompt «sintagmas» §1): apuntes o deberes antiguos para
// ver cómo quiere el profesor que se haga. Se suben por la ruta normal de
// adjuntos (attachment_upload, con su file-guard) a la conversación de la
// actividad; luego dream-api saca las convenciones. «Saltar» siempre a mano.
import { useRef, useState } from "react";
import { Check, FileText, Upload, X } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { fileAccept, toBase64, validateFile } from "@/lib/attachments";
import { syntaxConventions, type SyntaxState } from "@/lib/sintagmas";
import s from "./sintagmas.module.css";

type Row = { key: string; name: string; status: "uploading" | "ready" | "error"; id?: string; error?: string };

export function NotesStep({
  conversationId,
  ensureConversation,
  onDone,
  onSkip,
}: {
  conversationId: string | null;
  /** Crea la conversación «Repaso de sintagmas» si se entró sin ninguna. */
  ensureConversation: () => Promise<string>;
  onDone: (state: SyntaxState, found: boolean) => void;
  onSkip: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conversation = useRef(conversationId);
  const patch = (key: string, next: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...next } : r)));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files).slice(0, 8)) {
      const key = crypto.randomUUID();
      setRows((list) => [...list, { key, name: file.name, status: "uploading" }]);
      try {
        validateFile(file);
        conversation.current ??= await ensureConversation();
        const r = await callDream<{ attachment: { id: string } }>("attachment_upload", {
          conversation_id: conversation.current,
          file_name: file.name,
          mime_type: file.type,
          content_base64: await toBase64(file),
        });
        patch(key, { status: "ready", id: r.attachment.id });
      } catch (e) {
        patch(key, { status: "error", error: errorMessage(e) });
      }
    }
  }
  const ready = rows.filter((r) => r.status === "ready" && r.id);
  const uploading = rows.some((r) => r.status === "uploading");

  async function finish() {
    if (!ready.length || !conversation.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await syntaxConventions(conversation.current, ready.map((x) => x.id!));
      onDone(r.state, r.found);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className={s.notes} aria-labelledby="sintagmas-notas">
      <h1 id="sintagmas-notas" className={s.notesTitle}>
        ¿Tienes apuntes o deberes antiguos de sintagmas?
      </h1>
      <p className={s.notesLead}>
        Así veo cómo quiere tu profesor que se haga. <b>Cuantos más haya mejor.</b>
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept={fileAccept}
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <button type="button" className={`secondary press ${s.uploadButton}`} onClick={() => input.current?.click()}>
        <Upload size={18} aria-hidden="true" />
        Subir desde el ordenador
      </button>
      {rows.length > 0 && (
        <ul className={s.files} aria-label="Archivos">
          {rows.map((r) => (
            <li key={r.key} data-status={r.status}>
              <FileText size={16} aria-hidden="true" />
              <span className={s.fileName}>{r.name}</span>
              <span className={s.fileState}>
                {r.status === "uploading" && "Subiendo…"}
                {r.status === "ready" && (
                  <>
                    <Check size={14} aria-hidden="true" /> Listo
                  </>
                )}
                {r.status === "error" && (
                  <>
                    <X size={14} aria-hidden="true" /> {r.error}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className={s.notesActions}>
        <button
          type="button"
          className="primary press"
          disabled={!ready.length || uploading || busy}
          aria-busy={busy || undefined}
          onClick={() => void finish()}
        >
          {busy ? "Leyendo tus apuntes…" : "Usar estos apuntes"}
        </button>
        <button type="button" className="secondary press" onClick={onSkip} disabled={busy}>
          Saltar
        </button>
      </div>
    </section>
  );
}
