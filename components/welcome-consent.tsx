"use client";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Orb } from "./orb";
import { Sticker } from "./sticker";
import { AlertIcon, CheckIcon } from "./icons";
import { useDream } from "./providers";
import { errorMessage, saveConsent } from "@/lib/dream-api";
import {
  CONSENT_FIELDS,
  CONSENT_TEXT,
  GUARDIAN_AGE,
  ageOn,
  isoDate,
  validateConsent,
  type ConsentErrors,
  type ConsentField,
} from "@/lib/consent";
import s from "./welcome-consent.module.css";

/**
 * Welcome step after the first Google sign-in (Parte D). It replaces the app
 * (chat, apuntes, exámenes…) until the server records the consent; only
 * Ajustes stays reachable so the student can still sign out or delete data.
 * Nothing is ticked in advance.
 */
export function WelcomeConsent() {
  const { refreshProfile, logout } = useDream();
  const id = useId();
  const ids: Record<ConsentField, string> = {
    birthDate: `${id}-birth`,
    guardian: `${id}-guardian`,
    ai: `${id}-ai`,
  };
  const [birthDate, setBirthDate] = useState("");
  const [guardian, setGuardian] = useState(false);
  const [ai, setAi] = useState(false);
  const [errors, setErrors] = useState<ConsentErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const today = useMemo(() => isoDate(new Date()), []);
  const age = birthDate ? ageOn(birthDate) : null;
  const minor = age !== null && age < GUARDIAN_AGE;

  // After the first attempt, errors follow every change (apple-design
  // entering-data.md › Dynamically validate field values).
  function update(next: { birthDate?: string; guardian?: boolean; ai?: boolean }) {
    const value = { birthDate, guardian, ai, ...next };
    const nextAge = value.birthDate ? ageOn(value.birthDate) : null;
    // The guardian box disappears for 14+ and comes back unticked.
    if (nextAge === null || nextAge >= GUARDIAN_AGE) value.guardian = false;
    setBirthDate(value.birthDate);
    setGuardian(value.guardian);
    setAi(value.ai);
    if (submitted) setErrors(validateConsent(value));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const found = validateConsent({ birthDate, guardian, ai });
    setErrors(found);
    const first = CONSENT_FIELDS.find((f) => found[f]);
    if (first) {
      form.current
        ?.querySelector<HTMLInputElement>(`#${CSS.escape(ids[first])}`)
        ?.focus();
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      await saveConsent({
        birth_date: birthDate,
        guardian_confirmed: minor && guardian,
        ai_consent: ai,
      });
      await refreshProfile();
    } catch (e) {
      setSaveError(errorMessage(e));
      setBusy(false);
    }
  }

  const fieldError = (field: ConsentField) =>
    errors[field] ? (
      <p className={s.fieldError} id={`${ids[field]}-error`}>
        <AlertIcon size={18} />
        <span>{errors[field]}</span>
      </p>
    ) : null;
  const described = (field: ConsentField, hint?: string) =>
    [hint, errors[field] ? `${ids[field]}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  const option = (
    field: "guardian" | "ai",
    checked: boolean,
    onChange: (value: boolean) => void,
    text: string,
  ) => (
    <div className={s.optionWrap}>
      <label
        className={`press ${s.option}`}
        data-invalid={errors[field] ? "true" : undefined}
      >
        <span className={s.control}>
          <input
            id={ids[field]}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={errors[field] ? true : undefined}
            aria-describedby={described(field)}
            required
          />
          <span className={s.box} aria-hidden="true">
            <CheckIcon size={16} />
          </span>
        </span>
        <span className={s.optionText}>{text}</span>
      </label>
      {fieldError(field)}
    </div>
  );

  return (
    <main className={s.welcome}>
      <form ref={form} className={s.card} onSubmit={submit} noValidate>
        {/* The mascot on its yellow sticker (decorative). */}
        <span className={s.mascot} aria-hidden="true">
          <Sticker shape="round" tone="yellow" size={88} tilt={-6}>
            <Orb size={54} breathing />
          </Sticker>
        </span>
        <div className={s.heading}>
          <h1 className="hero-title">Antes de empezar</h1>
          <p>Dos pasos y ya puedes estudiar con Dream.</p>
        </div>

        <div className={s.field}>
          <label htmlFor={ids.birthDate}>Fecha de nacimiento</label>
          <p className={s.hint} id={`${ids.birthDate}-hint`}>
            Sirve para saber si necesitas el permiso de tu familia. No la
            usamos para nada más.
          </p>
          <input
            id={ids.birthDate}
            type="date"
            className={s.date}
            value={birthDate}
            min="1900-01-01"
            max={today}
            autoComplete="bday"
            onChange={(e) => update({ birthDate: e.target.value })}
            aria-invalid={errors.birthDate ? true : undefined}
            aria-describedby={described("birthDate", `${ids.birthDate}-hint`)}
            required
          />
          {fieldError("birthDate")}
        </div>

        <fieldset className={s.options}>
          <legend className={s.legend}>Para usar Dream</legend>
          {minor &&
            option(
              "guardian",
              guardian,
              (v) => update({ guardian: v }),
              CONSENT_TEXT.guardian,
            )}
          {option("ai", ai, (v) => update({ ai: v }), CONSENT_TEXT.ai)}
        </fieldset>

        <p className={s.legal}>
          Lee los{" "}
          <Link href="/terminos" target="_blank" rel="noopener">
            Términos y condiciones
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" target="_blank" rel="noopener">
            Política de privacidad
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </Link>
          .
        </p>

        {saveError && (
          <div role="alert" className={s.saveError}>
            <AlertIcon size={20} />
            <div>
              <p>{saveError}</p>
              <button type="submit" className={`press secondary ${s.retry}`}>
                Volver a intentarlo
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          className={`button-3d ${s.submit}`}
          aria-busy={busy}
          aria-disabled={busy || undefined}
        >
          <span className="button-3d-face">
            {busy ? "Guardando…" : "Empezar"}
          </span>
        </button>
        <button
          type="button"
          className={`press text-button ${s.exit}`}
          onClick={() => void logout().catch(() => {})}
        >
          Salir
        </button>
      </form>
    </main>
  );
}
