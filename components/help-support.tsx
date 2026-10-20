"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { crisp, noticeAccepted, rememberNotice } from "@/lib/crisp";

/** Exit fade of the notice (same as the other dialogs in Ajustes). */
const EXIT_MS = 120;
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Ajustes > Ayuda: «Hablar con soporte» opens the Crisp chat. Crisp only loads
 * after this click (and, the first time, after the notice); nothing about the
 * student is passed to it.
 */
export function HelpSupport() {
  const [notice, setNotice] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(0);

  async function openChat() {
    setFailed(false);
    setBusy(true);
    try {
      await crisp().open();
    } catch {
      // Network, ad blocker or offline: no fallback, just one quiet line.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  function closeNotice() {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setNotice(false);
      setLeaving(false);
    }, EXIT_MS);
  }

  return (
    <section className="group" aria-labelledby="help-title">
      <h2 className="section-title" id="help-title">
        Ayuda
      </h2>
      <p className="page-intro">
        Si algo no funciona o tienes una duda, escríbenos.
      </p>
      <div className="button-row">
        <button
          type="button"
          className="secondary press help-button"
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => {
            if (busy) return;
            if (noticeAccepted(storage())) void openChat();
            else setNotice(true);
          }}
        >
          {busy ? (
            <span className="help-spinner" aria-hidden="true" />
          ) : (
            <MessageCircle size={18} aria-hidden="true" />
          )}
          {busy ? "Abriendo el chat…" : "Hablar con soporte"}
        </button>
      </div>
      {failed && (
        <p className="settings-why help-failed" role="status">
          No se pudo abrir el chat ahora. Inténtalo más tarde.
        </p>
      )}
      <p className="help-links">
        <Link className="text-link" href="/privacidad">
          Privacidad
        </Link>
        <Link className="text-link" href="/cookies">
          Cookies
        </Link>
        <Link className="text-link" href="/terminos">
          Términos
        </Link>
        <Link className="text-link" href="/aviso-legal">
          Aviso legal
        </Link>
      </p>

      {notice && (
        <Modal
          variant="alert"
          leaving={leaving}
          labelledBy="crisp-title"
          describedBy="crisp-text"
          onClose={closeNotice}
        >
          <h2 id="crisp-title">Chat de ayuda</h2>
          <p id="crisp-text">
            El chat de ayuda lo gestiona Crisp, un servicio externo. Al abrirlo
            se cargará su chat y se guardarán los mensajes que escribas. No
            incluyas contraseñas ni datos que no quieras compartir.
          </p>
          <p className="help-notice-link">
            <Link className="text-link" href="/privacidad">
              Política de privacidad
            </Link>
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary press"
              onClick={closeNotice}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary press"
              autoFocus
              onClick={() => {
                rememberNotice(storage());
                closeNotice();
                void openChat();
              }}
            >
              Abrir chat
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
