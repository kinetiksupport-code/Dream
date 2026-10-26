"use client";
import { useId, useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import {
  commitImport,
  previewImport,
  KIND_LABELS,
  type ImportPreview,
} from "@/lib/memory";

const MAX = 6000;

/**
 * Traer el perfil de otra IA (Bloque 6): copiar un texto, pegar la respuesta,
 * revisar y guardar. Nada se guarda hasta pulsar «Guardar». El texto pegado
 * no se guarda en ningún sitio.
 */
export function ImportFromAI({
  exportPrompt,
  importsLeft,
  onSaved,
  onLater,
}: {
  exportPrompt: string;
  importsLeft: number;
  onSaved: () => void;
  /** En la bienvenida: «Lo hago luego». */
  onLater?: () => void;
}) {
  const id = useId();
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [existing, setExisting] = useState({ nickname: false, interests: false });
  const [useNickname, setUseNickname] = useState(true);
  const [interestsMode, setInterestsMode] = useState<"add" | "replace">("add");
  const [saved, setSaved] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(exportPrompt);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    try {
      const r = await previewImport(text.trim());
      setPreview(r.preview);
      setExisting({ nickname: r.has_nickname, interests: r.has_interests });
      setUseNickname(!r.has_nickname);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await commitImport(preview, { useNickname, interestsMode });
      setSaved(
        r.added === 1 ? "Guardado: 1 recuerdo." : `Guardado: ${r.added} recuerdos.`,
      );
      setPreview(null);
      setText("");
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const remove = (index: number) =>
    preview &&
    setPreview({
      ...preview,
      memories: preview.memories.filter((_, i) => i !== index),
    });
  const removeInterest = (item: string) =>
    preview &&
    setPreview({
      ...preview,
      interests: preview.interests.filter((x) => x !== item),
    });

  return (
    <div className="memory-import" aria-labelledby={`${id}-title`} role="group">
      <h3 className="memory-kind" id={`${id}-title`}>
        Importar de otra IA
      </h3>
      {!preview ? (
        <>
          <p className="page-intro">
            ¿Estudiabas con ChatGPT, Gemini u otra IA? Copia este texto, pégalo
            allí y trae aquí su respuesta. Revisarás todo antes de guardarlo.
          </p>
          <pre className="memory-prompt" tabIndex={0} aria-label="Texto para copiar">
            {exportPrompt}
          </pre>
          <div className="button-row">
            <button type="button" className="secondary press" onClick={() => void copy()}>
              {copied === "ok" ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}{" "}
              {copied === "ok" ? "Copiado" : "Copiar"}
            </button>
          </div>
          {copied === "fail" && (
            <p className="settings-why" role="status">
              No se pudo copiar. Selecciona el texto de arriba y cópialo a mano.
            </p>
          )}
          <label className="field" htmlFor={`${id}-paste`}>
            <span>Cuando te responda, copia su respuesta y pégala aquí</span>
          </label>
          <textarea
            id={`${id}-paste`}
            className="memory-paste"
            value={text}
            maxLength={MAX}
            rows={6}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-count`}
          />
          <p className="settings-why" id={`${id}-count`} aria-live="polite">
            {text.length} / {MAX} caracteres · No pegues datos de otras personas.
            {importsLeft < 3 ? ` Te quedan ${importsLeft} importaciones hoy.` : ""}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="primary press"
              disabled={busy || text.trim().length < 20 || importsLeft <= 0}
              onClick={() => void review()}
            >
              {busy ? "Revisando…" : "Revisar"}
            </button>
            {onLater && (
              <button type="button" className="text-button press" onClick={onLater}>
                Lo hago luego
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="page-intro">
            Esto es lo que se guardaría. Quita lo que no quieras.
          </p>
          {preview.discarded > 0 && (
            <p className="settings-why" role="status">
              No hemos guardado lo que parecía personal.
            </p>
          )}
          <ul className="group-list">
            {preview.nickname && (
              <li className="group-row">
                <span className="row-text">
                  <strong>Que te llame «{preview.nickname}»</strong>
                  {existing.nickname && <small>Ya tienes un apodo.</small>}
                </span>
                <button
                  className="switch"
                  role="switch"
                  aria-label={`Cambiar mi apodo por ${preview.nickname}`}
                  aria-checked={useNickname}
                  onClick={() => setUseNickname(!useNickname)}
                />
              </li>
            )}
            {preview.interests.map((item) => (
              <li className="group-row" key={`i-${item}`}>
                <span className="row-text">
                  <strong>Le gusta: {item}</strong>
                </span>
                <button
                  type="button"
                  className="icon-action press"
                  aria-label={`Quitar: ${item}`}
                  onClick={() => removeInterest(item)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
            {preview.memories.map((m, i) => (
              <li className="group-row" key={`m-${i}`}>
                <span className="row-text">
                  <strong>{m.content}</strong>
                  <small>
                    {KIND_LABELS[m.kind]}
                    {m.subject ? ` · ${m.subject}` : ""}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-action press"
                  aria-label={`Quitar: ${m.content}`}
                  onClick={() => remove(i)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {existing.interests && preview.interests.length > 0 && (
            <fieldset className="memory-choice">
              <legend>Ya tienes aficiones guardadas</legend>
              <label>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={interestsMode === "add"}
                  onChange={() => setInterestsMode("add")}
                />{" "}
                Añadirlas a las mías
              </label>
              <label>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={interestsMode === "replace"}
                  onChange={() => setInterestsMode("replace")}
                />{" "}
                Sustituir las mías
              </label>
            </fieldset>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary press"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="secondary press"
              onClick={() => setPreview(null)}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
      <p className="settings-why" role="status">
        {saved}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
