"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { Orb } from "@/components/orb";
import { useDream } from "@/components/providers";
import { callDream, errorMessage } from "@/lib/dream-api";
import { getBanInfo, untilText, type BanInfo } from "@/lib/moderation";
import type { DreamProfile } from "@/lib/types";
import { AppealForm } from "./appeal-form";
import { CopyCode } from "./copy-code";
import { SupportChatButton } from "./support-chat-button";
import styles from "./moderation.module.css";

const CONTACT = "mailto:hellodream@edudream.es";

/**
 * Pantalla de baneo (B6). Sustituye a toda la app: una cuenta baneada solo puede
 * ver el motivo y la duración, apelar (chat de soporte con un código, o el
 * formulario «Reclamar») y borrar su cuenta. dream-api además rechaza en el
 * servidor cualquier otra acción, así que esto no es la barrera: es la
 * explicación. Tono amable y sin culpar.
 */
export function BanScreen({ ban }: { ban: NonNullable<DreamProfile["ban"]> }) {
  const { logout } = useDream();
  const [info, setInfo] = useState<BanInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(0);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setInfo(await getBanInfo());
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const reason = info?.ban?.reason;
  const until = untilText(info?.ban?.until ?? ban.until, info?.ban?.permanent ?? ban.permanent);

  function closeDelete() {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setDeleting(false);
      setLeaving(false);
      setConfirmText("");
      setError("");
    }, 120);
  }
  async function deleteAccount() {
    if (busy || confirmText.trim() !== "ELIMINAR") return;
    setBusy(true);
    setError("");
    try {
      await callDream("account_delete", { confirm: "ELIMINAR" });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      return;
    }
    await logout().catch(() => window.location.assign("/login"));
  }

  return (
    <main className={styles.screen} id="main">
      <div className={styles.card}>
        <Orb size={48} />
        <h1 className={styles.title}>Has sido baneado de la plataforma</h1>
        <p className={styles.lead}>
          Lo sentimos. Queremos que Dream sea un sitio seguro y justo para todo el mundo, y para eso a veces tenemos que tomar decisiones como esta.
        </p>

        <dl className={styles.facts}>
          <div>
            <dt>Motivo</dt>
            <dd>{reason ? `Las normas de uso piden ${reason} (Términos, §6).` : "Se ha aplicado una norma de uso de Dream (Términos, §6)."}</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{until.charAt(0).toUpperCase() + until.slice(1)}</dd>
          </div>
        </dl>

        <section className={styles.section} aria-labelledby="appeal-title">
          <h2 id="appeal-title">¿Crees que es un error?</h2>
          <p>Puedes apelar. Lo revisa una persona y te respondemos en un máximo de 30 días. Si nos equivocamos, quitamos el baneo.</p>
          {loadError ? (
            <>
              <p className="error" role="alert">
                {loadError}
              </p>
              <div className="button-row">
                <button className="secondary press" type="button" onClick={() => void load()}>
                  Reintentar
                </button>
              </div>
            </>
          ) : !info ? (
            <p role="status" className={styles.hint}>
              Cargando tu código…
            </p>
          ) : (
            <>
              <div className="button-row">
                <SupportChatButton />
              </div>
              {info.code && (
                <>
                  <CopyCode code={info.code} label="Tu código de apelación" />
                  <p className={styles.hint}>Pégalo en el chat para que podamos encontrar tu caso. Es aleatorio: no contiene datos personales.</p>
                </>
              )}
              {info.appeals.some((a) => a.status !== "abierta" && a.resolution) && (
                <p className={styles.hint}>Ya hemos respondido a alguna de tus reclamaciones: “{info.appeals.find((a) => a.status !== "abierta" && a.resolution)?.resolution}”.</p>
              )}
            </>
          )}
        </section>

        <section className={styles.section} aria-labelledby="claim-title">
          <h2 id="claim-title">Reclamar por escrito</h2>
          <p>Si prefieres escribirlo, cuéntanos qué ha pasado.</p>
          <AppealForm onSent={() => void load()} />
        </section>

        <section className={styles.section} aria-labelledby="data-title">
          <h2 id="data-title">Tus datos</h2>
          <p>
            Puedes borrar tu cuenta y todo lo que hay en ella. Para pedir una copia de tus datos, escríbenos a{" "}
            <a className="text-link" href={CONTACT}>
              hellodream@edudream.es
            </a>
            .
          </p>
          <div className="button-row">
            <button className="secondary press" type="button" onClick={() => setDeleting(true)}>
              Borrar mi cuenta
            </button>
            <button className="secondary press" type="button" onClick={() => void logout().catch(() => window.location.assign("/login"))}>
              Cerrar sesión
            </button>
          </div>
        </section>
      </div>

      {deleting && (
        <Modal variant="alert" leaving={leaving} labelledBy="ban-delete-title" describedBy="ban-delete-text" onClose={closeDelete}>
          <h2 id="ban-delete-title">¿Borrar tu cuenta?</h2>
          <p id="ban-delete-text">Se borrarán para siempre tu perfil, tus conversaciones, tus apuntes, tus exámenes y tus tests. No se puede deshacer.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <label className="field">
              <span>Escribe ELIMINAR para confirmar</span>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}{" "}
                <a className="text-link" href={CONTACT}>
                  Escríbenos
                </a>
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary press" onClick={closeDelete}>
                Cancelar
              </button>
              <button className="primary danger-button press" disabled={busy || confirmText.trim() !== "ELIMINAR"}>
                {busy ? "Eliminando…" : "Eliminar cuenta"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
