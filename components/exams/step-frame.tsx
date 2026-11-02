"use client";
// Pantalla completa para hacer cosas (0.3 · 5 y 0.7 del prompt de la ruta;
// PantallaSimulacroMovil/Escritorio y PantallaTestMovil de Claude Design):
// X para salir con confirmación, una barra de progreso, el contador (que
// abre las preguntas en una hoja) y el reloj solo si hay tiempo. Sin panel
// lateral ni tarjetas de ayuda. Menos interfaz, no un «modo foco».
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Modal } from "../modal";
import s from "./step-frame.module.css";
import { clockText } from "@/lib/study-steps";

export { clockText };


export function StepFrame({
  label,
  position,
  total,
  remaining,
  warning,
  onCounter,
  onExit,
  children,
  footer,
  extra,
}: {
  /** Un control pequeño a la derecha de la cabecera (p. ej. «1 fuente»). */
  extra?: ReactNode;
  /** Nombre de lo que se hace, para el lector de pantalla («Simulacro»). */
  label: string;
  position: number;
  total: number;
  /** Segundos que quedan, o null sin límite de tiempo. */
  remaining: number | null;
  warning?: boolean;
  /** El contador abre la lista de preguntas (hoja). */
  onCounter?: () => void;
  /** Salir (ya confirmado): guarda y vuelve. */
  onExit: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  // El contador cambia con un fundido corto (0.8 · 7): la clave lo vuelve a montar.
  const counter = (
    <span className={s.count} key={position}>
      <span className="num">{position}</span> / <span className="num">{total}</span>
    </span>
  );
  return (
    <div className={s.frame} data-testid="step-frame">
      <header className={s.top}>
        <button type="button" className={`${s.close} press`} aria-label={`Salir del ${label.toLowerCase()}`} onClick={() => setAsking(true)}>
          <X size={20} aria-hidden="true" />
        </button>
        <div
          className={s.bar}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-valuetext={`Pregunta ${position} de ${total}`}
        >
          <span className={s.fill} style={{ transform: `scaleX(${total ? position / total : 0})` }} />
        </div>
        {onCounter ? (
          <button type="button" className={`${s.counter} press`} aria-label={`Preguntas: ${position} de ${total}`} onClick={onCounter}>
            {counter}
          </button>
        ) : (
          <span className={s.counter}>{counter}</span>
        )}
        {extra}
        {remaining !== null && (
          <span className={s.clock} role="timer" data-warning={warning || undefined} aria-label={`Quedan ${clockText(remaining)}`}>
            {clockText(remaining)}
          </span>
        )}
      </header>
      <main className={s.body}>{children}</main>
      <footer className={s.foot}>{footer}</footer>
      {asking && (
        <Modal labelledBy="salir-paso" onClose={() => setAsking(false)}>
          <h2 id="salir-paso">¿Salir?</h2>
          <p>Tu progreso se guarda. Puedes seguir luego donde lo dejaste.</p>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={onExit}>
              Salir
            </button>
            <button type="button" className="primary press" autoFocus onClick={() => setAsking(false)}>
              Quedarme
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
