"use client";

import { useEffect, useState } from "react";
import example from "@/supabase/functions/dream-api/scheme-example.json";
import type { Scheme } from "@/lib/esquema";
import { EsquemaView } from "./esquema-view";

declare global {
  interface Window {
    __ESQUEMA__?: Scheme;
  }
}

/** Solo para /esquema-muestra: el banco de capturas inyecta el esquema en window.__ESQUEMA__. */
export function EsquemaMuestra() {
  const [scheme, setScheme] = useState<Scheme>(example as Scheme);
  useEffect(() => {
    if (window.__ESQUEMA__) setScheme(window.__ESQUEMA__);
  }, []);
  return (
    <main style={{ padding: "clamp(12px, 3vw, 32px) 16px", minHeight: "100dvh", background: "var(--bg, transparent)" }}>
      <EsquemaView scheme={scheme} />
    </main>
  );
}
