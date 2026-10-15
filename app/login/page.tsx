"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDream } from "@/components/providers";
import { Orb } from "@/components/orb";
import { LegalLinks } from "@/components/legal-links";
import { getSupabase, assertGoogleAvailable } from "@/lib/supabase";
import { errorMessage } from "@/lib/dream-api";
import s from "./login.module.css";

export default function Login() {
  const { ready, session, bootError } = useDream();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ready && session) router.replace("/chat");
    const params = new URLSearchParams(location.search);
    if (params.has("expired"))
      setError("Tu sesión ha terminado. Entra para continuar.");
    if (params.has("error"))
      setError("No se pudo completar el acceso. Inténtalo de nuevo.");
  }, [ready, session, router]);
  async function login() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      await assertGoogleAvailable();
      try {
        sessionStorage.setItem("dream-login-pending", "1");
      } catch {}
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (authError) throw authError;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className={s.login}>
      <section className={s.brandPanel} aria-label="Dream">
        <Link href="/" className={s.brand}>
          <Orb size={32} />
          Dream
        </Link>
        <div className={s.pitch}>
          <h1 className="display">Entiende lo que estudias.</h1>
          <p>
            Sube tus apuntes, haz preguntas y prepárate para los exámenes a tu
            propio ritmo.
          </p>
        </div>
      </section>
      <section className={s.formPanel}>
        <div className={s.form}>
          <Link className={s.mobileBrand} href="/" aria-label="Dream, inicio">
            <Orb size={56} />
          </Link>
          <div className={s.heading}>
            <h2>Entrar en Dream</h2>
            <p>Inicia sesión o crea tu cuenta gratis.</p>
          </div>
          <button
            type="button"
            className={`press ${s.googleButton}`}
            onClick={() => void login()}
            disabled={!ready || busy}
            aria-busy={busy}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {busy ? "Abriendo Google…" : "Continuar con Google"}
          </button>
          {(error || bootError) && (
            <p role="alert" className={s.error}>
              {error || bootError}
            </p>
          )}
          <p className={s.legal}>
            Al continuar, aceptas nuestros{" "}
            <Link href="/terminos">Términos y condiciones</Link> y nuestra{" "}
            <Link href="/privacidad">Política de privacidad</Link>.
          </p>
          <Link className="text-link" href="/">
            Volver al inicio
          </Link>
          <LegalLinks className={s.legalLinks} />
        </div>
      </section>
    </main>
  );
}
