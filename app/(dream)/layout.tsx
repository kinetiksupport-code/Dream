import { Suspense } from "react";
import { Shell } from "@/components/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="boot">
          <div className="boot-spinner" role="status" aria-label="Cargando" />
        </main>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
