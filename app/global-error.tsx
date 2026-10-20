"use client";
import { useEffect } from "react";
import { captureDiagnostic } from "@/lib/observability/diagnostics";
// Replaces the root layout, so globals.css is not loaded: inline, token-equivalent styles.
const css = `
:root{--bg:#FFFFFF;--text:#080B14;--muted:#5B6678;--primary:#155BFF;--focus:#155BFF;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0E1117;--text:#F2F4F8;--muted:#A3ADBF;--focus:#7AA2FF}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:17px/1.5 -apple-system,"SF Pro Text","SF Pro Display",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:440px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}
h1{margin:0;font-size:2.125rem;line-height:1.1;letter-spacing:-.025em}
p{margin:0;color:var(--muted)}
button{min-height:44px;padding:0 24px;border:0;border-radius:22px;background:var(--primary);color:#fff;font:600 15px/1 inherit;font-family:inherit;cursor:pointer}
button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}`;
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
      <head>
        <title>Dream</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main role="alert">
          <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#155BFF" />
            <g transform="rotate(-25 32 32)">
              <ellipse cx="32" cy="32" rx="22" ry="13" fill="none" stroke="#C8F560" strokeWidth="5" />
            </g>
            <ellipse cx="31" cy="33" rx="7.5" ry="6.5" fill="#C8F560" />
            <circle cx="51.9" cy="22.7" r="4.8" fill="#FFFFFF" />
          </svg>
          <h1>Dream necesita un momento</h1>
          <p>No se ha podido abrir esta página.</p>
          <button onClick={reset}>Reintentar</button>
        </main>
      </body>
    </html>
  );
}
