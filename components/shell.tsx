"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Home,
  History,
  ChartNoAxesColumn,
  ListChecks,
  CalendarDays,
  SquarePen,
  ChevronRight,
  Settings2,
  Menu,
  MoreHorizontal,
  LogOut,
  X,
} from "lucide-react";
import { Modal } from "./modal";
import { useDream } from "./providers";
import { DreamMark, DreamActivity } from "./dream-mark";
import { callDream, errorMessage } from "@/lib/dream-api";
import { Toast } from "./toast";
import type { Conversation } from "@/lib/types";
interface ConversationsContext {
  items: Conversation[];
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
export function Shell({ children }: { children: ReactNode }) {
  const { ready, session, profile, bootError, refreshProfile, logout } =
    useDream();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [items, setItems] = useState<Conversation[]>([]);
  const [open, setOpen] = useState(false);
  const [workspaceEmpty, setWorkspaceEmpty] = useState(!search.get("c"));
  const [pageTitle, setPageTitle] = useState<string | null>(null);
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
    }
  }, []);
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);
  const profileEmail = profile?.email;
  useEffect(() => {
    if (profileEmail) void refresh();
  }, [profileEmail, refresh]);
  useEffect(() => setOpen(false), [pathname, search]);
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
            <p className="error" role="alert">
              {bootError}
            </p>
            <button className="primary" onClick={() => void refreshProfile()}>
              Reintentar
            </button>
            <button
              className="text-button"
              onClick={() =>
                void logout().catch((e) => setError(errorMessage(e)))
              }
            >
              Volver a entrar
            </button>
          </div>
        ) : (
          <DreamActivity state="thinking" />
        )}
      </main>
    );
  const view = search.get("view");
  const currentConversation = items.find((c) => c.id === search.get("c"));
  const home =
    pathname === "/chat" && !view && (!search.get("c") || workspaceEmpty);
  const examArea = pathname.startsWith("/exams");
  const brandedTopbar = home || examArea;
  const nav = [
    { label: "Inicio", href: "/chat", icon: Home, active: home },
    {
      label: "Recientes",
      href: "/chat?view=recent",
      icon: History,
      active: view === "recent",
    },
    {
      label: "Progreso",
      href: "/progress",
      icon: ChartNoAxesColumn,
      active: pathname === "/progress",
    },
    {
      label: "Tests",
      href: "/chat?view=tests",
      icon: ListChecks,
      active: view === "tests",
    },
    { label: "Exámenes", href: "/exams", icon: CalendarDays, active: examArea },
    {
      label: "Ajustes",
      href: "/settings",
      icon: Settings2,
      active: pathname === "/settings",
    },
  ];
  const account = (
    <Link className="account-link" href="/settings">
      <span className="avatar">
        {(profile.display_name || profile.email || "D")
          .slice(0, 1)
          .toUpperCase()}
      </span>
      <span>
        <strong>{profile.display_name?.split(" ")[0] || "Mi cuenta"}</strong>
        <small>Tu espacio de aprendizaje</small>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
  return (
    <Context.Provider
      value={{
        items,
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
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>
        <aside className="sidebar">
          <Link className="wordmark" href="/chat">
            <DreamMark size={28} />
            dream
          </Link>
          <Link
            className="new-conversation primary"
            href={`/chat?new=${Date.now()}`}
          >
            Nueva conversación
          </Link>
          <nav className="primary-nav" aria-label="Navegación principal">
            {nav.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                aria-current={n.active ? "page" : undefined}
              >
                <n.icon size={20} />
                {n.label}
                {n.label === "Recientes" && items.length > 0 && (
                  <small>{items.length}</small>
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-account">
            {account}
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={() =>
                void logout().catch((e) => setError(errorMessage(e)))
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header
            className={`workspace-header ${examArea ? "exam-topbar" : ""} ${brandedTopbar ? "home-topbar" : ""}`}
          >
            <div className="topbar-left">
              {brandedTopbar ? (
                <>
                  <Link className="wordmark mobile-brand" href="/chat">
                    <DreamMark size={24} />
                    dream
                  </Link>
                  <span className="desktop-header-label">
                    {examArea
                      ? "EXÁMENES / TU PREPARACIÓN"
                      : "TU ESPACIO PARA ENTENDER"}
                  </span>
                </>
              ) : (
                <>
                  <Link
                    className="icon-button back-button"
                    href="/chat"
                    aria-label="Volver al inicio"
                  >
                    <ChevronRight size={20} />
                  </Link>
                  <strong>
                    {pathname === "/settings"
                      ? "Ajustes"
                      : pathname === "/progress"
                        ? "Progreso"
                        : view === "recent"
                          ? "Recientes"
                          : view === "tests"
                            ? "Tests"
                            : pathname.startsWith("/tests")
                              ? pageTitle || "Practicar"
                              : currentConversation?.title || "Mi Dream"}
                  </strong>
                </>
              )}
            </div>
            <div className="topbar-controls">
              {brandedTopbar && (
                <Link
                  className="icon-button"
                  href={`/chat?new=${Date.now()}`}
                  aria-label="Nueva conversación"
                >
                  <SquarePen size={20} />
                </Link>
              )}
              <button
                className="icon-button mobile-menu"
                aria-label="Abrir navegación"
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                {brandedTopbar ? (
                  <Menu size={20} />
                ) : (
                  <MoreHorizontal size={20} />
                )}
              </button>
            </div>
          </header>
          <main id="main" className="workspace-main">
            {children}
          </main>
        </div>
        {open && (
          <Modal
            labelledBy="bottom-sheet-title"
            onClose={() => setOpen(false)}
            variant="sheet"
          >
            <div className="sheet-handle" />
            <div className="sheet-brand">
              <Link id="bottom-sheet-title" className="wordmark" href="/chat">
                <DreamMark size={28} />
                dream
              </Link>
              <button
                className="icon-button"
                aria-label="Cerrar navegación"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <Link
              className="primary sheet-new"
              href={`/chat?new=${Date.now()}`}
              onClick={() => setOpen(false)}
            >
              Nueva conversación <Plus size={20} />
            </Link>
            <nav className="sheet-nav" aria-label="Navegación móvil">
              {nav.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <n.icon size={20} />
                  {n.label}
                  {n.label === "Recientes" && items.length > 0 && (
                    <small>{items.length}</small>
                  )}
                </Link>
              ))}
            </nav>
            <div className="sheet-account">{account}</div>
          </Modal>
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
              {editing ? "Un nombre para esta idea" : "¿Eliminar conversación?"}
            </h2>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void rename();
                }}
              >
                <input
                  autoFocus
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Nombre de conversación"
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="text-button"
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
                    className="text-button"
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
