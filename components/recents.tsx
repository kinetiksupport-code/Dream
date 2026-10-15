"use client";
import { useState } from "react";
import Link from "next/link";
import { useConversations } from "./shell";
import { ChevronIcon, MoreIcon, SearchIcon } from "./icons";
import { groupByDay } from "@/lib/history";

/** Design: "Historial". Conversations grouped by day, searchable. */
export function Recents() {
  const { items, loaded, onRename, onDelete } = useConversations();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const filtered = items.filter((c) =>
    c.title.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")),
  );
  const groups = groupByDay(filtered, new Date());
  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="title">Historial</h1>
      </header>
      <form
        role="search"
        className="search-field"
        onSubmit={(e) => e.preventDefault()}
      >
        <SearchIcon />
        <label className="visually-hidden" htmlFor="history-search">
          Buscar en el historial
        </label>
        <input
          id="history-search"
          type="search"
          placeholder="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      {!loaded ? (
        <div className="skeleton-list" role="status" aria-label="Cargando">
          <span />
          <span />
          <span />
        </div>
      ) : groups.length ? (
        groups.map((group) => (
          <section className="list-section" key={group.label}>
            <h2 className="section-label">{group.label}</h2>
            <ul className="row-list">
              {group.items.map((c) => (
                <li className="conversation-row" key={c.id}>
                  <Link className="row-link press" href={`/chat?c=${c.id}`}>
                    <span className="row-text">
                      <strong>{c.title}</strong>
                      <small>
                        {new Date(c.updated_at).toLocaleDateString("es", {
                          day: "numeric",
                          month: "long",
                        })}
                      </small>
                    </span>
                    <ChevronIcon />
                  </Link>
                  <button
                    className="icon-button conversation-menu press"
                    aria-label={`Opciones de ${c.title}`}
                    aria-expanded={menu === c.id}
                    onClick={() => setMenu(menu === c.id ? null : c.id)}
                  >
                    <MoreIcon />
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
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="empty-state">
          <h2>{query ? "Sin resultados" : "Aún no hay conversaciones"}</h2>
          <p>
            {query
              ? "No hay conversaciones que coincidan con tu búsqueda."
              : "Cuando hables con Dream, tus conversaciones aparecerán aquí."}
          </p>
          {!query && (
            <Link className="primary press" href="/chat">
              Empezar una conversación
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
