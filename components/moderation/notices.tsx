"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ackNotice, getNotices, isModerationBlock, limitText, type Notice } from "@/lib/moderation";
import styles from "./moderation.module.css";

interface Block {
  code: string;
  message: string;
}

/**
 * Avisos y limitaciones en vigor, y los bloqueos por uso anormal (429 con
 * mod_ip_blocked o mod_user_limited). Qué norma, hasta cuándo y cómo reclamar,
 * en tono amable y sin acusar. No se carga en Ajustes ni en el panel: vive
 * dentro de la app de siempre.
 */
export function ModerationNotices() {
  const [items, setItems] = useState<Notice[]>([]);
  const [block, setBlock] = useState<Block | null>(null);

  useEffect(() => {
    let alive = true;
    getNotices()
      .then((r) => alive && setItems(Array.isArray(r.items) ? r.items : []))
      .catch(() => {
        /* sin avisos: la app sigue igual */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ code: string; message: string }>).detail;
      if (detail && isModerationBlock(detail.code)) setBlock({ code: detail.code, message: detail.message });
    };
    window.addEventListener("dream:mod-limited", show);
    return () => window.removeEventListener("dream:mod-limited", show);
  }, []);

  const dismiss = useCallback(async (notice: Notice) => {
    setItems((all) => all.filter((n) => n.id !== notice.id));
    try {
      await ackNotice(notice.id);
    } catch {
      /* si no se guarda, volverá a salir: no pasa nada */
    }
  }, []);

  if (!items.length && !block) return null;
  return (
    <div className={styles.notices}>
      {block && (
        <section className={styles.notice} role="alert" aria-labelledby="mod-block-title" data-kind="block">
          <h2 id="mod-block-title">{block.code === "mod_ip_blocked" ? "Tu conexión está bloqueada un tiempo" : "Tu cuenta está limitada un tiempo"}</h2>
          <p>{block.message}</p>
          <div className={styles.noticeActions}>
            <Link className="primary press" href="/reclamar">
              Reclamar
            </Link>
            <button className="secondary press" type="button" onClick={() => setBlock(null)}>
              Entendido
            </button>
          </div>
        </section>
      )}
      {items.map((n) => (
        <section key={n.id} className={styles.notice} role="region" aria-label={n.kind === "limitacion" ? "Limitación de tu cuenta" : "Aviso"} data-kind={n.kind}>
          <h2>{n.kind === "limitacion" ? "Tu cuenta tiene una limitación" : "Un aviso amable"}</h2>
          <p>
            {n.kind === "limitacion"
              ? `Hemos limitado el uso de la IA ${limitText(n.until)}. `
              : "Este recordatorio no es una sanción. "}
            Las normas de uso piden {n.reason} (Términos, §6). Si crees que es un error, puedes reclamarlo.
          </p>
          <div className={styles.noticeActions}>
            <button className="primary press" type="button" onClick={() => void dismiss(n)}>
              Entendido
            </button>
            <Link className="secondary press" href="/reclamar">
              Reclamar
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}
