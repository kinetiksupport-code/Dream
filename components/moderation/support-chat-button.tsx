"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { crisp, noticeAccepted, rememberNotice } from "@/lib/crisp";
import styles from "./moderation.module.css";

const EXIT_MS = 120;
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * «Hacer una apelación»: abre el chat de soporte de Crisp. Crisp solo se carga
 * después de pulsar (y, la primera vez, de aceptar el aviso) y NO recibe ni el
 * correo ni el nombre ni ningún dato de la cuenta: el alumno pega el código de
 * apelación, que no contiene datos personales. Excepción a «Crisp solo desde
 * Ajustes»: aquí también se permite.
 */
export function SupportChatButton({ label = "Hacer una apelación" }: { label?: string }) {
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
      // Red, bloqueador de anuncios o sin conexión: una línea discreta y el formulario de abajo.
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
    <>
      <button
        type="button"
        className="primary press"
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => {
          if (busy) return;
          if (noticeAccepted(storage())) void openChat();
          else setNotice(true);
        }}
      >
        <MessageCircle size={18} aria-hidden="true" />
        {busy ? "Abriendo el chat…" : label}
      </button>
      {failed && (
        <p className={styles.hint} role="status">
          No se pudo abrir el chat ahora. Puedes reclamar por escrito aquí abajo.
        </p>
      )}
      {notice && (
        <Modal variant="alert" leaving={leaving} labelledBy="appeal-crisp-title" describedBy="appeal-crisp-text" onClose={closeNotice}>
          <h2 id="appeal-crisp-title">Chat de ayuda</h2>
          <p id="appeal-crisp-text">
            El chat de ayuda lo gestiona Crisp, un servicio externo. Al abrirlo se cargará su chat y se guardarán los mensajes que escribas. Dream no le pasa tu correo ni tu nombre: pega tu código de apelación para que podamos encontrar tu caso. No incluyas contraseñas ni datos que no quieras compartir.
          </p>
          <p>
            <Link className="text-link" href="/privacidad">
              Política de privacidad
            </Link>
          </p>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={closeNotice}>
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
    </>
  );
}
