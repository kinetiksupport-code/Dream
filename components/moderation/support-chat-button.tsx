"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { allowCrispThisVisit, crisp, noticeAccepted, rememberNotice } from "@/lib/crisp";
import { grantPreferences, type ConsentWindow } from "@/lib/cookie-consent";
import { useCookieConsent } from "@/lib/use-cookie-consent";
import styles from "./moderation.module.css";

const EXIT_MS = 120;
const EMAIL = "hellodream@edudream.es";
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const TEXT = {
  appeal: {
    notice:
      "El chat de ayuda lo gestiona Crisp, un servicio externo. Al abrirlo se cargará su chat y se guardarán los mensajes que escribas. Dream no le pasa tu correo ni tu nombre: pega tu código de apelación para que podamos encontrar tu caso. No incluyas contraseñas ni datos que no quieras compartir.",
    failed: "No se pudo abrir el chat ahora. Puedes reclamar por escrito aquí abajo.",
    without: "Sin cookies, puedes reclamar con el formulario de abajo o escribirnos a",
  },
  help: {
    notice:
      "El chat de ayuda lo gestiona Crisp, un servicio externo. Al abrirlo se cargará su chat y se guardarán los mensajes que escribas. Dream no le pasa tu correo ni tu nombre. No incluyas contraseñas ni datos que no quieras compartir.",
    failed: `No se pudo abrir el chat ahora. Escríbenos a ${EMAIL}.`,
    without: "Sin cookies, también puedes escribirnos a",
  },
} as const;

/**
 * «Hablar con soporte» (Ajustes > Ayuda) y «Hacer una apelación» (baneo): el
 * mismo cargador de Crisp con la misma puerta. Crisp solo se carga después de
 * pulsar y con permiso para las cookies de preferencias (Cookiebot). Sin ese
 * permiso, la hoja lo pide con «Permitir y abrir» y ofrece el correo como
 * alternativa sin cookies. Crisp NO recibe ni el correo ni el nombre ni ningún
 * dato de la cuenta.
 */
export function SupportChatButton({
  label = "Hacer una apelación",
  context = "appeal",
}: {
  label?: string;
  context?: keyof typeof TEXT;
}) {
  const consent = useCookieConsent();
  const [sheet, setSheet] = useState<null | { permission: boolean }>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(0);
  const text = TEXT[context];

  async function openChat() {
    setFailed(false);
    setBusy(true);
    try {
      await crisp().open();
    } catch {
      // Red, bloqueador de anuncios o sin conexión: una línea discreta y la alternativa.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  function closeSheet() {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setSheet(null);
      setLeaving(false);
    }, EXIT_MS);
  }
  function confirm() {
    rememberNotice(storage());
    if (sheet?.permission) {
      // El clic es el consentimiento: queda registrado en Cookiebot y vale para
      // esta visita aunque Cookiebot no esté (bloqueador).
      grantPreferences(window as unknown as ConsentWindow);
      allowCrispThisVisit();
    }
    closeSheet();
    void openChat();
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
          if (consent.preferences && noticeAccepted(storage())) void openChat();
          else setSheet({ permission: !consent.preferences });
        }}
      >
        <MessageCircle size={18} aria-hidden="true" />
        {busy ? "Abriendo el chat…" : label}
      </button>
      {failed && (
        <p className={styles.hint} role="status">
          {text.failed}
        </p>
      )}
      {sheet && (
        <Modal variant="alert" leaving={leaving} labelledBy="support-crisp-title" describedBy="support-crisp-text" onClose={closeSheet}>
          <h2 id="support-crisp-title">Chat de ayuda</h2>
          <div id="support-crisp-text">
            {sheet.permission && (
              <p>
                <strong>Para abrir el chat de ayuda necesitamos tu permiso para las cookies de preferencias de Crisp.</strong>
              </p>
            )}
            <p>{text.notice}</p>
          </div>
          {sheet.permission && (
            <p>
              {text.without} <a className="text-link" href={`mailto:${EMAIL}`}>{EMAIL}</a>.
            </p>
          )}
          <p>
            <Link className="text-link" href="/cookies">
              Política de cookies
            </Link>
            {" · "}
            <Link className="text-link" href="/privacidad">
              Política de privacidad
            </Link>
          </p>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={closeSheet}>
              {sheet.permission ? "Ahora no" : "Cancelar"}
            </button>
            <button type="button" className="primary press" autoFocus onClick={confirm}>
              {sheet.permission ? "Permitir y abrir" : "Abrir chat"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
