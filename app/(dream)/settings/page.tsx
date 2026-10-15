"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { PrivacySettings } from "@/components/observability";
import { Modal } from "@/components/modal";
import { InstallDream } from "@/components/install-dream";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { callDream, errorMessage } from "@/lib/dream-api";
import { accountIdentity } from "@/lib/account";

const CONTACT = "mailto:hellodream@edudream.es?subject=Eliminar%20mi%20cuenta%20de%20Dream";

export default function Settings() {
  const { session, profile, theme, setTheme, logout } = useDream();
  const { items, refresh } = useConversations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cleared, setCleared] = useState(false);
  const [confirm, setConfirm] = useState<"history" | "account" | null>(null);
  const identity = accountIdentity(session?.user, profile);
  async function clearHistory() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await callDream("conversations_delete_all");
      await refresh();
      setConfirm(null);
      setCleared(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page-settings">
      <h1 className="title">Ajustes</h1>

      <section className="group" aria-labelledby="profile-title">
        <h2 className="section-title" id="profile-title">
          Perfil
        </h2>
        <dl className="group-list">
          <div className="group-row">
            <dt>Nombre</dt>
            <dd className="value">{identity.name || "Sin nombre en tu cuenta"}</dd>
          </div>
          <div className="group-row">
            <dt>Correo</dt>
            <dd className="value">{identity.email}</dd>
          </div>
        </dl>
        <p className="page-intro">
          Tu nombre y tu correo vienen de tu cuenta de Google.
        </p>
      </section>

      <section className="group" aria-labelledby="theme-title">
        <h2 className="section-title" id="theme-title">
          Apariencia
        </h2>
        <div className="segmented" role="group" aria-labelledby="theme-title">
          {(
            [
              { value: "light", label: "Claro", icon: Sun },
              { value: "dark", label: "Oscuro", icon: Moon },
              { value: "system", label: "Sistema", icon: Monitor },
            ] as const
          ).map((t) => (
            <button
              className="press"
              aria-pressed={theme === t.value}
              key={t.value}
              onClick={() => setTheme(t.value)}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <InstallDream />

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
            onClick={() => {
              setCleared(false);
              setError("");
              setConfirm("history");
            }}
          >
            Borrar historial
          </button>
          <button
            type="button"
            className="danger-outline press"
            onClick={() => {
              setError("");
              setConfirm("account");
            }}
          >
            Eliminar mi cuenta
          </button>
        </div>
      </section>

      {cleared && (
        <p className="save-status" role="status">
          <Check size={16} />
          Historial borrado.{" "}
          {items.length === 0 && "Ya no tienes conversaciones guardadas."}
        </p>
      )}

      <PrivacySettings />

      <section className="group" aria-labelledby="account-title">
        <h2 className="section-title" id="account-title">
          Cuenta
        </h2>
        <div className="button-row">
          <button
            type="button"
            className="secondary press"
            onClick={() =>
              void logout().catch((e) => setError(errorMessage(e)))
            }
          >
            Cerrar sesión
          </button>
        </div>
      </section>

      {error && !confirm && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm === "history" && (
        <Modal labelledBy="delete-title" onClose={() => setConfirm(null)}>
          <h2 id="delete-title">¿Borrar todo el historial?</h2>
          <p>
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
              className="secondary press"
              autoFocus
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </button>
            <button
              className="primary danger-button press"
              disabled={busy}
              onClick={() => void clearHistory()}
            >
              {busy ? "Borrando…" : "Borrar historial"}
            </button>
          </div>
        </Modal>
      )}
      {confirm === "account" && (
        <Modal
          labelledBy="account-delete-title"
          onClose={() => setConfirm(null)}
        >
          <h2 id="account-delete-title">Eliminar tu cuenta</h2>
          <p>
            Todavía no se puede eliminar la cuenta desde la app. Escríbenos y
            borraremos tu perfil, tus conversaciones, tus apuntes y tus
            exámenes.
          </p>
          <div className="modal-actions">
            <button
              className="secondary press"
              autoFocus
              onClick={() => setConfirm(null)}
            >
              Cerrar
            </button>
            <a className="primary press" href={CONTACT}>
              Pedir que la borren
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
