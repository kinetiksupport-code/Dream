"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Search,
  MessageSquare,
  MoreHorizontal,
  ListChecks,
} from "lucide-react";
import { useConversations } from "./shell";
export function Recents({ tests = false }: { tests?: boolean }) {
  const { items, onRename, onDelete } = useConversations();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const filtered = items.filter((c) =>
    c.title.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")),
  );
  return (
    <section className="personal-page recents-page">
      <p className="eyebrow">VUELVE A UNA BUENA PREGUNTA</p>
      <h1>
        {tests ? "Tus tests, en tus conversaciones." : "Lo que has explorado."}
      </h1>
      <label className="recents-search">
        <Search size={20} />
        <input
          type="search"
          aria-label="Buscar en tus conversaciones"
          placeholder="Buscar en tus conversaciones"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="recents-tabs">
        <Link
          aria-current={!tests ? "page" : undefined}
          href="/chat?view=recent"
        >
          Conversaciones
        </Link>
        <Link aria-current={tests ? "page" : undefined} href="/chat?view=tests">
          Tests
        </Link>
      </div>
      {tests && (
        <p className="page-intro">
          Abre la conversación donde preparaste tu test para continuar
          practicando.
        </p>
      )}
      <div className="recents-list">
        {filtered.length ? (
          filtered.map((c) => (
            <div className="conversation-row" key={c.id}>
              <Link href={`/chat?c=${c.id}`}>
                <span className="recent-icon">
                  {tests ? (
                    <ListChecks size={20} />
                  ) : (
                    <MessageSquare size={20} />
                  )}
                </span>
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {new Date(c.updated_at).toLocaleDateString("es", {
                      day: "numeric",
                      month: "long",
                    })}
                  </small>
                </span>
              </Link>
              <button
                className="icon-button conversation-menu"
                aria-label={`Opciones de ${c.title}`}
                aria-expanded={menu === c.id}
                onClick={() => setMenu(menu === c.id ? null : c.id)}
              >
                <MoreHorizontal size={20} />
              </button>
              {menu === c.id && (
                <div className="row-menu">
                  <button
                    onClick={() => {
                      onRename(c);
                      setMenu(null);
                    }}
                  >
                    Renombrar
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      onDelete(c);
                      setMenu(null);
                    }}
                  >
                    Eliminar
                  </button>
                  <button onClick={() => setMenu(null)}>Cerrar</button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="empty-state">
            {query
              ? "No hay conversaciones que coincidan."
              : "Tus buenas preguntas encontrarán su lugar aquí."}
          </p>
        )}
      </div>
    </section>
  );
}
