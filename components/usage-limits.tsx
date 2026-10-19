"use client";
import { useEffect, useState } from "react";
import { costSentence, formatResetIn } from "@/lib/ai-modes";
import { useAiUsage } from "@/lib/use-ai-usage";

/**
 * Ajustes › Límite de uso: UNA barra para el límite conjunto de todos los
 * modos y una línea con lo que gasta cada modo. Sin cifras absolutas.
 */
export function UsageLimits() {
  const { usage, loaded, error } = useAiUsage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const ends = usage.window ? Date.parse(usage.window.ends_at) : NaN;
  const open = Number.isFinite(ends) && ends > now;
  const percent = open ? usage.percent : 0;
  const label = `Has usado el ${percent} % de tu IA.`;
  const costs = costSentence(usage.modes);
  return (
    <section className="group" aria-labelledby="usage-title">
      <h2 className="section-title" id="usage-title">
        Límite de uso
      </h2>
      <p className="page-intro">
        Todos los modos comparten un mismo límite. Se cuenta en ventanas de 5
        horas que empiezan con tu primer mensaje.
      </p>
      <div className="usage-list" aria-busy={!loaded}>
        <div className="usage-row">
          <p className="usage-label" id="usage-shared">
            {label}
          </p>
          <div
            className="usage-bar"
            role="progressbar"
            aria-labelledby="usage-shared"
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
      </div>
      <p className="usage-reset" role="status">
        {error
          ? "No se pudo consultar tu uso ahora."
          : open
            ? `Se reinicia en ${formatResetIn(ends - now)}.`
            : "Aún no has empezado una ventana de uso."}
      </p>
      {costs && <p className="usage-reset">{costs}</p>}
    </section>
  );
}
