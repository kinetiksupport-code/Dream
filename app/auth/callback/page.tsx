"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  callbackError,
  exchangeError,
  type AuthErrorCode,
} from "@/lib/auth-redirect";
import { DreamActivity } from "@/components/dream-mark";
export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    // Never a blank page: every failed return goes back to the login with a
    // short code that it turns into a Spanish message.
    let failure: AuthErrorCode = "session";
    async function finish() {
      try {
        const client = getSupabase();
        const params = new URLSearchParams(location.search);
        const code = params.get("code");
        const returned = callbackError(location.search, location.hash);
        if (returned) {
          failure = returned;
          throw new Error(returned);
        }
        const { data } = await client.auth.getSession();
        if (!data.session) {
          if (!code) {
            failure = "no-code";
            throw new Error(failure);
          }
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) {
            failure = exchangeError(error.message);
            throw error;
          }
        }
        const { data: next } = await client.auth.getSession();
        if (!next.session) throw new Error("No session");

        let verification: Response;
        try {
          verification = await fetch("/api/auth/verify-maintenance", {
            method: "POST",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${next.session.access_token}`,
            },
          });
        } catch {
          await client.auth.signOut({ scope: "local" });
          if (active) router.replace("/maintenance");
          return;
        }

        if (!verification.ok) {
          await client.auth.signOut({ scope: "local" });
          if (active) router.replace("/maintenance");
          return;
        }

        const result = (await verification.json().catch(() => null)) as
          | { allowed?: boolean }
          | null;
        if (result?.allowed !== true) {
          await client.auth.signOut({ scope: "local" });
          if (active) router.replace("/maintenance");
          return;
        }

        if (active) router.replace("/chat");
      } catch {
        try {
          await getSupabase().auth.signOut({ scope: "local" });
        } catch {}
        if (active) router.replace(`/login?error=${failure}`);
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, [router]);
  return (
    <main className="boot">
      <DreamActivity state="thinking" label="Entrando en Dream" />
    </main>
  );
}
