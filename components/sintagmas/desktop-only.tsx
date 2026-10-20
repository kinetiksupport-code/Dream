"use client";
// Solo ordenador (decisión de Carlos, 20/10/2026). En móvil o tableta la
// actividad no se abre: en su lugar sale este mensaje.
import { useSyncExternalStore } from "react";
import { Monitor } from "lucide-react";
import { DESKTOP_ONLY_MESSAGE, DESKTOP_QUERY } from "@/lib/sintagmas";
import s from "./sintagmas.module.css";

function subscribe(change: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
/** true en ordenador, false en pantalla táctil o estrecha, null en el servidor. */
export function useDesktop(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null,
  );
}

export function DesktopOnly({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? s.desktopOnlyCompact : s.desktopOnly} role="note">
      <Monitor size={compact ? 20 : 28} aria-hidden="true" />
      <p>{DESKTOP_ONLY_MESSAGE}</p>
    </div>
  );
}
