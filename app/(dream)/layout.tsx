import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Orb } from "@/components/orb";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="boot">
          <div className="boot-spinner" role="status" aria-label="Cargando">
            <Orb size={48} pulsing />
          </div>
        </main>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
