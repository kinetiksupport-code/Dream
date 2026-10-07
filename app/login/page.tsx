"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useDream } from "@/components/providers";
import { DreamMark } from "@/components/dream-mark";
import { getSupabase, assertGoogleAvailable } from "@/lib/supabase";
import { errorMessage } from "@/lib/dream-api";
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
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await assertGoogleAvailable();
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Link className="wordmark" href="/">
        <DreamMark size={28} />
        dream
      </Link>
      <div className="login-content">
        <DreamMark large />
        <p className="eyebrow">TU INTELIGENCIA PERSONAL</p>
        <h1>
          Las grandes ideas
          <br />
          empiezan con
          <br />
          <span>una pregunta.</span>
        </h1>
        <p className="login-copy">
          Un espacio tuyo para aprender, crear
          <br />y entender un poco más.
        </p>
        <button
          className="google-button"
          onClick={login}
          disabled={busy || !ready}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38ZM12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.6A10 10 0 0 0 12 22ZM6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92v-2.6H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.52l3.35-2.6ZM12 5.95c1.47 0 2.79.5 3.83 1.51l2.88-2.88A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.6c.79-2.37 3-4.13 5.6-4.13Z"
            />
          </svg>
          {busy ? "Abriendo Google…" : "Continuar con Google"}
          <ArrowUpRight size={17} />
        </button>
        {(error || bootError) && (
          <p className="error" role="alert">
            {error || bootError}
          </p>
        )}
        <span className="login-note">Google → Dream. Así de simple.</span>
      </div>
      <footer className="login-footer">
        <span>Menos ruido. Más posibilidades.</span>
        <span>Hecho para tu curiosidad.</span>
      </footer>
    </main>
  );
}
