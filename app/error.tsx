"use client";
import { useEffect } from "react";
import { Orb } from "@/components/orb";
import { captureDiagnostic } from "@/lib/observability/diagnostics";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureDiagnostic(error);
  }, [error]);
  return (
    <main className="boot">
      <div className="status-page" role="alert">
        <Orb size={56} />
        <h1>Algo no ha ido bien</h1>
        <p>No se pudo abrir esta parte de Dream. Tus datos están a salvo.</p>
        <div className="button-row">
          <button className="primary press" onClick={reset}>
            Reintentar
          </button>
          <a className="secondary press" href="/chat">
            Volver a Dream
          </a>
        </div>
      </div>
    </main>
  );
}
