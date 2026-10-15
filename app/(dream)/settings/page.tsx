"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { PrivacySettings } from "@/components/observability";
import { Modal } from "@/components/modal";
import { InstallDream } from "@/components/install-dream";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { callDream, errorMessage } from "@/lib/dream-api";
import { accountActions } from "@/lib/account";
import type { DreamProfile, UserPreferences } from "@/lib/types";

const HELP = [
  {
    key: "pref_step_by_step",
    title: "Paso a paso",
    description: "Te guía con preguntas hasta que lo entiendas.",
  },
  {
    key: "pref_practice_suggestions",
    title: "Propuestas para practicar",
    description: "Sugiere ejercicios cuando ayudan a entender mejor.",
  },
  {
    key: "pref_calm_tone",
    title: "Un tono tranquilo",
    description: "Explicaciones cercanas, claras y sin prisa.",
  },
] as const;

export default function Settings() {
  const { profile, setProfile, theme, setTheme, logout } = useDream();
  const { refresh } = useConversations();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<"history" | "account" | null>(null);
  async function toggle(key: keyof UserPreferences) {
    if (!profile || saving) return;
    setSaving(key);
    setError("");
    setSaved(false);
    try {
      const r = await callDream<{ profile: DreamProfile }>(
        "preferences_update",
        { [key]: !profile[key] },
      );
      setProfile({
        ...profile,
        pref_step_by_step: r.profile.pref_step_by_step,
        pref_practice_suggestions: r.profile.pref_practice_suggestions,
        pref_calm_tone: r.profile.pref_calm_tone,
      });
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }
  async function clearHistory() {
    if (saving) return;
    setSaving("delete");
    setError("");
    try {
      await callDream("conversations_delete_all");
      await refresh();
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }
  async function deleteAccount() {
    const action = accountActions.deleteAccount;
    if (!action || saving) return;
    setSaving("account");
    setError("");
    try {
      await action();
      await logout();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(null);
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
            <dd className="value">{profile?.display_name || "Sin nombre"}</dd>
          </div>
          <div className="group-row">
            <dt>Correo</dt>
            <dd className="value">{profile?.email}</dd>
          </div>
        </dl>
        <p className="page-intro">
          Tu nombre viene de tu cuenta de Google.
        </p>
      </section>

      <section className="group" aria-labelledby="help-title">
        <h2 className="section-title" id="help-title">
          Cómo te ayuda Dream
        </h2>
        <ul className="group-list">
          {HELP.map((row) => (
            <li className="group-row" key={row.key}>
              <span className="row-text">
                <strong>{row.title}</strong>
                <small>{row.description}</small>
              </span>
              <button
                className="switch"
                role="switch"
                aria-checked={profile?.[row.key] ?? false}
                aria-label={row.title}
                disabled={saving !== null}
                onClick={() => void toggle(row.key)}
              />
            </li>
          ))}
        </ul>
        {saved && (
          <p className="save-status" role="status">
            <Check size={16} />
            Preferencias guardadas
          </p>
        )}
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
            onClick={() => setConfirm("history")}
          >
            Borrar historial
          </button>
          <button
            type="button"
            className="danger-outline press"
            onClick={() => setConfirm("account")}
          >
            Eliminar mi cuenta
          </button>
        </div>
      </section>

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
              disabled={saving !== null}
              onClick={() => void clearHistory()}
            >
              Borrar historial
            </button>
          </div>
        </Modal>
      )}
      {confirm === "account" && (
        <Modal labelledBy="account-delete-title" onClose={() => setConfirm(null)}>
          <h2 id="account-delete-title">¿Eliminar tu cuenta?</h2>
          <p>
            Se borrarán tu perfil, tus conversaciones, tus apuntes y tus
            exámenes. Esta acción no se puede deshacer.
          </p>
          {!accountActions.deleteAccount && (
            <p role="status">
              Todavía no se puede eliminar la cuenta desde la app.
            </p>
          )}
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
              disabled={!accountActions.deleteAccount || saving !== null}
              onClick={() => void deleteAccount()}
            >
              Eliminar cuenta
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
