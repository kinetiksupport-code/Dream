"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Sun, Moon, Monitor, Info } from "lucide-react";
import { PrivacySettings } from "@/components/observability";
import { Modal } from "@/components/modal";
import { Toast } from "@/components/toast";
import { InstallDream } from "@/components/install-dream";
import { HelpSupport } from "@/components/help-support";
import { UsageLimits } from "@/components/usage-limits";
import { useDream } from "@/components/providers";
import { Sticker } from "@/components/sticker";
import { useConversations } from "@/components/shell";
import { callDream, errorMessage } from "@/lib/dream-api";
import { accountIdentity } from "@/lib/account";
import { useOnline } from "@/lib/use-online";
import { applyEasyReading, crossFade, readEasyReading } from "@/lib/reading";
import styles from "./settings.module.css";

const CONTACT =
  "mailto:hellodream@edudream.es?subject=Eliminar%20mi%20cuenta%20de%20Dream";
/** Exit fade of dialogs and toasts (globals.css "Ajustes"): faster than entry. */
const EXIT_MS = 120;
/** A confirmation toast stays this long; it also has a close button. */
const TOAST_MS = 6000;

type Theme = "light" | "dark" | "system";
type Dialog = "history" | "account";

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

export default function Settings() {
  const { session, profile, theme, setTheme, logout } = useDream();
  const { items, loaded, refresh } = useConversations();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [toast, setToast] = useState("");
  const [toastLeaving, setToastLeaving] = useState(false);
  const [easyReading, setEasyReading] = useState(false);
  const timers = useRef<number[]>([]);
  const identity = accountIdentity(session?.user, profile);

  // The theme pill only animates after the saved theme has been applied, so
  // it never slides on page load.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  useEffect(() => {
    setEasyReading(readEasyReading());
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  function openDialog(next: Dialog) {
    setError("");
    setConfirmText("");
    setLeaving(false);
    setDialog(next);
  }
  /** Fades the dialog out, then unmounts it; Modal returns focus to the opener. */
  function closeDialog() {
    if (leaving) return;
    setLeaving(true);
    later(() => {
      setDialog(null);
      setLeaving(false);
    }, EXIT_MS);
  }
  function showToast(message: string) {
    setToastLeaving(false);
    setToast(message);
    later(hideToast, TOAST_MS);
  }
  function hideToast() {
    setToastLeaving(true);
    later(() => {
      setToast("");
      setToastLeaving(false);
    }, EXIT_MS);
  }

  function chooseTheme(next: Theme) {
    if (next === theme) return;
    crossFade(() => {
      // Paint the new colours inside the transition; Providers then stores
      // the choice and keeps following the system when "Sistema" is chosen.
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme =
        next === "system" ? (dark ? "dark" : "light") : next;
      flushSync(() => setTheme(next));
    });
  }
  function toggleEasyReading() {
    // No cross-fade here: the switch's own thumb movement is the feedback.
    const next = !easyReading;
    applyEasyReading(next);
    setEasyReading(next);
  }

  async function deleteAccount() {
    if (busy || confirmText.trim() !== "ELIMINAR") return;
    setBusy(true);
    setError("");
    try {
      await callDream("account_delete", { confirm: "ELIMINAR" });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      return;
    }
    // The user no longer exists: end the local session and leave.
    await logout().catch(() => window.location.assign("/login"));
  }
  async function clearHistory() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await callDream("conversations_delete_all");
      await refresh();
      closeDialog();
      showToast("Historial borrado.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setError("");
    try {
      await logout();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Why a privacy action can't run right now (apple-design feedback.md ›
  // "Show people when a command can't be carried out and help them understand
  // why"). The buttons stay focusable (aria-disabled) so the reason is read.
  const historyBlocked = !online
    ? "offline"
    : loaded && items.length === 0
      ? "empty"
      : null;
  const accountBlocked = !online;

  return (
    <div className={`page page-settings ${styles.page}`}>
      <h1 className={`hero-title ${styles.title}`}>
        <span className="marker marker-draw">Ajustes</span>
      </h1>

      <section className="group" aria-labelledby="profile-title">
        <h2 className="section-title" id="profile-title">
          Perfil
        </h2>
        <div className={styles.profile}>
          {/* Decorative: the name and email are right next to it. */}
          <span aria-hidden="true">
            <Sticker shape="round" tone="yellow" className={styles.avatar}>
              {(identity.name || identity.email || "·").trim().charAt(0)}
            </Sticker>
          </span>
          <dl className="group-list">
            <div className="group-row">
              <dt>Nombre</dt>
              <dd className="value">
                {identity.name || "Sin nombre en tu cuenta"}
              </dd>
            </div>
            <div className="group-row">
              <dt>Correo</dt>
              <dd className="value">{identity.email}</dd>
            </div>
          </dl>
        </div>
        <p className="page-intro">
          Tu nombre y tu correo vienen de tu cuenta de Google.
        </p>
      </section>

      <section className="group" aria-labelledby="theme-title">
        <h2 className="section-title" id="theme-title">
          Apariencia
        </h2>
        <div
          className="segmented segmented-theme"
          role="group"
          aria-labelledby="theme-title"
          data-settled={settled || undefined}
        >
          {/* The pill slides under the chosen option (transform only). */}
          <span
            className="segmented-indicator"
            aria-hidden="true"
            style={
              {
                "--segment": THEMES.findIndex((t) => t.value === theme),
              } as CSSProperties
            }
          />
          {THEMES.map((t) => (
            <button
              type="button"
              className={`press ${styles.themeOption} ${styles[t.value]}`}
              aria-pressed={theme === t.value}
              key={t.value}
              onClick={() => chooseTheme(t.value)}
            >
              <t.icon size={18} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="group-list">
          <div className="group-row">
            <span className="row-text" id="reading-label">
              <strong>Lectura fácil</strong>
              <small id="reading-hint">
                Letra Lexend, con más espacio entre líneas. Se guarda solo en
                este dispositivo.
              </small>
            </span>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={easyReading}
              aria-labelledby="reading-label"
              onClick={toggleEasyReading}
            />
          </div>
        </div>
      </section>

      <UsageLimits />

      <section className="group" aria-labelledby="privacy-title">
        <h2 className="section-title" id="privacy-title">
          Privacidad
        </h2>
        <p className="page-intro">
          Tus apuntes y conversaciones son solo tuyos.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="secondary press"
            aria-disabled={historyBlocked ? true : undefined}
            aria-describedby={historyBlocked ? "privacy-why" : undefined}
            onClick={() => !historyBlocked && openDialog("history")}
          >
            Borrar historial
          </button>
          <button
            type="button"
            className="danger-outline press"
            aria-disabled={accountBlocked || undefined}
            aria-describedby={accountBlocked ? "privacy-why" : undefined}
            onClick={() => !accountBlocked && openDialog("account")}
          >
            Eliminar mi cuenta
          </button>
        </div>
        {(historyBlocked || accountBlocked) && (
          <p className="settings-why" id="privacy-why">
            <Info size={18} aria-hidden="true" />
            {historyBlocked === "offline"
              ? "Sin conexión. Podrás borrar el historial o eliminar tu cuenta cuando vuelvas a tener internet."
              : "No tienes conversaciones guardadas. No hay historial que borrar."}
          </p>
        )}
      </section>

      <PrivacySettings />

      <InstallDream />

      <HelpSupport />

      <section className="group" aria-labelledby="account-title">
        <h2 className="section-title" id="account-title">
          Cuenta
        </h2>
        <div className="button-row">
          <button
            type="button"
            className="secondary press"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </section>

      {error && !dialog && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="toast-position settings-toast" aria-live="polite">
        {toast && (
          <div className="toast-shell" data-leaving={toastLeaving || undefined}>
            <Toast message={toast} onClose={hideToast} />
          </div>
        )}
      </div>

      {dialog === "history" && (
        <Modal
          variant="alert"
          leaving={leaving}
          labelledBy="delete-title"
          describedBy="delete-text"
          onClose={closeDialog}
        >
          <h2 id="delete-title">¿Borrar todo el historial?</h2>
          <p id="delete-text">
            Se eliminarán todas tus conversaciones. Esta acción no se puede
            deshacer.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary press"
              autoFocus
              onClick={closeDialog}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary danger-button press"
              disabled={busy}
              onClick={() => void clearHistory()}
            >
              {busy ? "Borrando…" : "Borrar historial"}
            </button>
          </div>
        </Modal>
      )}
      {dialog === "account" && (
        <Modal
          variant="alert"
          leaving={leaving}
          labelledBy="account-delete-title"
          describedBy="account-delete-text"
          onClose={closeDialog}
        >
          <h2 id="account-delete-title">¿Eliminar tu cuenta?</h2>
          <p id="account-delete-text">
            Se borrarán para siempre tu perfil, tus conversaciones, tus apuntes,
            tus exámenes y tus tests. No se puede deshacer.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <label className="field">
              <span>Escribe ELIMINAR para confirmar</span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}{" "}
                <a className="text-link" href={CONTACT}>
                  Escríbenos
                </a>
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary press"
                onClick={closeDialog}
              >
                Cancelar
              </button>
              <button
                className="primary danger-button press"
                disabled={busy || confirmText.trim() !== "ELIMINAR"}
              >
                {busy ? "Eliminando…" : "Eliminar cuenta"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
