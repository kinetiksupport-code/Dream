"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ADMIN_BAN_RULES,
  BAN_DURATIONS,
  adminCall,
  type Inbox,
  type InboxAppeal,
  type InboxSanction,
  type UserCard,
  type UserRef,
} from "@/lib/admin-api";
import { MfaGate } from "./mfa-gate";
import styles from "./panel.module.css";

/**
 * Bandeja del panel de administración. Todo el texto de los alumnos (apelaciones)
 * se pinta como texto de React: nunca como HTML. Solo ves el identificador corto
 * y el correo enmascarado de cada cuenta; ninguna IP, solo el prefijo de la huella.
 * Las acciones peligrosas piden un código reciente y una confirmación en dos pasos.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string | null | undefined) => (iso ? dayFormat.format(new Date(iso)) : "sin fecha");
const untilText = (iso: string | null) => (iso === null ? "permanente" : `hasta ${when(iso)}`);
const ruleName = (rule: string) => ADMIN_BAN_RULES[rule.split(":")[0]] ?? rule;

interface Pending {
  title: string;
  detail: string;
  token: string;
  run: (token: string) => Promise<void>;
}

export function PanelHome({ onLock }: { onLock: () => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [card, setCard] = useState<{ id: string; data: UserCard } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reauth, setReauth] = useState<null | (() => void)>(null);
  const [lookup, setLookup] = useState("");

  /** Llama al servidor y traduce los estados del panel (sesión caducada, código nuevo). */
  const call = useCallback(
    async (action: string, payload: Record<string, unknown> = {}, retry?: () => void) => {
      const reply = await adminCall(action, payload);
      const code = typeof reply.data?.code === "string" ? reply.data.code : "";
      if (reply.status === 403 && code === "session_expired") onLock();
      else if (reply.status === 403 && code === "reauth_required") setReauth(() => retry ?? null);
      else if (reply.status === 0 || reply.status === 401 || reply.status === 404 || (reply.status === 400 && !code)) onLock();
      return { ...reply, code };
    },
    [onLock],
  );

  const load = useCallback(async () => {
    const reply = await call("admin_inbox");
    if (reply.status === 200 && reply.data) setInbox(reply.data as unknown as Inbox);
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);

  const [found, setFound] = useState<InboxAppeal | null | undefined>(undefined);
  async function searchAppeal(code: string) {
    const reply = await call("admin_appeal_by_code", { code });
    if (reply.status !== 200 || !reply.data) return setMessage("Código no válido.");
    const appeal = (reply.data as { appeal: InboxAppeal | null }).appeal;
    setFound(appeal);
    setMessage(appeal ? "" : "No hay ninguna apelación con ese código.");
  }

  async function openCard(id: string | undefined) {
    if (!id || !UUID.test(id)) return setMessage("Identificador no válido.");
    const reply = await call("admin_user", { user_id: id });
    if (reply.status === 200 && reply.data) setCard({ id, data: reply.data as unknown as UserCard });
  }

  /** Ejecuta una acción; si es grave el servidor pide confirmar y se enseña el diálogo. */
  async function act(action: string, payload: Record<string, unknown>, ok: string, label: string) {
    const attempt = async (token?: string) => {
      const reply = await call(action, token ? { ...payload, confirm_token: token } : payload, () => void attempt(token));
      if (reply.status === 200 && reply.data?.needs_confirmation === true) {
        const confirmToken = String(reply.data.confirm_token);
        setPending({ title: label, detail: "Esta acción es difícil de deshacer. Compruébala antes de confirmar.", token: confirmToken, run: async (t) => void (await attempt(t)) });
        return;
      }
      setPending(null);
      setMessage(reply.status === 200 ? ok : "No se pudo completar. Revisa los datos e inténtalo de nuevo.");
      if (reply.status === 200) {
        await load();
        if (card) await openCard(card.id);
      }
    };
    await attempt();
  }

  if (reauth)
    return (
      <MfaGate
        fresh={false}
        onDone={() => {
          const again = reauth;
          setReauth(null);
          again?.();
        }}
      />
    );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Panel de administración</h1>
        <div className={styles.headerActions}>
          <button className={styles.secondary} type="button" onClick={() => void load()}>
            Actualizar
          </button>
          <button className={styles.secondary} type="button" onClick={onLock}>
            Cerrar el panel
          </button>
        </div>
      </header>
      <p role="status" aria-live="polite" className={styles.status}>
        {message}
      </p>

      <form
        className={styles.lookup}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const value = lookup.trim();
          if (/^dream-/i.test(value)) void searchAppeal(value);
          else void openCard(value);
        }}
      >
        <label className={styles.field}>
          <span>Código de apelación (DREAM-XXXX-XXXX) o identificador completo de una cuenta</span>
          <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="DREAM-K7QM-2XPD" spellCheck={false} />
        </label>
        <button className={styles.secondary} type="submit">
          Abrir
        </button>
      </form>

      {found && (
        <section className={styles.section} aria-label="Apelación encontrada">
          <h2>Apelación encontrada</h2>
          <Card who={found} onOpen={() => void openCard(found.user_id)}>
            <p className={styles.meta}>Estado: {found.status} · plazo hasta {when(found.due_at)}</p>
            <blockquote className={styles.quote}>{found.body}</blockquote>
            <Actions>
              <button className={styles.secondary} type="button" onClick={() => void act("admin_appeal_resolve", { id: found.id, status: "aceptada", resolution: "Aceptada" }, "Apelación aceptada.", "Aceptar apelación")}>
                Aceptar
              </button>
              <button className={styles.secondary} type="button" onClick={() => void act("admin_appeal_resolve", { id: found.id, status: "rechazada", resolution: "Rechazada" }, "Apelación rechazada.", "Rechazar apelación")}>
                Rechazar
              </button>
            </Actions>
          </Card>
        </section>
      )}
      {!inbox ? (
        <p>Cargando solicitudes…</p>
      ) : (
        <div className={styles.grid}>
          <Section title="Apelaciones y reclamaciones" count={inbox.appeals.length} empty="No hay apelaciones abiertas.">
            {inbox.appeals.map((a) => (
              <Card key={a.id} who={a} onOpen={() => void openCard(a.user_id)}>
                <p className={styles.meta}>Plazo: {a.days_left ?? "—"} días de 30</p>
                <blockquote className={styles.quote}>{a.body}</blockquote>
                <Actions>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_appeal_resolve", { id: a.id, status: "aceptada", resolution: "Aceptada" }, "Apelación aceptada.", "Aceptar apelación")}>
                    Aceptar
                  </button>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_appeal_resolve", { id: a.id, status: "rechazada", resolution: "Rechazada" }, "Apelación rechazada.", "Rechazar apelación")}>
                    Rechazar
                  </button>
                </Actions>
              </Card>
            ))}
          </Section>

          <Section title="Baneos propuestos" count={inbox.proposals.length} empty="Nada que confirmar.">
            {inbox.proposals.map((p) => (
              <SanctionCard key={p.id} p={p} onOpen={() => void openCard(p.user_id)}>
                <Actions>
                  <button className={styles.primary} type="button" onClick={() => void act("admin_sanction_resolve", { id: p.id, action_type: "confirmar" }, "Sanción confirmada.", "Confirmar sanción")}>
                    Confirmar
                  </button>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_sanction_resolve", { id: p.id, action_type: "bajar_a_aviso" }, "Bajada a aviso.", "Bajar a aviso")}>
                    Bajar a aviso
                  </button>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_sanction_resolve", { id: p.id, action_type: "levantar" }, "Propuesta descartada.", "Descartar")}>
                    Descartar
                  </button>
                </Actions>
              </SanctionCard>
            ))}
          </Section>

          <Section title="Cuentas en observación" count={inbox.observations.length} empty="Ninguna cuenta en observación.">
            {inbox.observations.map((o) => (
              <Card key={o.id} who={o} onOpen={() => void openCard(o.user_id)}>
                <p className={styles.meta}>
                  {o.status === "revision_pendiente" ? "Red compartida: decide una persona" : "Observando"} · {o.entries} entradas · hasta {when(o.ends_at)} · huella {o.ip_prefix}…
                </p>
              </Card>
            ))}
          </Section>

          <Section title="Baneos activos" count={inbox.active_bans.length} empty="No hay cuentas baneadas.">
            {inbox.active_bans.map((b) => (
              <SanctionCard key={b.id} p={b} onOpen={() => void openCard(b.user_id)}>
                <Actions>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_ban_lift", { user_id: b.user_id }, "Baneo levantado.", "Levantar baneo")}>
                    Levantar baneo
                  </button>
                </Actions>
              </SanctionCard>
            ))}
          </Section>

          <Section title="Bloqueos de IP (24 h)" count={inbox.ip_blocks.length} empty="Ninguna conexión bloqueada.">
            {inbox.ip_blocks.map((b) => (
              <article key={b.ip_prefix + b.until} className={styles.card}>
                <p className={styles.who}>Huella {b.ip_prefix}…</p>
                <p className={styles.meta}>
                  {ruleName(b.rule)} · hasta {when(b.until)}
                </p>
                <Actions>
                  <button className={styles.secondary} type="button" onClick={() => void act("admin_ip_unblock", { ip_prefix: b.ip_prefix }, "Bloqueo quitado.", "Quitar bloqueo")}>
                    Quitar bloqueo
                  </button>
                </Actions>
              </article>
            ))}
          </Section>

          <Section title="Eventos graves (14 días)" count={inbox.events.length} empty="Sin eventos graves.">
            {inbox.events.map((e, i) => (
              <Card key={`${e.user_id}-${e.created_at}-${i}`} who={e} onOpen={() => void openCard(e.user_id)}>
                <p className={styles.meta}>
                  {ruleName(e.rule)} · {e.origin} · {when(e.created_at)}
                </p>
              </Card>
            ))}
          </Section>
        </div>
      )}

      {card && <UserDialog card={card.data} id={card.id} onClose={() => setCard(null)} act={act} />}
      {pending && (
        <div className={styles.scrim} role="presentation">
          <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-detail">
            <h2 id="confirm-title">Confirmar: {pending.title}</h2>
            <p id="confirm-detail">{pending.detail}</p>
            <Actions>
              <button className={styles.danger} type="button" onClick={() => void pending.run(pending.token)} autoFocus>
                Sí, confirmar
              </button>
              <button className={styles.secondary} type="button" onClick={() => setPending(null)}>
                Cancelar
              </button>
            </Actions>
          </div>
        </div>
      )}
    </main>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2>
        {title} <span className={styles.count}>{count}</span>
      </h2>
      {count === 0 ? <p className={styles.empty}>{empty}</p> : <div className={styles.list}>{children}</div>}
    </section>
  );
}
const Actions = ({ children }: { children: ReactNode }) => <div className={styles.actions}>{children}</div>;
function Card({ who, onOpen, children }: { who: UserRef; onOpen: () => void; children: ReactNode }) {
  return (
    <article className={styles.card}>
      <p className={styles.who}>
        <button type="button" className={styles.link} onClick={onOpen}>
          {who.user_email ?? "(sin datos)"} · {who.user_short}
        </button>
      </p>
      {children}
    </article>
  );
}
function SanctionCard({ p, onOpen, children }: { p: InboxSanction; onOpen: () => void; children: ReactNode }) {
  return (
    <Card who={p} onOpen={onOpen}>
      <p className={styles.meta}>
        {p.kind === "baneo" ? "Baneo" : p.kind === "limitacion" ? "Limitación" : "Aviso"} · {ruleName(p.rule)} · {untilText(p.until)} · propone: {p.decided_by}
      </p>
      {children}
    </Card>
  );
}

function UserDialog({ card, id, onClose, act }: { card: UserCard; id: string; onClose: () => void; act: (a: string, p: Record<string, unknown>, ok: string, label: string) => Promise<void> }) {
  const [rule, setRule] = useState("G-SPAM");
  const [duration, setDuration] = useState("7d");
  return (
    <div className={styles.scrim} role="presentation">
      <div className={`${styles.dialog} ${styles.wide}`} role="dialog" aria-modal="true" aria-labelledby="user-title">
        <h2 id="user-title">
          {card.user_email} · {card.user_short}
        </h2>
        <p className={styles.meta}>{card.ban.banned ? `Baneada (${card.ban.rule ?? ""}) ${untilText(card.ban.until ?? null)}` : "Sin baneo activo"}</p>

        <h3>Sanciones</h3>
        <ul className={styles.plain}>
          {card.sanctions.length === 0 && <li>Ninguna.</li>}
          {card.sanctions.map((s) => (
            <li key={s.id}>
              {s.kind} · {ruleName(s.rule)} · {untilText(s.until)} · {s.decided_by} · {when(s.created_at)}
            </li>
          ))}
        </ul>
        <h3>Eventos</h3>
        <ul className={styles.plain}>
          {card.events.length === 0 && <li>Ninguno.</li>}
          {card.events.map((e, i) => (
            <li key={i}>
              {ruleName(e.rule)} · {e.origin} · {e.severity} · {when(e.created_at)}
            </li>
          ))}
        </ul>
        <h3>Apelaciones</h3>
        <ul className={styles.plain}>
          {card.appeals.length === 0 && <li>Ninguna.</li>}
          {card.appeals.map((a) => (
            <li key={a.id}>
              {when(a.created_at)} · <q>{a.body}</q>
            </li>
          ))}
        </ul>

        <h3>Banear a mano</h3>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Norma de la tabla G</span>
            <select value={rule} onChange={(e) => setRule(e.target.value)}>
              {Object.entries(ADMIN_BAN_RULES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Duración</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {BAN_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Actions>
          <button className={styles.danger} type="button" onClick={() => void act("admin_ban_user", { user_id: id, rule, duration }, "Cuenta baneada.", `Ban user · ${duration === "permanent" ? "permanente" : duration}`)}>
            Ban user
          </button>
          <button className={styles.secondary} type="button" onClick={() => void act("admin_ban_lift", { user_id: id }, "Baneo levantado.", "Levantar baneo")}>
            Levantar baneo
          </button>
          <button className={styles.secondary} type="button" onClick={() => void act("admin_ip_block_user", { user_id: id }, "Conexión bloqueada 24 h.", "Bloquear IP 24 h")}>
            Bloquear su conexión 24 h
          </button>
          <button className={styles.secondary} type="button" onClick={onClose} autoFocus>
            Cerrar
          </button>
        </Actions>
      </div>
    </div>
  );
}
