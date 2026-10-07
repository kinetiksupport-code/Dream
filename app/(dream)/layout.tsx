import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { DreamActivity } from "@/components/dream-mark";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="boot">
          <DreamActivity state="thinking" />
        </main>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
