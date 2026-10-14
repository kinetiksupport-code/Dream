"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { DreamActivity } from "@/components/dream-mark";
export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        const client = getSupabase();
        const params = new URLSearchParams(location.search);
        const code = params.get("code");
        if (params.has("error")) throw new Error("OAuth");
        const { data } = await client.auth.getSession();
        if (!data.session && code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
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
        if (active) router.replace("/login?error=oauth");
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, [router]);
  return (
    <main className="boot">
      <DreamActivity state="thinking" />
    </main>
  );
}
