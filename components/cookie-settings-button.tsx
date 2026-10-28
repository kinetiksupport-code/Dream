"use client";
import { useEffect, useState } from "react";
import { cookiebotPage, renewConsent, type ConsentWindow } from "@/lib/cookie-consent";

const POLICY = "/cookies";
const ARRIVAL = "configurar";

/**
 * «Configurar cookies»: vuelve a abrir el banner de Cookiebot para cambiar o
 * retirar la decisión, tan fácil como darla. Está en el pie de las páginas
 * públicas y en Ajustes > Privacidad. Cookiebot solo está en la landing y en
 * las páginas legales: desde la app lleva a /cookies, que abre el banner al
 * llegar. Si Cookiebot no carga (bloqueador), lo dice en una línea.
 */
export function CookieSettingsButton({ className = "text-link" }: { className?: string }) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== POLICY || !url.searchParams.has(ARRIVAL)) return;
    url.searchParams.delete(ARRIVAL);
    window.history.replaceState(window.history.state, "", url);
    const win = window as unknown as ConsentWindow;
    const open = () => {
      if (renewConsent(win)) window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => setMissing(true), 6000);
    window.addEventListener("CookiebotOnLoad", open, { once: true });
    open();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("CookiebotOnLoad", open);
    };
  }, []);

  function onClick() {
    if (!cookiebotPage(window.location.pathname)) {
      window.location.assign(`${POLICY}?${ARRIVAL}=1`);
      return;
    }
    setMissing(!renewConsent(window as unknown as ConsentWindow));
  }

  return (
    <>
      <button type="button" className={className} onClick={onClick}>
        Configurar cookies
      </button>
      {missing && (
        <span className="cookie-settings-missing" role="status">
          No se pudo abrir ahora (¿un bloqueador?). Mira la{" "}
          <a href="/cookies">política de cookies</a>.
        </span>
      )}
    </>
  );
}
