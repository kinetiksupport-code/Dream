"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { track, analyticsConfigured } from "@/lib/observability/analytics";
import {
  diagnosticsConfigured,
  verifyDiagnostics,
} from "@/lib/observability/diagnostics";
import {
  readPrivacy,
  savePrivacy,
  privacySignal,
  privacyEvent,
  type PrivacyPreferences,
} from "@/lib/observability/privacy";
import { sectionForPath } from "@/lib/observability/policy";
export function ObservabilityRoutes() {
  const path = usePathname();
  useEffect(() => {
    track("section_viewed", { section: sectionForPath(path) });
  }, [path]);
  return null;
}
export function PrivacySettings() {
  const [preferences, setPreferences] = useState<PrivacyPreferences>({
    analytics: false,
    diagnostics: false,
  });
  const [blocked, setBlocked] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const sync = () => {
      setPreferences(readPrivacy());
      setBlocked(privacySignal());
    };
    sync();
    window.addEventListener(privacyEvent, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(privacyEvent, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <section className="group" aria-labelledby="usage-title">
      <h2 className="section-title" id="usage-title">
        Datos de uso
      </h2>
      <p className="page-intro">
        Opcional y desactivado por defecto. No compartimos mensajes, respuestas,
        archivos ni datos de tu cuenta. Puedes cambiar tu decisión en cualquier
        momento, en este dispositivo.
      </p>
      <ul className="group-list">
        {(
          [
            {
              key: "analytics",
              title: "Analítica de uso",
              description:
                "Eventos anónimos de navegación y funciones para mejorar Dream.",
              configured: analyticsConfigured(),
            },
            {
              key: "diagnostics",
              title: "Diagnóstico de errores",
              description:
                "Errores y rendimiento del navegador, sin contenido personal.",
              configured: diagnosticsConfigured(),
            },
          ] as const
        ).map((row) => (
          <li className="group-row" key={row.key}>
            <span className="row-text">
              <strong>{row.title}</strong>
              <small>
                {row.configured
                  ? row.description
                  : "No disponible: esta versión de Dream no tiene activado este servicio, así que no se envía nada."}
              </small>
            </span>
            <button
              className="switch"
              role="switch"
              aria-label={row.title}
              aria-checked={row.configured && preferences[row.key]}
              disabled={blocked || !row.configured}
              onClick={() =>
                savePrivacy({ ...preferences, [row.key]: !preferences[row.key] })
              }
            />
          </li>
        ))}
        {(process.env.NODE_ENV === "development" ||
          process.env.NEXT_PUBLIC_OBSERVABILITY_DEBUG === "true") && (
          <li className="group-row">
            <span className="row-text">
              <strong>Verificar observabilidad</strong>
              <small>
                Envía solo un evento técnico de prueba con tu consentimiento.
              </small>
              <small role="status">{status}</small>
            </span>
            <button
              className="text-button press"
              disabled={!preferences.analytics && !preferences.diagnostics}
              onClick={async () => {
                if (preferences.analytics)
                  track("analytics_verification", { section: "settings" });
                const id = preferences.diagnostics
                  ? await verifyDiagnostics()
                  : undefined;
                setStatus(
                  id
                    ? `Evento Sentry enviado al SDK: ${id}. Comprueba su recepción en Sentry.`
                    : "Evento de analítica solicitado. Comprueba su recepción en PostHog.",
                );
              }}
            >
              Verificar
            </button>
          </li>
        )}
      </ul>
      {blocked && (
        <p className="page-intro" role="status">
          Respetamos la señal de privacidad de tu navegador: no se envía
          telemetría.
        </p>
      )}
    </section>
  );
}
