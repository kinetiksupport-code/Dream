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
    <section className="settings-group">
      <h2>Privacidad</h2>
      <p>
        Opcional y desactivado por defecto. No compartimos mensajes, respuestas,
        archivos ni datos de tu cuenta. Puedes cambiar tu decisión en cualquier
        momento, en este dispositivo.
      </p>
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
        <div className="settings-row" key={row.key}>
          <div>
            <strong>{row.title}</strong>
            <p>
              {row.description}
              {!row.configured && " Pendiente de configuración."}
            </p>
          </div>
          <button
            className="switch"
            role="switch"
            aria-label={row.title}
            aria-checked={preferences[row.key]}
            disabled={blocked || !row.configured}
            onClick={() =>
              savePrivacy({ ...preferences, [row.key]: !preferences[row.key] })
            }
          >
            <span />
          </button>
        </div>
      ))}
      {blocked && (
        <p role="status">
          Respetamos la señal de privacidad de tu navegador: no se envía
          telemetría.
        </p>
      )}
      {(process.env.NODE_ENV === "development" ||
        process.env.NEXT_PUBLIC_OBSERVABILITY_DEBUG === "true") && (
        <div className="settings-row">
          <div>
            <strong>Verificar observabilidad</strong>
            <p>Envía solo un evento técnico de prueba con tu consentimiento.</p>
            <p role="status">{status}</p>
          </div>
          <button
            className="text-button"
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
        </div>
      )}
    </section>
  );
}
