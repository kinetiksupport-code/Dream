"use client";
// Las tarjetas de un examen (Bloque 4): repasar, crear, editar, ocultar,
// borrar, importar y exportar en CSV. Sin IA. Las tarjetas están dentro de
// Exámenes, sin sección nueva en el menú (decisión de Carlos).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, EyeOff, Pencil, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import { CARD_SIDE_MAX, exportCards, parseCards, type ParsedCards } from "@/lib/card-csv";
import { cardCreate, cardDelete, cardReport, cardUpdate, cardsImport, cardsList, type OwnCard } from "@/lib/study-api";
import { BottomSheet } from "../bottom-sheet";
import s from "./cards.module.css";

const ORIGIN: Record<OwnCard["origin"], string> = {
  ai: "De la lección",
  mistake: "De un fallo",
  own: "Tuya",
  import: "Importada",
};

type Sheet = { kind: "edit"; card: OwnCard | null } | { kind: "csv" } | null;

export function ExamCards({ examId }: { examId: string }) {
  const [cards, setCards] = useState<OwnCard[] | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [parsed, setParsed] = useState<ParsedCards | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await cardsList(examId);
      setCards(r.cards);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  function openEdit(card: OwnCard | null) {
    setFront(card?.front ?? "");
    setBack(card?.back ?? "");
    setError("");
    setSheet({ kind: "edit", card });
  }
  async function save() {
    if (!sheet || sheet.kind !== "edit") return;
    setBusy(true);
    try {
      if (sheet.card) await cardUpdate(sheet.card.id, front.trim(), back.trim());
      else await cardCreate(examId, front.trim(), back.trim());
      setSheet(null);
      setNotice(sheet.card ? "Tarjeta guardada." : "Tarjeta creada.");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(card: OwnCard, what: "hide" | "delete") {
    setBusy(true);
    try {
      if (what === "hide") await cardReport(card.id);
      else await cardDelete(card.id);
      setNotice(what === "hide" ? "La tarjeta ya no saldrá en el repaso." : "Tarjeta borrada.");
      await load();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 512 * 1024) return setParsed({ rows: [], skipped: 0, truncated: true });
    setParsed(parseCards(await f.text()));
  }
  async function doImport() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    try {
      const r = await cardsImport(examId, parsed.rows);
      setSheet(null);
      setParsed(null);
      setNotice(`${r.created} ${r.created === 1 ? "tarjeta importada" : "tarjetas importadas"}.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function doExport() {
    if (!cards?.length) return;
    const blob = new Blob([exportCards(cards)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tarjetas-dream.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={s.page} data-testid="tarjetas-examen">
      <div className={s.head}>
        <Link className={`${s.round} press`} href={`/exams/${examId}/ruta`} aria-label="Volver a la ruta">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1>Tus tarjetas</h1>
      </div>
      <div className={s.actions}>
        <Link className="primary press" href={`/exams/repaso?desde=${examId}`}>
          Repasar las de hoy
        </Link>
        <button type="button" className="secondary press" onClick={() => openEdit(null)}>
          Crear tarjeta
        </button>
        <button
          type="button"
          className="secondary press"
          onClick={() => {
            setParsed(null);
            setError("");
            setSheet({ kind: "csv" });
          }}
        >
          CSV
        </button>
      </div>
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      {notice && <p className={s.note}>{notice}</p>}
      {!cards && !error && <p className={s.note}>Cargando…</p>}
      {!sheet && error && (
        <p className={s.note} role="alert">
          {error}
        </p>
      )}
      {cards && !cards.length && <p className={s.note}>Aún no tienes tarjetas. Salen al hacer una lección, o puedes crearlas tú.</p>}
      {cards && cards.length > 0 && (
        <ul className={s.list}>
          {cards.map((c) => (
            <li key={c.id} className={s.item} data-hidden={c.suspended || undefined}>
              <div className={s.itemText}>
                <strong>{c.front}</strong>
                <span>{c.back}</span>
                <small className={s.tag}>
                  {ORIGIN[c.origin]}
                  {c.suspended ? " · Oculta" : ""}
                </small>
              </div>
              <button type="button" className={s.iconBtn} aria-label="Editar tarjeta" disabled={busy} onClick={() => openEdit(c)}>
                <Pencil size={18} aria-hidden="true" />
              </button>
              {!c.suspended && (
                <button type="button" className={s.iconBtn} aria-label="No estoy de acuerdo: ocultar del repaso" disabled={busy} onClick={() => void act(c, "hide")}>
                  <EyeOff size={18} aria-hidden="true" />
                </button>
              )}
              <button type="button" className={s.iconBtn} aria-label="Borrar tarjeta" disabled={busy} onClick={() => void act(c, "delete")}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sheet?.kind === "edit" && (
        <BottomSheet labelledBy="tarjeta-editar" onClose={() => setSheet(null)}>
          <h2 id="tarjeta-editar">{sheet.card ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
          <div className={s.form}>
            <label>
              Pregunta
              <textarea rows={3} maxLength={CARD_SIDE_MAX} value={front} onChange={(e) => setFront(e.target.value)} />
              <small className="num">
                {front.length}/{CARD_SIDE_MAX}
              </small>
            </label>
            <label>
              Respuesta
              <textarea rows={3} maxLength={CARD_SIDE_MAX} value={back} onChange={(e) => setBack(e.target.value)} />
              <small className="num">
                {back.length}/{CARD_SIDE_MAX}
              </small>
            </label>
            {error && (
              <p className={s.note} role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button className="secondary press" onClick={() => setSheet(null)}>
              Cancelar
            </button>
            <button className="primary press" disabled={busy || !front.trim() || !back.trim()} onClick={() => void save()}>
              Guardar
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === "csv" && (
        <BottomSheet labelledBy="tarjetas-csv" onClose={() => setSheet(null)}>
          <h2 id="tarjetas-csv">Tus tarjetas en CSV</h2>
          <p className={s.note}>Una tarjeta por fila: pregunta;respuesta. Vale el CSV o TSV de Quizlet y Anki. Como mucho 500 filas.</p>
          <input
            ref={file}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="visually-hidden"
            aria-label="Elegir archivo CSV"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          {parsed && (
            <>
              <p className={s.note} role="status">
                {parsed.rows.length} {parsed.rows.length === 1 ? "tarjeta lista" : "tarjetas listas"}
                {parsed.skipped ? ` · ${parsed.skipped} filas no valen (vacías o de más de 300 caracteres)` : ""}
                {parsed.truncated ? " · solo se importan las 500 primeras" : ""}
              </p>
              <ul className={s.preview}>
                {parsed.rows.slice(0, 5).map((r, n) => (
                  <li key={n}>
                    <strong>{r.front}</strong> · {r.back}
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && (
            <p className={s.note} role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {parsed?.rows.length ? (
              <button className="primary press" disabled={busy} onClick={() => void doImport()}>
                Importar {parsed.rows.length}
              </button>
            ) : (
              <button className="primary press" onClick={() => file.current?.click()}>
                Importar desde CSV
              </button>
            )}
            <button className="secondary press" disabled={!cards?.length} onClick={doExport}>
              Exportar {cards?.length ?? 0} {cards?.length === 1 ? "tarjeta" : "tarjetas"}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
