"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { TURNSTILE_ACTIONS, turnstileOn, type TurnstileAction } from "@/lib/turnstile";
import { registerHumanCheck } from "@/lib/human-check";
import { Turnstile } from "./turnstile";

const EXIT_MS = 120;

/**
 * Hoja de comprobación para la primera acción de IA de una cuenta nueva, solo
 * cuando dream-api sospecha (docs/turnstile.md). lib/dream-api.ts la abre al
 * recibir «turnstile_required» y repite la petición con el token.
 */
export function HumanCheckHost() {
  const [open, setOpen] = useState<TurnstileAction | null>(null);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef<((token: string | null) => void) | null>(null);

  useEffect(() => {
    if (!turnstileOn()) return;
    return registerHumanCheck(
      (action) =>
        new Promise<string | null>((resolve) => {
          pending.current?.(null);
          pending.current = resolve;
          setLeaving(false);
          setOpen(action);
        }),
    );
  }, []);

  function finish(token: string | null) {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(token);
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(null);
      setLeaving(false);
    }, EXIT_MS);
  }

  if (!open) return null;
  return (
    <Modal variant="alert" leaving={leaving} labelledBy="human-check-title" describedBy="human-check-text" onClose={() => finish(null)}>
      <h2 id="human-check-title">Una comprobación rápida</h2>
      <p id="human-check-text">
        {open === TURNSTILE_ACTIONS.firstAi
          ? "Antes de tu primera pregunta, comprobamos que eres una persona. Solo tarda un momento."
          : "Comprobamos que eres una persona. Solo tarda un momento."}
      </p>
      <Turnstile action={open} onToken={(token) => token && finish(token)} />
      <div className="modal-actions">
        <button type="button" className="secondary press" onClick={() => finish(null)}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
