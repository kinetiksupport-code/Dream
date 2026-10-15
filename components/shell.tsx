"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
  type ComponentType,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modal } from "./modal";
import { useDream } from "./providers";
import { Orb } from "./orb";
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
interface ConversationsContext {
  items: Conversation[];
  loaded: boolean;
  refresh: () => Promise<void>;
  add: (c: Conversation) => void;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
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
  const [, setPageTitle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
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
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await callDream("conversation_delete", { conversation_id: deleting.id });
      setItems((s) => s.filter((c) => c.id !== deleting.id));
      if (search.get("c") === deleting.id) router.push("/chat");
      setDeleting(null);
      setToast("Conversación eliminada.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
              <button
                className="primary"
                onClick={() => void refreshProfile()}
              >
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
  const currentConversation = items.find((c) => c.id === conversationId);
  const chatHref = items[0] ? `/chat?c=${items[0].id}` : "/chat";
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
      <n.icon size={className === "tab" ? 24 : 22} />
      <span className="nav-label">{n.label}</span>
    </Link>
  );
  return (
    <Context.Provider
      value={{
        items,
        loaded,
        refresh,
        add: (c) => setItems((s) => [c, ...s.filter((x) => x.id !== c.id)]),
        onRename: (c) => {
          setEditing(c);
          setTitle(c.title);
        },
        onDelete: setDeleting,
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
              <h1>{currentConversation?.title || "Conversación"}</h1>
              <span className="topbar-spacer" aria-hidden="true" />
            </header>
          )}
          <main id="main" className="workspace-main" tabIndex={-1}>
            {children}
          </main>
        </div>
        {!focus && (
          <nav className="tabbar" aria-label="Principal">
            {tabs.map((n) =>
              link(
                n,
                n.key === "more" ? moreActive : current === n.key,
                "tab press",
              ),
            )}
          </nav>
        )}
        {(editing || deleting) && (
          <Modal
            labelledBy="dialog-title"
            onClose={() => {
              setEditing(null);
              setDeleting(null);
            }}
          >
            <h2 id="dialog-title">
              {editing ? "Cambiar nombre" : "¿Eliminar conversación?"}
            </h2>
            {editing ? (
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
            ) : (
              <>
                <p>
                  Se eliminará de tu Dream. Esta acción no se puede deshacer.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    autoFocus
                    onClick={() => setDeleting(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="primary danger-button"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Modal>
        )}
        {toast && (
          <div className="toast-position">
            <Toast message={toast} onClose={() => setToast("")} />
          </div>
        )}
        {error && !editing && !deleting && (
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
