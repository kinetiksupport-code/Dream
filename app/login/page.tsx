"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDream } from "@/components/providers";
import { Orb } from "@/components/orb";
import { Sticker } from "@/components/sticker";
import { AlertIcon, ClockIcon } from "@/components/icons";
import { getSupabase, assertGoogleAvailable } from "@/lib/supabase";
import { errorMessage } from "@/lib/dream-api";
import {
  AUTH_ERRORS,
  getAuthRedirectUrl,
  isAuthErrorCode,
} from "@/lib/auth-redirect";
import { orbArrived } from "@/lib/orb-transition";
import s from "./login.module.css";

export default function Login() {
  const { ready, session, bootError } = useDream();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [expired, setExpired] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const places = useRef(new Map<Element, number>());
  // The Orb from the landing can land now (lib/orb-transition.ts).
  useEffect(() => orbArrived(), []);
  useEffect(() => {
    if (ready && session) router.replace("/chat");
    const params = new URLSearchParams(location.search);
    // Not an error: an informational notice (apple-design feedback.md).
    if (params.has("expired")) setExpired(true);
    const code = params.get("error");
    if (code !== null) {
      setError(
        isAuthErrorCode(code)
          ? AUTH_ERRORS[code]
          : "No se pudo completar el acceso. Inténtalo de nuevo.",
      );
      setCanRetry(true);
    }
  }, [ready, session, router]);
  async function login() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    setCanRetry(false);
    try {
      await assertGoogleAvailable();
      try {
        sessionStorage.setItem("dream-login-pending", "1");
      } catch {}
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl({ origin: location.origin }),
        },
      });
      if (authError) throw authError;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const message = error || bootError;
  // When a message appears or goes, what sits below it glides to its new
  // place instead of jumping (FLIP: transform only, 200 ms ease-out).
  // Reduced motion: no glide, it just appears.
  useLayoutEffect(() => {
    const items = [...(form.current?.querySelectorAll("[data-glide]") ?? [])];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of items) {
      const top = el.getBoundingClientRect().top;
      const before = places.current.get(el);
      places.current.set(el, top);
      if (reduce || before === undefined || Math.abs(before - top) < 1) continue;
      el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
        duration: 200,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
  }, [message, expired]);
  return (
    <main className={s.login}>
      <section
        className={`${s.brandPanel} pop tone-blue pop-grid`}
        aria-label="Dream"
      >
        <Link href="/" className={`press ${s.brand}`}>
          <Orb size={32} />
          Dream
        </Link>
        {/* The mascot: the Orb on a round yellow sticker (decorative). */}
        <div className={s.mascot} aria-hidden="true">
          <Sticker shape="round" tone="yellow" size={184} tilt={-6} animate>
            <Orb size={112} breathing />
          </Sticker>
        </div>
        <div className={s.pitch}>
          <p className={`hero-title ${s.pitchTitle}`}>
            Entiende lo que <span className="marker marker-draw">estudias</span>
            .
          </p>
          <p>
            Sube tus apuntes, haz preguntas y prepárate para los exámenes a tu
            propio ritmo.
          </p>
        </div>
      </section>
      <section className={s.formPanel}>
        <div className={s.form} ref={form}>
          <Link
            className={`press ${s.mobileBrand}`}
            href="/"
            aria-label="Dream, inicio"
          >
            <Sticker shape="round" tone="yellow" size={96} tilt={-6}>
              <Orb size={60} breathing />
            </Sticker>
          </Link>
          <div className={s.heading}>
            <h1 className="hero-title">Entrar en Dream</h1>
            <p>
              Entra con tu cuenta de Google. Si es tu primera vez, se crea tu
              cuenta gratis.
            </p>
          </div>
          {expired && !message && (
            <p role="status" className={`rise ${s.notice}`}>
              <ClockIcon size={20} />
              <span>Tu sesión ha terminado. Entra para continuar.</span>
            </p>
          )}
          <button
            type="button"
            className={`press ${s.googleButton}`}
            onClick={() => void login()}
            disabled={!ready}
            aria-busy={busy}
            aria-disabled={busy || undefined}
          >
            {busy ? (
              <span className={s.spinner} aria-hidden="true" />
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
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
            )}
            {busy ? "Abriendo Google…" : "Continuar con Google"}
          </button>
          {message && (
            <div role="alert" className={`rise ${s.error}`}>
              <AlertIcon size={20} />
              <div className={s.errorBody}>
                <p>{message}</p>
                {canRetry && error && (
                  <button
                    type="button"
                    className={`press secondary ${s.retry}`}
                    onClick={() => void login()}
                    disabled={!ready || busy}
                  >
                    Volver a intentarlo
                  </button>
                )}
              </div>
            </div>
          )}
          <p className={s.legal} data-glide>
            Al continuar, aceptas los{" "}
            <Link href="/terminos">Términos y condiciones</Link> y la{" "}
            <Link href="/privacidad">Política de privacidad</Link>.
          </p>
          <Link className={`press text-link ${s.back}`} href="/" data-glide>
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
