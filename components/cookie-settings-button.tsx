"use client";
import { useState } from "react";
import { renewConsent, type ConsentWindow } from "@/lib/cookie-consent";

/**
 * «Configurar cookies»: vuelve a abrir el banner de Cookiebot para cambiar o
 * retirar la decisión, tan fácil como darla. Está en el pie de las páginas
 * públicas y en Ajustes > Privacidad. Si Cookiebot no está (bloqueador, o
 * entorno sin Cookiebot), lo dice en una línea y remite a /cookies.
 */
export function CookieSettingsButton({ className = "text-link" }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setMissing(!renewConsent(window as unknown as ConsentWindow))}
      >
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
