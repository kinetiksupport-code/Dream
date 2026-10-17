"use client";
import { useEffect, useState } from "react";
import { formatResetIn } from "@/lib/ai-modes";
import { useAiUsage } from "@/lib/use-ai-usage";

/** Ajustes › Límite de uso: una barra por modo, sin cifras absolutas. */
export function UsageLimits() {
  const { usage, loaded, error } = useAiUsage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const ends = usage.window ? Date.parse(usage.window.ends_at) : NaN;
  const open = Number.isFinite(ends) && ends > now;
  return (
    <section className="group" aria-labelledby="usage-title">
      <h2 className="section-title" id="usage-title">
        Límite de uso
      </h2>
      <p className="page-intro">
        Cada modo tiene su propio límite. Se cuenta en ventanas de 5 horas que
        empiezan con tu primer mensaje.
      </p>
      <div className="usage-list" aria-busy={!loaded}>
        {usage.modes.map((m) => {
          const percent = open ? m.percent : 0;
          const label = `${m.label}: ${percent} % usado`;
          return (
            <div className="usage-row" key={m.id}>
              <p className="usage-label" id={`usage-${m.id}`}>
                {label}
              </p>
              <div
                className="usage-bar"
                role="progressbar"
                aria-labelledby={`usage-${m.id}`}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={label}
                data-level={
                  percent >= 100 ? "full" : percent >= 80 ? "high" : undefined
                }
              >
                <span
                  className="usage-fill"
                  style={{ transform: `scaleX(${loaded ? percent / 100 : 0})` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="usage-reset" role="status">
        {error
          ? "No se pudo consultar tu uso ahora."
          : open
            ? `Se reinicia en ${formatResetIn(ends - now)}.`
            : "Aún no has empezado una ventana de uso."}
      </p>
    </section>
  );
}
