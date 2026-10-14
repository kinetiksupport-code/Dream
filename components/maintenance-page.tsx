"use client";

import Image from "next/image";

type MaintenancePageProps = { state: "maintenance" | "unavailable" };

export function MaintenancePage({ state }: MaintenancePageProps) {
  const maintenance = state === "maintenance";

  return (
    <main className="maintenance-page" aria-live="polite">
      <div className="maintenance-hero">
        <Image
          className="maintenance-art"
          src="/brand/maintenance-repair-3d.png"
          alt=""
          aria-hidden="true"
          width="560"
          height="560"
          unoptimized
        />
        <section className="maintenance-content">
          <div className="maintenance-brand">
            <Image
              src="/brand/dream-logo.png"
              alt=""
              aria-hidden="true"
              width="96"
              height="96"
              unoptimized
            />
            <span>Dream</span>
          </div>
          <h1>
            {maintenance
              ? "Estamos haciendo mejoras."
              : "No podemos verificar el estado de Dream."}
          </h1>
          <p className="maintenance-description">
            {maintenance
              ? "Volveremos cuando hayamos comprobado que todo funciona con estabilidad."
              : "La conexión no está disponible ahora; Dream está pausado hasta poder comprobar el servicio."}
          </p>
        </section>
      </div>
    </main>
  );
}

export function MaintenanceCheck() {
  return (
    <main className="maintenance-check" role="status" aria-live="polite">
      <span className="maintenance-check-orb" aria-hidden="true" />
      <p>Comprobando la disponibilidad de Dream…</p>
    </main>
  );
}
