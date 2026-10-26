"use client";
import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { DreamApiError, errorMessage } from "@/lib/dream-api";
import {
  deleteAllMemory,
  deleteMemory,
  groupMemories,
  loadMemory,
  pinMemory,
  setMemoryEnabled,
  type MemoryState,
} from "@/lib/memory";
import { ImportFromAI } from "./memory-import";

/**
 * Ajustes › Lo que Dream recuerda. Solo existe si dream-api tiene la memoria
 * encendida: si la acción no existe (400), la sección no se dibuja.
 */
export function MemorySettings() {
  const [state, setState] = useState<MemoryState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const id = useId();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setState(await loadMemory(signal));
      setError("");
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof DreamApiError && e.status === 400) setState(null);
      else setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      setStatus(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const groups = groupMemories(state.items);
  return (
    <section className="group" aria-labelledby={`${id}-title`}>
      <h2 className="section-title" id={`${id}-title`}>
        Lo que Dream recuerda
      </h2>
      <p className="page-intro">
        Si lo activas, Dream recuerda cosas de estudio entre chats (qué te
        cuesta, cómo te gusta que te expliquen, tus exámenes). Nunca salud,
        familia ni datos de otras personas. Lo ves y lo borras aquí.
      </p>
      <ul className="group-list">
        <li className="group-row">
          <span className="row-text">
            <strong>Recordar entre chats</strong>
            <small>
              {state.memory_enabled
                ? "Activado. Se borra solo lo que no se usa en 12 meses."
                : "Desactivado. Dream no guarda nada entre chats."}
            </small>
          </span>
          <button
            className="switch"
            role="switch"
            aria-label="Recordar entre chats"
            aria-checked={state.memory_enabled}
            disabled={busy}
            onClick={() =>
              void act(
                () => setMemoryEnabled(!state.memory_enabled),
                state.memory_enabled
                  ? "Memoria desactivada."
                  : "Memoria activada.",
              )
            }
          />
        </li>
      </ul>

      {state.memory_enabled && groups.length === 0 && (
        <p className="page-intro">
          Todavía no recuerda nada. Lo hará cuando termines una conversación de
          estudio.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.kind} className="memory-group">
          <h3 className="memory-kind">{group.label}</h3>
          <ul className="group-list">
            {group.items.map((m) => (
              <li className="group-row" key={m.id}>
                <span className="row-text">
                  <strong>{m.content}</strong>
                  <small>
                    {[
                      m.subject,
                      m.pinned ? "Fijado" : null,
                      m.source === "import" ? "Importado de otra IA" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {m.source_conversation_id && (
                      <>
                        {m.subject || m.pinned || m.source === "import"
                          ? " · "
                          : ""}
                        <Link
                          className="text-link"
                          href={`/chat?c=${m.source_conversation_id}`}
                        >
                          Ver de qué chat salió
                        </Link>
                      </>
                    )}
                  </small>
                </span>
                <span className="memory-actions">
                  <button
                    type="button"
                    className="icon-action press"
                    aria-label={`${m.pinned ? "Quitar fijado" : "Fijar"}: ${m.content}`}
                    aria-pressed={m.pinned}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => pinMemory(m.id, !m.pinned),
                        m.pinned ? "Ya no está fijado." : "Fijado.",
                      )
                    }
                  >
                    {m.pinned ? (
                      <PinOff size={18} aria-hidden="true" />
                    ) : (
                      <Pin size={18} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="icon-action press"
                    aria-label={`Borrar: ${m.content}`}
                    disabled={busy}
                    onClick={() => void act(() => deleteMemory(m.id), "Borrado.")}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {state.memory_enabled && state.import_available && (
        <ImportFromAI
          exportPrompt={state.export_prompt}
          importsLeft={state.imports_left}
          onSaved={() => void refresh()}
        />
      )}

      {state.items.length > 0 && (
        <div className="button-row">
          <button
            type="button"
            className="danger-outline press"
            onClick={() => setConfirming(true)}
          >
            Borrar todo lo que recuerda
          </button>
        </div>
      )}
      <p className="settings-why" role="status">
        {status}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {confirming && (
        <Modal
          variant="alert"
          labelledBy={`${id}-confirm`}
          describedBy={`${id}-confirm-text`}
          onClose={() => setConfirming(false)}
        >
          <h2 id={`${id}-confirm`}>¿Borrar todo lo que recuerda?</h2>
          <p id={`${id}-confirm-text`}>
            Dream olvidará todos tus recuerdos y resúmenes. Tus chats se quedan.
            No se puede deshacer.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary press"
              autoFocus
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary danger-button press"
              disabled={busy}
              onClick={() =>
                void act(deleteAllMemory, "Dream ya no recuerda nada.").then(
                  () => setConfirming(false),
                )
              }
            >
              {busy ? "Borrando…" : "Borrar todo"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
