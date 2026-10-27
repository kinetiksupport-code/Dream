"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, ListChecks, Pencil, Redo2, Undo2 } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import type { Scheme, SchemeSection } from "@/lib/esquema";
import { commit, historyOf, insertAt, moveSection, redo, removeAt, setAt, setTone, undo, type History } from "@/lib/esquema-edit";
import { exportHtml, exportPng, exportSvg, download, fileNameFor, printPdf, toMarkdown } from "@/lib/esquema-export";
import { DreamActivity } from "@/components/dream-mark";
import { EsquemaView, type SchemeEditApi } from "./esquema-view";
import styles from "./esquema-page.module.css";

type Row = { id: string; title: string; content: Scheme };
type Save = "idle" | "saving" | "saved" | "error";

/**
 * Pantalla de un esquema guardado (docs/ESQUEMAS.md): verlo, editarlo en su
 * sitio con deshacer/rehacer y guardado automático, «Pedir a la IA» por
 * tarjeta, descargarlo y convertirlo en un test de repaso.
 */
export function EsquemaPage({ id }: { id: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<History | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [refining, setRefining] = useState<number | null>(null);
  const [save, setSave] = useState<Save>("idle");
  const [busy, setBusy] = useState("");
  const article = useRef<HTMLDivElement>(null);
  const saved = useRef<Scheme | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    callDream<{ scheme: Row }>("scheme_get", { scheme_id: id }, controller.signal)
      .then((r) => {
        setHistory(historyOf(r.scheme.content));
        saved.current = r.scheme.content;
        setTitle(r.scheme.title);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  const scheme = history?.present ?? null;

  // Guardado automático: 1 s después del último cambio.
  useEffect(() => {
    if (!scheme || scheme === saved.current) return;
    setSave("saving");
    const timer = window.setTimeout(() => {
      callDream<{ content: Scheme }>("scheme_update", { scheme_id: id, content: scheme })
        .then(() => {
          saved.current = scheme;
          setSave("saved");
        })
        .catch((e) => {
          setSave("error");
          setNotice(errorMessage(e));
        });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [scheme, id]);

  // Al salir con cambios sin guardar, el navegador avisa.
  useEffect(() => {
    if (save !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const change = useCallback((fn: (s: Scheme) => Scheme) => setHistory((h) => (h ? commit(h, fn(h.present)) : h)), []);

  const edit: SchemeEditApi | null = useMemo(() => {
    if (!editing || !scheme) return null;
    return {
      set: (path, value) => change((s) => setAt(s, path, value)),
      insert: (path, item) => change((s) => insertAt(s, path, item)),
      remove: (path) => change((s) => removeAt(s, path)),
      move: (i, delta) => change((s) => moveSection(s, i, delta)),
      tone: (i, tone) => change((s) => setTone(s, i, tone)),
      refine: async (i, mode) => {
        setRefining(i);
        setNotice("");
        try {
          const r = await callDream<{ section: SchemeSection }>("scheme_refine", { scheme_id: id, section_index: i, mode });
          change((s) => {
            const next = structuredClone(s);
            next.sections[i] = r.section;
            return next;
          });
          setNotice(mode === "ampliar" ? "Tarjeta ampliada con tus apuntes. Puedes deshacerlo." : "Tarjeta simplificada. Puedes deshacerlo.");
        } catch (e) {
          setNotice(errorMessage(e));
        } finally {
          setRefining(null);
        }
      },
      refining,
      sections: scheme.sections.length,
    };
  }, [editing, scheme, change, id, refining]);

  // Deshacer/rehacer con el teclado mientras se edita (fuera de un texto en edición).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      setHistory((h) => (h ? (e.shiftKey ? redo(h) : undo(h)) : h));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  async function run(label: string, task: () => Promise<void> | void) {
    setBusy(label);
    setNotice("");
    try {
      await task();
    } catch (e) {
      // Los fallos del navegador al dibujar llegan en inglés: mensaje propio.
      setNotice(label === "test" ? errorMessage(e) : "No se pudo preparar la descarga en este navegador. Prueba con «PDF» o «Página web».");
    } finally {
      setBusy("");
    }
  }
  const node = () => article.current?.querySelector("article") as HTMLElement;

  if (loading)
    return (
      <div className="boot">
        <DreamActivity state="thinking" label="Abriendo el esquema" />
      </div>
    );
  if (!scheme)
    return (
      <div className="boot">
        <div className="status-page">
          <h1>No pudimos abrir este esquema</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="button-row">
            <button className="primary press" onClick={() => setRetry((s) => s + 1)}>
              Reintentar
            </button>
            <Link className="secondary press" href="/chat">
              Volver al chat
            </Link>
          </div>
        </div>
      </div>
    );
  const name = scheme.title || title;
  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <Link className="secondary press" href="/chat">
          <ArrowLeft size={18} aria-hidden="true" /> Volver
        </Link>
        <div className={styles.actions}>
          {editing ? (
            <>
              <button className="secondary press" onClick={() => setHistory((h) => (h ? undo(h) : h))} disabled={!history?.past.length} aria-label="Deshacer">
                <Undo2 size={18} aria-hidden="true" />
              </button>
              <button className="secondary press" onClick={() => setHistory((h) => (h ? redo(h) : h))} disabled={!history?.future.length} aria-label="Rehacer">
                <Redo2 size={18} aria-hidden="true" />
              </button>
              <button className="primary press" onClick={() => setEditing(false)}>
                <Check size={18} aria-hidden="true" /> Listo
              </button>
            </>
          ) : (
            <>
              <button className="secondary press" onClick={() => setEditing(true)}>
                <Pencil size={18} aria-hidden="true" /> Editar
              </button>
              <details className={styles.menu}>
                <summary className="secondary press">
                  <Download size={18} aria-hidden="true" /> {busy ? "Preparando…" : "Descargar"}
                </summary>
                <div className={styles.menuList} role="menu">
                  <button role="menuitem" onClick={() => run("png", () => exportPng(node(), name))}>Imagen (PNG)</button>
                  <button role="menuitem" onClick={() => printPdf("portrait")}>PDF vertical (A4)</button>
                  <button role="menuitem" onClick={() => printPdf("landscape")}>PDF apaisado (A4)</button>
                  <button role="menuitem" onClick={() => run("html", () => exportHtml(node(), name))}>Página web (HTML)</button>
                  <button role="menuitem" onClick={() => run("svg", () => exportSvg(node(), name))}>Vectorial (SVG)</button>
                  <button role="menuitem" onClick={() => download(new Blob([toMarkdown(scheme)], { type: "text/markdown" }), fileNameFor(name, "md"))}>
                    Texto (Markdown)
                  </button>
                </div>
              </details>
              <button
                className="secondary press"
                disabled={busy === "test"}
                onClick={() =>
                  run("test", async () => {
                    const r = await callDream<{ test: { id: string } }>("test_generate", {
                      context: `Test de repaso del esquema «${name}». Pregunta solo por lo que dice este esquema:\n\n${toMarkdown(scheme)}`,
                      mode: "practice",
                      question_count: 5,
                    });
                    router.push(`/tests/${r.test.id}`);
                  })
                }
              >
                <ListChecks size={18} aria-hidden="true" /> {busy === "test" ? "Preparando el test…" : "Test de repaso"}
              </button>
            </>
          )}
        </div>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {notice || (save === "saving" ? "Guardando…" : save === "saved" ? "Cambios guardados" : save === "error" ? "No se ha guardado. Revisa la conexión." : editing ? "Toca cualquier texto para cambiarlo. **Así** es negrita." : "")}
      </p>
      <div className="esquema-print" ref={article}>
        <EsquemaView scheme={scheme} edit={edit} />
      </div>
    </main>
  );
}
