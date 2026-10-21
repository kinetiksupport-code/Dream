"use client";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import styles from "./panel.module.css";

/**
 * Segundo factor (TOTP). La primera vez, inscripción guiada: solo la cuenta que
 * dream-api ya ha reconocido como administradora llega aquí. Después, siempre
 * pide el código. También sirve para «reautenticar» antes de las acciones graves.
 */
type Enroll = { factorId: string; qr: string; secret: string };

export function MfaGate({ fresh, onDone }: { fresh: boolean; onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mfa = getSupabase().auth.mfa;
      const { data, error: listError } = await mfa.listFactors();
      if (!alive) return;
      if (listError) return setError("No se pudo preparar el segundo factor.");
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) return setFactorId(verified.id);
      // Restos de una inscripción a medias: se quitan antes de empezar de nuevo.
      for (const f of data?.all ?? []) if (f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      const created = await mfa.enroll({ factorType: "totp", friendlyName: "Panel de Dream" });
      if (!alive) return;
      if (created.error || !created.data) return setError("No se pudo crear el segundo factor.");
      setEnroll({ factorId: created.data.id, qr: created.data.totp.qr_code, secret: created.data.totp.secret });
      setFactorId(created.data.id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return setError("Escribe los 6 números de la aplicación.");
    setBusy(true);
    setError("");
    const result = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    setCode("");
    if (result.error) return setError("Ese código no vale. Prueba con el siguiente.");
    onDone();
  }

  return (
    <main className={styles.gate}>
      <form className={styles.gateCard} onSubmit={submit} aria-labelledby="mfa-title">
        <h1 id="mfa-title" className={styles.gateTitle}>
          {enroll ? "Activa el segundo factor" : fresh ? "Abriendo el panel…" : "Código de verificación"}
        </h1>
        {enroll && (
          <>
            <p>Escanea este código con tu aplicación de autenticación y escribe el número que te muestra.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qr} src={enroll.qr} alt="Código QR para la aplicación de autenticación" width={176} height={176} />
            <p className={styles.small}>
              Si no puedes escanearlo, escribe esta clave a mano: <code>{enroll.secret}</code>
            </p>
          </>
        )}
        {!enroll && <p>Escribe el código de 6 números de tu aplicación de autenticación.</p>}
        <label className={styles.field}>
          <span>Código</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button className={styles.primary} type="submit" disabled={busy || !factorId}>
          {busy ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
