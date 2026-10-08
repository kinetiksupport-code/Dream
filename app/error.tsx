"use client";
import { useEffect } from "react";
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
      <div>
        <h1>Volvamos a intentarlo.</h1>
        <p>No se pudo abrir esta parte de Dream.</p>
        <button className="primary" onClick={reset}>
          Reintentar
        </button>
        <a className="text-link" href="/chat">
          Volver a mi Dream
        </a>
      </div>
    </main>
  );
}
