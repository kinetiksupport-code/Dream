"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { adminCall } from "@/lib/admin-api";
import { NotFoundView } from "@/components/not-found-view";
import { MfaGate } from "./mfa-gate";
import { PanelHome } from "./panel-home";

/**
 * Panel de administración. Hasta que dream-api confirme que quien mira es el
 * administrador (correo, tabla de administradores, identidad de Google) se
 * dibuja exactamente la página 404, igual que el HTML que llega del servidor.
 * Si no lo es, se le manda a Inicio (/chat con sesión, la portada sin ella).
 * Nada de lo que se pinta aquí es una barrera: la barrera es dream-api en cada
 * petición. Aquí solo se evita enseñar de más.
 */
type Phase = "checking" | "denied" | "mfa" | "ready";
const IDLE_MS = 30 * 60_000;

export function PanelApp() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [fresh, setFresh] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const home = useRef("/");

  const check = useCallback(async () => {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session) return setPhase("denied");
    home.current = "/chat";
    const status = await adminCall("admin_mfa_status");
    if (status.status !== 200 || status.data?.admin !== true) return setPhase("denied");
    setFresh(status.data.fresh === true);
    if (status.data.aal2 !== true) return setPhase("mfa");
    // Sesión del panel: pide un código reciente para abrirla.
    if (status.data.fresh !== true) return setPhase("mfa");
    const start = await adminCall("admin_session_start");
    setPhase(start.status === 200 ? "ready" : "mfa");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (phase === "denied") router.replace(home.current);
  }, [phase, router]);

  // 30 minutos sin tocar nada: se cierra la sesión del panel.
  const touch = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setPhase("mfa"), IDLE_MS);
  }, []);
  useEffect(() => {
    if (phase !== "ready") return;
    touch();
    const events = ["pointerdown", "keydown"] as const;
    for (const name of events) window.addEventListener(name, touch);
    return () => {
      for (const name of events) window.removeEventListener(name, touch);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [phase, touch]);

  if (phase === "checking" || phase === "denied") return <NotFoundView />;
  if (phase === "mfa") return <MfaGate fresh={fresh} onDone={() => void check()} />;
  return <PanelHome onLock={() => setPhase("mfa")} />;
}
