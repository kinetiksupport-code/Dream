"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { notesMarkdown, type CleanNotesRow } from "@/lib/clean-notes";
import { download, exportPng, fileNameFor, printPdf } from "@/lib/esquema-export";
import { DreamActivity } from "@/components/dream-mark";
import { Hoja } from "./hoja";
import styles from "./apuntes-page.module.css";

/**
 * Pantalla de unos apuntes pasados a limpio (docs/APUNTES-LIMPIOS.md): las
 * hojas van apareciendo en orden (una llamada por página) y se descargan en
 * PDF o en imagen PNG.
 */
export function ApuntesPage({ id }: { id: string }) {
  const [row, setRow] = useState<CleanNotesRow | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [more, setMore] = useState(0);
  const sheets = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    callDream<{ notes: CleanNotesRow }>("notes_clean_get", { notes_id: id }, controller.signal)
      .then((r) => setRow(r.notes))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  // Las páginas que faltan, una a una y en orden: el alumno las ve aparecer.
  const pending = row ? row.done < row.total_pages : false;
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    setWorking(true);
    setPageError("");
    callDream<{ notes: CleanNotesRow }>("notes_clean_page", { notes_id: id }, controller.signal)
      .then((r) => setRow(r.notes))
      .catch((e) => {
        if (!controller.signal.aborted) setPageError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setWorking(false);
      });
    return () => controller.abort();
  }, [id, pending, row?.done, more]);

  if (loading)
    return (
      <div className="boot">
        <DreamActivity state="thinking" label="Abriendo tus apuntes" />
      </div>
    );
  if (!row)
    return (
      <div className="boot">
        <div className="status-page">
          <h1>No pudimos abrir estos apuntes</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="button-row">
            <button className="primary press" onClick={() => setRetry((s) => s + 1)}>
              Reintentar
            </button>
            <Link className="secondary press" href="/dreams">
              Ir a Dreams
            </Link>
          </div>
        </div>
      </div>
    );

  const notes = row.content;
  const name = notes.title || row.title;
  const unreadable = notes.pages.reduce((n, p) => n + p.unreadable.length, 0);
  const doubts = notes.pages.flatMap((p) => p.doubts);
  const node = () => sheets.current?.firstElementChild as HTMLElement;
  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setNotice("");
    try {
      await task();
    } catch {
      setNotice("No se pudo preparar la imagen en este navegador. Prueba con «PDF».");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <Link className="secondary press" href="/dreams">
          <ArrowLeft size={18} aria-hidden="true" /> Volver
        </Link>
        <details className={styles.menu}>
          <summary className="secondary press" aria-disabled={pending || undefined}>
            <Download size={18} aria-hidden="true" /> {busy ? "Preparando…" : "Descargar"}
          </summary>
          <div className={styles.menuList} role="menu">
            <button role="menuitem" onClick={() => printPdf("portrait")}>
              PDF (A4)
            </button>
            <button role="menuitem" onClick={() => run("png", () => exportPng(node(), name, "apuntes"))}>
              Imagen (PNG)
            </button>
            <button
              role="menuitem"
              onClick={() => download(new Blob([notesMarkdown(notes)], { type: "text/markdown" }), fileNameFor(name, "md", "apuntes"))}
            >
              Texto (Markdown)
            </button>
          </div>
        </details>
      </div>

      <div className={styles.notices}>
        <p className={styles.hint}>Hecho a partir de tus apuntes. Revísalo.</p>
        {unreadable ? (
          <p className={styles.warn} role="note">
            No he podido leer {unreadable === 1 ? "1 trozo" : `${unreadable} trozos`} de la foto: revísalos.
          </p>
        ) : null}
        {doubts.length ? (
          <div className={styles.warn} role="note">
            <strong>Revisa estos datos de tus apuntes:</strong>
            <ul>
              {doubts.map((d, i) => (
                <li key={i}>{d.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {notes.truncated ? (
          <p className={styles.hint}>Tus apuntes eran muy largos: he pasado a limpio las primeras {row.total_pages} páginas.</p>
        ) : null}
        {notice ? <p className={styles.warn}>{notice}</p> : null}
      </div>

      <div className="esquema-print" ref={sheets}>
        <Hoja notes={notes} />
      </div>

      <div className={styles.progress} role="status" aria-live="polite">
        {pending && working ? (
          <DreamActivity state="thinking" label={`Pasando a limpio la página ${row.done + 1} de ${row.total_pages}…`} />
        ) : pageError ? (
          <div className={styles.pageError}>
            <p className="error">{pageError}</p>
            <button className="primary press" onClick={() => setMore((n) => n + 1)}>
              Reintentar la página {row.done + 1}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
