"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { STORAGE_NOTICE_KEY } from "@/lib/legal";

/**
 * First-visit notice about device storage. Dream only uses necessary storage;
 * analytics and error reports stay off until enabled in Ajustes, so this is
 * information, not a consent prompt. Closing it is remembered on this device.
 */
export function StorageNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_NOTICE_KEY) === "1";
    } catch {}
    setOpen(!seen);
  }, []);
  if (!open) return null;
  function close() {
    try {
      localStorage.setItem(STORAGE_NOTICE_KEY, "1");
    } catch {}
    setOpen(false);
  }
  return (
    <section className="storage-notice rise" aria-label="Aviso sobre cookies">
      <p>
        Dream solo usa el almacenamiento necesario para funcionar y las
        estadísticas están apagadas salvo que las actives en Ajustes.{" "}
        <Link href="/cookies">Más información</Link>
      </p>
      <button type="button" className="primary press" onClick={close}>
        Entendido
      </button>
    </section>
  );
}
