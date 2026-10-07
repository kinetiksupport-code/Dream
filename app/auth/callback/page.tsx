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
        const code = new URLSearchParams(location.search).get("code");
        if (new URLSearchParams(location.search).has("error"))
          throw new Error("OAuth");
        const { data } = await client.auth.getSession();
        if (!data.session && code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data: next } = await client.auth.getSession();
        if (!next.session) throw new Error("No session");
        if (active) router.replace("/chat");
      } catch {
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
