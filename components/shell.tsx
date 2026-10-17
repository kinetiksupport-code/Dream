"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
  type ComponentType,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modal } from "./modal";
import { useDream } from "./providers";
import { Orb } from "./orb";
import { NavIndicator } from "./nav-indicator";
import {
  BackIcon,
  ChatIcon,
  ExamsIcon,
  HistoryIcon,
  HomeIcon,
  MoreIcon,
  NotesIcon,
  SettingsIcon,
  TasksIcon,
} from "./icons";
import { callDream, errorMessage } from "@/lib/dream-api";
import { Toast } from "./toast";
import type { Conversation } from "@/lib/types";
import { activeNav, isFocusRoute, type NavKey } from "@/lib/navigation";
import { isDefaultTitle, titleFromPrompt } from "@/lib/conversation-title";
/** Time to undo a deleted conversation before it is really deleted. */
export const UNDO_MS = 5000;
interface ConversationsContext {
  items: Conversation[];
  loaded: boolean;
  refresh: () => Promise<void>;
  add: (c: Conversation) => void;
  onRename: (c: Conversation) => void;
  /** Hides the conversation and deletes it after UNDO_MS unless undone. */
  onDelete: (c: Conversation) => void;
  /** First message of a «Nueva conversación»: name it from the question. */
  autoTitle: (id: string, prompt: string) => void;
  setWorkspaceEmpty: (empty: boolean) => void;
  setPageTitle: (title: string | null) => void;
}
const Context = createContext<ConversationsContext | null>(null);
export function useConversations() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Missing conversations");
  return ctx;
}

interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { ready, session, profile, bootError, refreshProfile, logout } =
    useDream();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [workspaceEmpty, setWorkspaceEmpty] = useState(!search.get("c"));
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  // Deleted but still undoable (hidden from the list until the toast ends).
  const [pending, setPending] = useState<Conversation | null>(null);
  const [deleteError, setDeleteError] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const refresh = useCallback(async () => {
    try {
      const r = await callDream<{ items: Conversation[] }>("conversations");
      setItems(r.items ?? []);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);
  const profileEmail = profile?.email;
  useEffect(() => {
    if (profileEmail) void refresh();
  }, [profileEmail, refresh]);
  async function rename() {
    if (!editing || !title.trim() || busy) return;
    setBusy(true);
    try {
      await callDream("conversation_rename", {
        conversation_id: editing.id,
        title,
      });
      setItems((s) =>
        s.map((c) => (c.id === editing.id ? { ...c, title } : c)),
      );
      setEditing(null);
      setToast("Nombre actualizado.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  // Delete with undo: the row disappears now, the API call waits for the
  // toast to run out (apple-design undo-and-redo.md, feedback.md).
  const commitDelete = useCallback(
    async (c: Conversation) => {
      setPending((p) => (p?.id === c.id ? null : p));
      setDeleteError(null);
      setItems((s) => s.filter((x) => x.id !== c.id));
      try {
        await callDream("conversation_delete", { conversation_id: c.id });
        if (search.get("c") === c.id) router.push("/chat");
      } catch {
        // Put it back where it was and offer to try again.
        setItems((s) =>
          s.some((x) => x.id === c.id)
            ? s
            : [...s, c].sort((a, b) =>
                b.updated_at.localeCompare(a.updated_at),
              ),
        );
        setDeleteError(c);
      }
    },
    [router, search],
  );
  const scheduleDelete = useCallback(
    (c: Conversation) => {
      const previous = pendingRef.current;
      if (previous && previous.id !== c.id) void commitDelete(previous);
      setDeleteError(null);
      setToast("");
      setPending(c);
    },
    [commitDelete],
  );
  const undoDelete = useCallback(() => setPending(null), []);
  useEffect(() => {
    if (!pending) return;
    // Ctrl/Cmd+Z undoes too, unless a text field is using it.
    function key(e: KeyboardEvent) {
      if (
        !(e.metaKey || e.ctrlKey) ||
        e.shiftKey ||
        e.key.toLowerCase() !== "z"
      )
        return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      setPending(null);
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pending]);
  const autoTitle = useCallback((id: string, prompt: string) => {
    const current = itemsRef.current.find((c) => c.id === id);
    if (current && !isDefaultTitle(current.title)) return;
    const title = titleFromPrompt(prompt, new Date());
    setItems((s) => s.map((c) => (c.id === id ? { ...c, title } : c)));
    callDream("conversation_rename", { conversation_id: id, title }).catch(() =>
      setItems((s) =>
        s.map((c) =>
          c.id === id && c.title === title
            ? { ...c, title: current?.title ?? "Nueva conversación" }
            : c,
        ),
      ),
    );
  }, []);
  if (!ready || !session || !profile)
    return (
      <main className="boot">
        {bootError ? (
          <div className="boot-error">
            <Orb size={56} />
            <h1>Dream necesita un momento</h1>
            <p className="error" role="alert">
              {bootError}
            </p>
            <div className="button-row">
              <button className="primary" onClick={() => void refreshProfile()}>
                Reintentar
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void logout().catch((e) => setError(errorMessage(e)))
                }
              >
                Volver a entrar
              </button>
            </div>
          </div>
        ) : (
          <div className="boot-spinner" role="status" aria-label="Cargando">
            <Orb size={48} pulsing />
          </div>
        )}
      </main>
    );
  const conversationId = search.get("c");
  const view = search.get("view");
  const current = activeNav(pathname, {
    c: conversationId && !workspaceEmpty ? conversationId : null,
    view,
  });
  const focus = isFocusRoute(pathname);
  const visible = pending ? items.filter((c) => c.id !== pending.id) : items;
  const currentConversation = items.find((c) => c.id === conversationId);
  const chatHref = visible[0] ? `/chat?c=${visible[0].id}` : "/chat";
  const nav: NavItem[] = [
    { key: "home", label: "Inicio", href: "/chat", icon: HomeIcon },
    { key: "chat", label: "Chat", href: chatHref, icon: ChatIcon },
    { key: "tasks", label: "Tareas", href: "/tasks", icon: TasksIcon },
    { key: "notes", label: "Apuntes", href: "/notes", icon: NotesIcon },
    { key: "exams", label: "Exámenes", href: "/exams", icon: ExamsIcon },
    {
      key: "history",
      label: "Historial",
      href: "/chat?view=recent",
      icon: HistoryIcon,
    },
  ];
  const settings: NavItem = {
    key: "settings",
    label: "Ajustes",
    href: "/settings",
    icon: SettingsIcon,
  };
  const tabs: NavItem[] = [
    nav[0],
    nav[1],
    nav[2],
    { key: "more", label: "Más", href: "/more", icon: MoreIcon },
  ];
  const moreActive =
    current === "more" ||
    current === "notes" ||
    current === "exams" ||
    current === "history" ||
    current === "settings";
  const showChatHeader =
    pathname === "/chat" && !view && !!conversationId && !workspaceEmpty;
  const link = (n: NavItem, active: boolean, className: string) => (
    <Link
      key={n.key}
      className={className}
      href={n.href}
      aria-current={active ? "page" : undefined}
      title={n.label}
    >
      <n.icon size={className.startsWith("tab") ? 24 : 22} />
      <span className="nav-label">{n.label}</span>
    </Link>
  );
  return (
    <Context.Provider
      value={{
        items: visible,
        loaded,
        refresh,
        add: (c) => setItems((s) => [c, ...s.filter((x) => x.id !== c.id)]),
        onRename: (c) => {
          setEditing(c);
          setTitle(c.title);
        },
        onDelete: scheduleDelete,
        autoTitle,
        setWorkspaceEmpty,
        setPageTitle,
      }}
    >
      <div className={`app-shell${focus ? " is-focus" : ""}`}>
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>
        {!focus && (
          <nav className="sidebar" aria-label="Principal">
            <NavIndicator activeKey={current} />
            <Link className="brand" href="/chat" title="Dream">
              <Orb size={32} />
              <span className="nav-label">Dream</span>
            </Link>
            <div className="sidebar-links">
              {nav.map((n) => link(n, current === n.key, "nav-link press"))}
            </div>
            {link(settings, current === "settings", "nav-link press")}
          </nav>
        )}
        <div className="workspace">
          {showChatHeader && (
            <header className="topbar">
              <Link
                className="icon-button back-button press"
                href="/chat"
                aria-label="Volver a Inicio"
              >
                <BackIcon />
              </Link>
              <h1>
                {currentConversation?.title ||
                  pageTitle ||
                  "Nueva conversación"}
              </h1>
              <span className="topbar-spacer" aria-hidden="true" />
            </header>
          )}
          <main id="main" className="workspace-main" tabIndex={-1}>
            {/* Short fade on route change (opacity only, 160 ms). */}
            <div className="route-view" key={pathname}>
              {children}
            </div>
          </main>
        </div>
        {!focus && (
          <nav className="tabbar" aria-label="Principal">
            <NavIndicator activeKey={moreActive ? "more" : current} />
            {tabs.map((n) =>
              link(
                n,
                n.key === "more" ? moreActive : current === n.key,
                "tab press",
              ),
            )}
          </nav>
        )}
        {editing && (
          <Modal labelledBy="dialog-title" onClose={() => setEditing(null)}>
            <h2 id="dialog-title">Cambiar nombre</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <label className="field">
                <span>Nombre de conversación</span>
                <input
                  autoFocus
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy || !title.trim()}>
                  Guardar
                </button>
              </div>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Modal>
        )}
        {pending ? (
          <div className="toast-position" key={pending.id}>
            <Toast
              message="Conversación borrada"
              action={{ label: "Deshacer", run: undoDelete }}
              duration={UNDO_MS}
              onExpire={() => void commitDelete(pending)}
            />
          </div>
        ) : deleteError ? (
          <div className="toast-position">
            <Toast
              message="No se pudo borrar la conversación."
              error
              onClose={() => setDeleteError(null)}
              action={{
                label: "Reintentar",
                run: () => void commitDelete(deleteError),
              }}
            />
          </div>
        ) : (
          toast && (
            <div className="toast-position">
              <Toast message={toast} onClose={() => setToast("")} />
            </div>
          )
        )}
        {error && !editing && (
          <div className="toast-position">
            <Toast
              message={error}
              error
              onClose={() => setError("")}
              action={{ label: "Reintentar", run: () => void refresh() }}
            />
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
