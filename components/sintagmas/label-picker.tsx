"use client";
// Etiqueta de una raya, junto a ella (prompt «sintagmas» §3 y §4).
// Fase fácil: chips, un clic y listo. Fase avanzada: un campo ya enfocado
// con autocompletado (al escribir «s» sugiere SN, SV…, con el nombre
// completo), las últimas etiquetas usadas encima, Tab/Intro para aceptar y
// Esc para cancelar. «Ver opciones» vuelve a los chips en esta frase.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  LABELS,
  displayLabel,
  fullName,
  normalizeLabel,
  suggestLabels,
} from "@/supabase/functions/dream-api/sintagmas.mjs";
import type { SyntaxLabel, SyntaxNames } from "@/lib/sintagmas";
import s from "./sintagmas.module.css";

export function LabelPicker({
  names,
  write,
  recent,
  current,
  onPick,
  onCancel,
  onDelete,
  onShowOptions,
}: {
  names: SyntaxNames;
  write: boolean;
  recent: SyntaxLabel[];
  current: SyntaxLabel | null;
  onPick: (label: SyntaxLabel) => void;
  onCancel: () => void;
  onDelete: () => void;
  onShowOptions: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input, button[data-chip]");
    first?.focus();
  }, [write]);
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }
  return (
    <div
      ref={ref}
      className={s.picker}
      role="group"
      aria-label="Etiqueta de la raya"
      onKeyDown={keys}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {write ? (
        <WriteLabel names={names} recent={recent} onPick={onPick} onShowOptions={onShowOptions} />
      ) : (
        <div className={s.chips}>
          {LABELS.map((label) => (
            <button
              key={label}
              type="button"
              data-chip=""
              className={`${s.chip} press`}
              aria-pressed={current === label}
              aria-label={`${displayLabel(label, names)}: ${fullName(label, names)}`}
              onClick={() => onPick(label)}
            >
              {displayLabel(label, names)}
            </button>
          ))}
        </div>
      )}
      <button type="button" className={s.pickerDelete} onClick={onDelete}>
        Borrar raya
      </button>
    </div>
  );
}

function WriteLabel({
  names,
  recent,
  onPick,
  onShowOptions,
}: {
  names: SyntaxNames;
  recent: SyntaxLabel[];
  onPick: (label: SyntaxLabel) => void;
  onShowOptions: () => void;
}) {
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const list = useId();
  const suggestions = value ? suggestLabels(value, names, recent).slice(0, 5) : [];
  function accept() {
    const label = suggestions[active] ?? normalizeLabel(value, names);
    if (label) onPick(label);
    else setError("No reconozco esa etiqueta. Prueba con SN, SV, SAdj…");
  }
  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length)
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (e.key === "Enter" || (e.key === "Tab" && value && suggestions.length)) {
      e.preventDefault();
      accept();
    }
  }
  return (
    <div className={s.write}>
      {recent.length > 0 && (
        <div className={s.recent} aria-label="Últimas etiquetas usadas" role="group">
          {recent.slice(0, 4).map((label) => (
            <button key={label} type="button" className={`${s.recentChip} press`} onClick={() => onPick(label)}>
              {displayLabel(label, names)}
            </button>
          ))}
        </div>
      )}
      <input
        className={s.labelInput}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setError("");
        }}
        onKeyDown={keys}
        placeholder="Escribe la etiqueta"
        aria-label="Escribe la etiqueta"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={suggestions.length ? `${list}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={30}
      />
      <ul id={list} role="listbox" className={s.suggestions} aria-label="Sugerencias">
        {suggestions.map((label, i) => (
          <li
            key={label}
            id={`${list}-${i}`}
            role="option"
            aria-selected={i === active}
            className={s.suggestion}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onPick(label)}
          >
            <b>{displayLabel(label, names)}</b>: {fullName(label, names)}
          </li>
        ))}
      </ul>
      {error && (
        <p className={s.inputError} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={s.showOptions} onClick={onShowOptions}>
        Ver opciones
      </button>
    </div>
  );
}
