"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./moderation.module.css";

/** Un código para copiar: aleatorio, sin datos personales. */
export function CopyCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className={styles.code}>
      <span className={styles.codeLabel}>{label}</span>
      <div className={styles.codeRow}>
        <code className={styles.codeValue} data-testid="appeal-code">
          {code}
        </code>
        <button className="secondary press" type="button" onClick={() => void copy()} aria-label={`Copiar el código ${code}`}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {failed && (
        <p className={styles.hint} role="status">
          No se pudo copiar. Selecciónalo y cópialo a mano.
        </p>
      )}
    </div>
  );
}
