"use client";
import { useState } from "react";
import { callDream, errorMessage } from "@/lib/dream-api";

/** Ajustes › Privacidad: copia de todo lo que Dream guarda del alumno (JSON). */
export function DownloadMyData() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function download() {
    setBusy(true);
    setStatus("");
    try {
      const { data } = await callDream<{ data: unknown }>("data_export", {});
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mis-datos-dream-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Descargado.");
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="secondary press"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparando…" : "Descargar mis datos"}
      </button>
      <span className="visually-hidden" role="status">
        {status}
      </span>
    </>
  );
}
