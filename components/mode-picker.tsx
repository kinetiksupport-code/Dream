"use client";
import { useId } from "react";
import {
  clockTime,
  modeHint,
  type AiModeId,
  type AiUsage,
} from "@/lib/ai-modes";

/** Selector del modo de respuesta. Radios nativos: flechas, Tab y lectores de pantalla funcionan solos. */
export function ModePicker({
  usage,
  value,
  onChange,
  disabled = false,
}: {
  usage: AiUsage;
  value: AiModeId;
  onChange: (mode: AiModeId) => void;
  disabled?: boolean;
}) {
  const name = useId();
  if (usage.modes.length < 2) return null;
  return (
    <fieldset className="mode-picker" disabled={disabled}>
      <legend className="visually-hidden">Modo de respuesta</legend>
      {usage.modes.map((m) => {
        const note = m.blocked
          ? `agotado${m.resets_at ? ` hasta las ${clockTime(m.resets_at)}` : ""}`
          : modeHint(m);
        return (
          <label
            key={m.id}
            className="mode-option"
            data-blocked={m.blocked || undefined}
            title={note}
          >
            <input
              type="radio"
              name={name}
              value={m.id}
              checked={value === m.id}
              disabled={m.blocked && value !== m.id}
              onChange={() => onChange(m.id)}
            />
            {m.label}
            <span className="visually-hidden">, {note}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
