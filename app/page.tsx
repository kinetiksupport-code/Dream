"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDream } from "@/components/providers";
import { DreamActivity } from "@/components/dream-mark";
export default function Entry() {
  const { ready, session } = useDream();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(session ? "/chat" : "/login");
  }, [ready, session, router]);
  return (
    <main className="boot">
      <DreamActivity state="thinking" />
    </main>
  );
}
