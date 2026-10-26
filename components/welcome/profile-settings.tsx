"use client";
// Ajustes › Perfil y Privacidad (prompt «bienvenida» §4.2): lo que se eligió
// en la bienvenida (nombre, apodo y aficiones) se cambia aquí, y el permiso de
// la IA se puede retirar (la cuenta se queda sin chat, docs/CONSENTIMIENTO.md
// §5). Solo aparece cuando dream-api envía los campos nuevos.
import { useId, useState, type FormEvent } from "react";
import { Modal } from "../modal";
import { AlertIcon, CheckIcon } from "../icons";
import { useDream } from "../providers";
import { errorMessage, saveOnboarding, withdrawConsent } from "@/lib/dream-api";
import { CONSENT_TEXT } from "@/lib/consent";
import {
  INTERESTS,
  LIMITS,
  addInterest,
  clean,
  nameError,
  nicknameFor,
  toggleInterest,
} from "@/lib/onboarding";
import s from "./welcome.module.css";

const EXIT_MS = 120;

/** Rows under Perfil, plus the edit sheet. */
export function WelcomeProfile() {
  const { profile, refreshProfile } = useDream();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!profile || profile.nickname === undefined) return null;

  const current = profile.interests ?? [];
  const shown = nicknameFor(profile.nickname ?? "", profile.display_name ?? "");
  const problem = tried ? nameError(name) : null;
  const full = interests.length >= LIMITS.interests;
  const options = [...INTERESTS, ...interests.filter((x) => !(INTERESTS as readonly string[]).includes(x))];

  function edit() {
    setName(profile?.display_name ?? "");
    setNickname(profile?.nickname ?? "");
    setInterests(current);
    setCustom("");
    setTried(false);
    setError("");
    setLeaving(false);
    setOpen(true);
  }
  function close() {
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, EXIT_MS);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (nameError(name) || busy) {
      if (nameError(name)) document.getElementById(`${id}-name`)?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const display_name = clean(name, LIMITS.name);
      await saveOnboarding({ display_name, nickname: nicknameFor(nickname, display_name), interests });
      await refreshProfile();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <dl className="group-list">
        <div className="group-row">
          <dt>Cómo te llama la IA</dt>
          <dd className="value">{shown || "Por tu nombre"}</dd>
        </div>
        <div className="group-row">
          <dt>Lo que te gusta</dt>
          <dd className={`value ${s.interestsValue}`}>{current.length ? current.join(", ") : "Nada elegido"}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button type="button" className="secondary press" onClick={edit}>
          Cambiar nombre, apodo y gustos
        </button>
      </div>
      {open && (
        <Modal labelledBy={`${id}-title`} onClose={close} leaving={leaving}>
          <h2 id={`${id}-title`}>Tu perfil en Dream</h2>
          <form className={`${s.editForm} ${s.plain}`} onSubmit={(e) => void save(e)} noValidate>
            <label className={s.label} htmlFor={`${id}-name`}>
              Nombre
            </label>
            <input
              id={`${id}-name`}
              className={s.input}
              value={name}
              maxLength={LIMITS.name}
              autoComplete="given-name"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${id}-name-error` : undefined}
            />
            {problem && (
              <p className={s.inlineError} id={`${id}-name-error`}>
                <AlertIcon size={18} />
                <span>{problem}</span>
              </p>
            )}
            <label className={s.label} htmlFor={`${id}-nick`}>
              Cómo quieres que te llame la IA
            </label>
            <input
              id={`${id}-nick`}
              className={s.input}
              value={nickname}
              maxLength={LIMITS.nickname}
              autoComplete="nickname"
              placeholder={nicknameFor("", name)}
              onChange={(e) => setNickname(e.target.value)}
            />
            <p className={s.label} id={`${id}-likes`}>
              Lo que te gusta <span className="num">({interests.length} de {LIMITS.interests})</span>
            </p>
            <div className={s.chips} role="group" aria-labelledby={`${id}-likes`}>
              {options.map((item) => {
                const on = interests.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${s.chip} press`}
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => setInterests(toggleInterest(interests, item))}
                  >
                    {item}
                    <span className={s.chipTick} aria-hidden="true">
                      <CheckIcon size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={s.addForm}>
              <label className="visually-hidden" htmlFor={`${id}-custom`}>
                Añadir otra cosa que te guste
              </label>
              <input
                id={`${id}-custom`}
                className={s.input}
                value={custom}
                maxLength={LIMITS.interest}
                placeholder="Añadir otra"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  setInterests(addInterest(interests, custom));
                  setCustom("");
                }}
              />
              <button
                type="button"
                className="secondary press"
                disabled={full || !clean(custom, LIMITS.interest)}
                onClick={() => {
                  setInterests(addInterest(interests, custom));
                  setCustom("");
                }}
              >
                Añadir
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary press" onClick={close}>
                Cancelar
              </button>
              <button className="primary press" disabled={busy} aria-busy={busy || undefined}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Ajustes › Privacidad: «Enviar mi información a proveedores de IA». */
export function AiPermission() {
  const { profile, refreshProfile } = useDream();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!profile || profile.ai_consent_at === undefined) return null;
  const on = !!profile.ai_consent_at;

  function close() {
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, EXIT_MS);
  }
  async function withdraw() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await withdrawConsent();
      await refreshProfile();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="group-list">
        <div className="group-row">
          <span className="row-text">
            <strong>Enviar mi información a proveedores de IA</strong>
            <small>{on ? "Activado. Sin este permiso no puedes usar el chat." : "Retirado. Dream no puede responderte."}</small>
          </span>
          {on && (
            <button
              type="button"
              className="secondary press"
              onClick={() => {
                setError("");
                setLeaving(false);
                setOpen(true);
              }}
            >
              Retirar
            </button>
          )}
        </div>
      </div>
      {open && (
        <Modal variant="alert" labelledBy="ai-withdraw-title" describedBy="ai-withdraw-text" onClose={close} leaving={leaving}>
          <h2 id="ai-withdraw-title">¿Retirar el permiso?</h2>
          <p id="ai-withdraw-text">
            Sin este permiso no podrás usar el chat, los apuntes ni los exámenes. Tus datos se conservan hasta
            que los borres. Para volver a usar Dream tendrás que marcar otra vez: «{CONSENT_TEXT.ai}».
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary press" autoFocus onClick={close}>
              Cancelar
            </button>
            <button type="button" className="primary danger-button press" disabled={busy} onClick={() => void withdraw()}>
              {busy ? "Retirando…" : "Retirar permiso"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
