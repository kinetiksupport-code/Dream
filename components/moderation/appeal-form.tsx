"use client";
import { useId, useState, type FormEvent } from "react";
import { APPEAL_DEADLINE_DAYS, APPEAL_MAX_CHARS, sendAppeal } from "@/lib/moderation";
import { errorMessage } from "@/lib/dream-api";
import { CopyCode } from "./copy-code";
import styles from "./moderation.module.css";

/**
 * «Reclamar»: formulario breve que crea una reclamación (mod_appeals). La
 * respuesta llega en un máximo de 30 días, como dicen los Términos (§6.G). Sirve
 * tanto en la pantalla de baneo como para una limitación o un bloqueo.
 */
export function AppealForm({ onSent }: { onSent?: () => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ code: string } | null>(null);
  const left = APPEAL_MAX_CHARS - text.length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await sendAppeal(text.trim());
      setSent({ code: result.code });
      setText("");
      onSent?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className={styles.sent} role="status">
        <h3>Reclamación enviada</h3>
        <p>
          Gracias por contárnoslo. Lo revisará una persona y te responderemos en un máximo de {APPEAL_DEADLINE_DAYS} días.
        </p>
        <CopyCode code={sent.code} label="Código de tu reclamación" />
      </div>
    );

  return (
    <form className={styles.form} onSubmit={submit} aria-describedby={`${id}-help`}>
      <label className="field" htmlFor={`${id}-text`}>
        <span>Cuéntanos qué ha pasado</span>
        <textarea
          id={`${id}-text`}
          className={styles.textarea}
          value={text}
          maxLength={APPEAL_MAX_CHARS}
          rows={5}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </label>
      <p id={`${id}-help`} className={styles.hint}>
        Quedan {left} caracteres. No escribas contraseñas ni datos de otras personas. Respondemos en un máximo de {APPEAL_DEADLINE_DAYS} días.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary press" type="submit" disabled={busy || !text.trim()} aria-busy={busy || undefined}>
          {busy ? "Enviando…" : "Enviar reclamación"}
        </button>
      </div>
    </form>
  );
}
