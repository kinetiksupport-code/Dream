"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import type { Scheme } from "@/lib/esquema";
import { DreamActivity } from "@/components/dream-mark";
import { EsquemaView } from "./esquema-view";
import styles from "./esquema-page.module.css";

type Row = { id: string; title: string; content: Scheme };

/** Pantalla de un esquema guardado (docs/ESQUEMAS.md). Imprimir = guardar en PDF. */
export function EsquemaPage({ id }: { id: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    callDream<{ scheme: Row }>("scheme_get", { scheme_id: id }, controller.signal)
      .then((r) => setRow(r.scheme))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  if (loading)
    return (
      <div className="boot">
        <DreamActivity state="thinking" label="Abriendo el esquema" />
      </div>
    );
  if (!row)
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
  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <Link className="secondary press" href="/chat">
          <ArrowLeft size={18} aria-hidden="true" /> Volver
        </Link>
        <button className="secondary press" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" /> Imprimir o guardar PDF
        </button>
      </div>
      <div className="esquema-print">
        <EsquemaView scheme={row.content} />
      </div>
    </main>
  );
}
