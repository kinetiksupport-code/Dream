"use client";
import { useEffect } from "react";
import { captureDiagnostic } from "@/lib/observability/diagnostics";
export default function GlobalError({
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
    <html lang="es">
      <body>
        <main>
          <h1>Dream necesita un momento.</h1>
          <p>No se ha podido abrir esta página.</p>
          <button onClick={reset}>Reintentar</button>
        </main>
      </body>
    </html>
  );
}
