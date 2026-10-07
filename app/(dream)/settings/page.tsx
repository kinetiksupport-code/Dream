"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, Check, LogOut, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { callDream, errorMessage } from "@/lib/dream-api";
import type { DreamProfile, UserPreferences } from "@/lib/types";
export default function Settings() {
  const { profile, setProfile, theme, setTheme, logout } = useDream();
  const { refresh } = useConversations();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
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
  async function clear() {
    if (saving) return;
    setSaving("delete");
    try {
      await callDream("conversations_delete_all");
      await refresh();
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }
  return (
    <div className="personal-page">
      <h1>Dream, a tu manera.</h1>
      <div className="settings-account">
        <span className="avatar">
          {(profile?.display_name || profile?.email || "D")
            .slice(0, 1)
            .toUpperCase()}
        </span>
        <div>
          <strong>{profile?.display_name || "Mi cuenta"}</strong>
          <p>{profile?.email}</p>
        </div>
      </div>
      <section className="settings-group">
        <h2>Dream</h2>
        {(
          [
            {
              key: "pref_step_by_step",
              title: "Paso a paso",
              description:
                "Dar espacio a cada idea antes de pasar a la siguiente.",
            },
            {
              key: "pref_practice_suggestions",
              title: "Una ocasión para practicar",
              description: "Sugerir ejercicios cuando ayuden a entender mejor.",
            },
            {
              key: "pref_calm_tone",
              title: "Un tono tranquilo",
              description: "Explicaciones cercanas, claras y sin prisa.",
            },
          ] as const
        ).map((row) => (
          <div className="settings-row" key={row.key}>
            <div>
              <strong>{row.title}</strong>
              <p>{row.description}</p>
            </div>
            <button
              className="switch"
              role="switch"
              aria-checked={profile?.[row.key] ?? false}
              aria-label={row.title}
              disabled={saving !== null}
              onClick={() => void toggle(row.key)}
            >
              <span />
            </button>
          </div>
        ))}
      </section>
      <section className="settings-group">
        <h2>Apariencia</h2>
        <div className="settings-row appearance-row">
          <div>
            <strong>La luz de tu espacio</strong>
            <p>Elige cómo se siente Dream.</p>
          </div>
          <div className="theme-options">
            {(
              [
                { value: "light", label: "Claro", icon: Sun },
                { value: "dark", label: "Oscuro", icon: Moon },
                { value: "system", label: "Sistema", icon: Monitor },
              ] as const
            ).map((t) => (
              <button
                aria-pressed={theme === t.value}
                key={t.value}
                onClick={() => setTheme(t.value)}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="settings-group">
        <h2>Datos</h2>
        <div className="settings-row">
          <div>
            <strong>Mis conversaciones</strong>
            <p>Eliminar tu historial de conversaciones.</p>
          </div>
          <button
            className="text-button danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </section>
      <section className="settings-group">
        <h2>Cuenta</h2>
        <div className="settings-row">
          <div>
            <strong>{profile?.display_name || "Mi cuenta"}</strong>
            <p>{profile?.email}</p>
          </div>
          <button
            className="text-button"
            onClick={() =>
              void logout().catch((e) => setError(errorMessage(e)))
            }
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </section>
      {saved && (
        <p className="save-status" role="status">
          <Check size={15} />
          Preferencias guardadas
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <Modal labelledBy="delete-title" onClose={() => setConfirm(false)}>
          <h2 id="delete-title">¿Eliminar todas las conversaciones?</h2>
          <p>Esta acción no se puede deshacer.</p>
          <div className="modal-actions">
            <button
              className="text-button"
              autoFocus
              onClick={() => setConfirm(false)}
            >
              Cancelar
            </button>
            <button
              className="primary danger-button"
              disabled={saving !== null}
              onClick={() => void clear()}
            >
              Eliminar todas
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
