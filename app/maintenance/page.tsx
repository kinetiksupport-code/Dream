"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DreamSiteMark } from "@/components/dream-site-mark";
import { getSupabase, assertGoogleAvailable } from "@/lib/supabase";
import { errorMessage } from "@/lib/dream-api";
import styles from "./maintenance.module.css";

export default function MaintenancePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function continueWithGoogle() {
    setBusy(true);
    setError("");
    try {
      await assertGoogleAvailable();
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function recheck() {
    router.refresh();
    window.location.reload();
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <DreamSiteMark size={64} />
        <h1>Estamos mejorando Dream</h1>
        <p>
          Estamos trabajando para recuperar y mejorar el servicio. Gracias por
          tu paciencia.
        </p>
        <div className={styles.indicator} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={continueWithGoogle}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Abriendo Google…" : "Continuar con Google"}
          </button>
          <button className={styles.secondary} onClick={recheck} disabled={busy}>
            Volver a comprobar
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
