"use client";

import { useEffect, useState } from "react";
import example from "./muestra.json";
import type { CleanNotes } from "@/lib/clean-notes";
import { Hoja } from "./hoja";

declare global {
  interface Window {
    __APUNTES__?: CleanNotes;
  }
}

/** Solo para /apuntes-muestra: el banco de capturas inyecta los apuntes en window.__APUNTES__. */
export function ApuntesMuestra() {
  const [notes, setNotes] = useState<CleanNotes>(example as CleanNotes);
  useEffect(() => {
    if (window.__APUNTES__) setNotes(window.__APUNTES__);
  }, []);
  return (
    <main style={{ padding: "clamp(12px, 3vw, 32px) 16px", minHeight: "100dvh", background: "var(--bg, transparent)" }}>
      <Hoja notes={notes} />
    </main>
  );
}
