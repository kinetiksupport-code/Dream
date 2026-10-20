"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useConversations } from "./shell";
import { ChevronIcon, MoreIcon, SearchIcon } from "./icons";
import { groupByDay, rowMeta } from "@/lib/history";
import { displayTitle } from "@/lib/conversation-title";
import type { Conversation } from "@/lib/types";

/** Time the row takes to fade before it leaves the list (--dur-press). */
const LEAVE_MS = 160;

/**
 * Design: "Historial" (Claude Design Historial.dc.html). Search, groups Hoy …
 * Más antiguas, rows with title and a second line, «···» menu on hover/focus
 * (always visible on touch), delete with undo through the shell's toast.
 */
export function Recents() {
  const { items, loaded, onRename, onDelete } = useConversations();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const q = query.trim().toLocaleLowerCase("es");
  // Search what the list shows (so «Conversación del 3 de octubre» matches).
  const filtered = q
    ? items.filter((c) =>
        displayTitle(c, now).toLocaleLowerCase("es").includes(q),
      )
    : items;
  const groups = groupByDay(filtered, now);

  function remove(c: Conversation) {
    setLeaving(c.id);
    // Fade (opacity + a small scale), then the row leaves the list at once:
    // nothing animates height (emil-design-eng › Only animate transform and
    // opacity). Reduced motion keeps only the fade.
    window.setTimeout(() => {
      onDelete(c);
      setLeaving(null);
    }, LEAVE_MS);
  }

  return (
    <div className="page page-narrow history">
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
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby="history-count"
        />
      </form>
      <p id="history-count" className="history-count" role="status">
        {q && loaded
          ? filtered.length === 1
            ? "1 conversación"
            : `${filtered.length} conversaciones`
          : ""}
      </p>
      {!loaded ? (
        <HistorySkeleton />
      ) : groups.length ? (
        groups.map((group) => (
          <section
            className="list-section history-group"
            key={group.label}
            aria-labelledby={`history-${group.label}`}
          >
            <h2 className="section-label" id={`history-${group.label}`}>
              {group.label}
            </h2>
            <ul className="row-list">
              {group.items.map((c) => {
                const title = displayTitle(c, now);
                return (
                  <li
                    className="history-row"
                    key={c.id}
                    data-leaving={leaving === c.id || undefined}
                    data-menu={menu === c.id || undefined}
                  >
                    <Link className="row-link press" href={`/chat?c=${c.id}`}>
                      <span className="row-text">
                        <strong>{title}</strong>
                        <small className="num">
                          {rowMeta(c.updated_at, now)}
                        </small>
                      </span>
                      <span className="history-chevron" aria-hidden="true">
                        <ChevronIcon />
                      </span>
                    </Link>
                    <RowMenu
                      title={title}
                      open={menu === c.id}
                      onOpenChange={(open) => setMenu(open ? c.id : null)}
                      onRename={() => onRename(c)}
                      onDelete={() => remove(c)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : q ? (
        <div className="empty-state history-empty">
          <h2>No hay conversaciones con «{query.trim()}»</h2>
          <p>Prueba con otra palabra o borra la búsqueda.</p>
          <button
            type="button"
            className="secondary press"
            onClick={() => {
              setQuery("");
              document.getElementById("history-search")?.focus();
            }}
          >
            Borrar búsqueda
          </button>
        </div>
      ) : (
        <div className="empty-state history-empty">
          <EmptyIllustration />
          <h2>Aún no hay conversaciones</h2>
          <p>Cuando hables con Dream, tus conversaciones aparecerán aquí.</p>
          <Link className="primary press" href="/chat">
            Empezar una conversación
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * «···» menu. Opens from its button (transform-origin), arrow keys move
 * between items, Escape and Tab close it and focus goes back to the button.
 */
function RowMenu({
  title,
  open,
  onOpenChange,
  onRename,
  onDelete,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Open upwards when there is no room below (tab bar on phones).
    const rect = trigger.current?.getBoundingClientRect();
    const tabbar = document.querySelector(".tabbar")?.getBoundingClientRect();
    const bottom = tabbar && tabbar.height ? tabbar.top : window.innerHeight;
    setUp(!!rect && bottom - rect.bottom < 140);
    if (focusFirst.current)
      list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    focusFirst.current = false;
    function outside(e: PointerEvent) {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t))
        onOpenChange(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);

  function close() {
    trigger.current?.focus();
    onOpenChange(false);
  }
  function choose(run: () => void) {
    // Focus the button first so the rename dialog gives focus back to it.
    close();
    run();
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const all = [
      ...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []),
    ];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      all[(i + step + all.length) % all.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      all[e.key === "Home" ? 0 : all.length - 1]?.focus();
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button history-more press"
        aria-label={`Opciones de ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (
            !open &&
            (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
          ) {
            focusFirst.current = true;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onOpenChange(true);
            }
          }
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          ref={list}
          className="history-menu"
          role="menu"
          aria-label={`Opciones de ${title}`}
          data-side={up ? "top" : "bottom"}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => choose(onRename)}
          >
            <Pencil size={18} aria-hidden="true" />
            Renombrar
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="danger"
            onClick={() => choose(onDelete)}
          >
            <Trash2 size={18} aria-hidden="true" />
            Borrar
          </button>
        </div>
      )}
    </>
  );
}

function HistorySkeleton() {
  return (
    <div className="history-skeleton" role="status" aria-label="Cargando">
      <span className="history-skeleton-label" />
      {[0, 1, 2, 3].map((i) => (
        <span className="history-skeleton-row" key={i}>
          <span />
          <span />
        </span>
      ))}
    </div>
  );
}

/** Two speech bubbles and a clock hand: tokens only, decorative. */
function EmptyIllustration() {
  return (
    <svg
      className="history-illustration"
      width="120"
      height="88"
      viewBox="0 0 120 88"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="8"
        y="10"
        width="70"
        height="44"
        rx="14"
        fill="var(--bg)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <path d="M22 54v12l12-12" fill="var(--bg)" />
      <path
        d="M22 53v13l13-12"
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="20" y="24" width="40" height="5" rx="2.5" fill="var(--border)" />
      <rect x="20" y="35" width="26" height="5" rx="2.5" fill="var(--border)" />
      <rect
        x="50"
        y="34"
        width="62"
        height="40"
        rx="14"
        fill="var(--primary)"
      />
      <circle
        cx="81"
        cy="54"
        r="11"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="2"
      />
      <path
        d="M81 48v6l4 3"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="104" cy="30" r="5" fill="var(--accent)" />
    </svg>
  );
}
