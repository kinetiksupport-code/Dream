"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, LayoutGrid, NotebookPen, Puzzle } from "lucide-react";
import { wordsLabel } from "@/lib/pasted-text";
import { callDream, errorMessage } from "@/lib/dream-api";
import { GAME_LABEL, type GameKind } from "@/lib/dream-games";
import { ChevronIcon } from "@/components/icons";
import { DreamActivity } from "@/components/dream-mark";

type Dream =
  | { type: "scheme"; id: string; title: string; subject: string; updated_at: string }
  | { type: "game"; id: string; title: string; kind: GameKind; best_score: number | null; total: number | null; updated_at: string }
  | { type: "doc"; id: string; conversation_id: string; title: string; words: number; updated_at: string }
  | { type: "notes"; id: string; title: string; pages: number; updated_at: string };
type Filter = "all" | "notes" | "scheme" | "game" | "doc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "notes", label: "Apuntes" },
  { key: "scheme", label: "Esquemas" },
  { key: "game", label: "Juegos" },
  { key: "doc", label: "Documentos" },
];

/** Sección «Dreams»: lo que Dream ha creado para el alumno, con filtro por tipo. */
export function DreamsList() {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    callDream<{ dreams: Dream[] }>("dreams_list", {}, controller.signal)
      .then((r) => setDreams(r.dreams))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [retry]);

  const shown = (dreams ?? []).filter((d) => filter === "all" || d.type === filter);
  return (
    <div className="page page-settings">
      <h1 className="title">Dreams</h1>
      <p className="page-intro muted">Apuntes, esquemas, juegos y documentos que Dream ha creado para ti. Pídelos en el chat: «pásame a limpio estos apuntes», «hazme un esquema» o «hazme un juego».</p>
      <div className="segmented" role="group" aria-label="Filtrar por tipo" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="press" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {error ? (
        <div className="empty-state">
          <p className="error" role="alert">
            {error}
          </p>
          <button className="secondary press" onClick={() => setRetry((s) => s + 1)}>
            Reintentar
          </button>
        </div>
      ) : !dreams ? (
        <DreamActivity state="thinking" label="Cargando tus Dreams" />
      ) : !shown.length ? (
        <div className="empty-state">
          <h2>{filter === "notes" ? "Aún no tienes apuntes pasados a limpio" : filter === "game" ? "Aún no tienes juegos" : filter === "scheme" ? "Aún no tienes esquemas" : filter === "doc" ? "Aún no tienes documentos" : "Aún no tienes Dreams"}</h2>
          <p className="muted">Sube tus apuntes en el chat y pide un esquema o un juego para practicar.</p>
          <Link className="primary press" href="/chat">
            Ir al chat
          </Link>
        </div>
      ) : (
        <ul className="group-list" aria-label="Tus Dreams">
          {shown.map((d) => (
            <li key={`${d.type}-${d.id}`}>
              <Link className="group-row group-link press" href={d.type === "notes" ? `/apuntes/${d.id}` : d.type === "scheme" ? `/esquemas/${d.id}` : d.type === "doc" ? `/chat?c=${d.conversation_id}` : `/juegos/${d.id}`}>
                {d.type === "notes" ? <NotebookPen size={22} aria-hidden="true" /> : d.type === "scheme" ? <LayoutGrid size={22} aria-hidden="true" /> : d.type === "doc" ? <FileText size={22} aria-hidden="true" /> : <Puzzle size={22} aria-hidden="true" />}
                <span className="row-text">
                  <strong style={{ display: "block", fontWeight: 600 }}>{d.title}</strong>
                  <small className="muted">
                    {d.type === "notes"
                      ? `Apuntes · ${d.pages} ${d.pages === 1 ? "página" : "páginas"}`
                      : d.type === "doc"
                      ? `Documento · ${wordsLabel(d.words)}`
                      : d.type === "scheme"
                      ? `Esquema${d.subject ? ` · ${d.subject}` : ""}`
                      : `Juego · ${GAME_LABEL[d.kind]}${d.best_score != null && d.total ? ` · mejor marca ${d.best_score}/${d.total}` : ""}`}
                  </small>
                </span>
                <ChevronIcon />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
