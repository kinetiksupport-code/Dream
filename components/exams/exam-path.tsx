"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  CircleDot,
  Flag,
  Gauge,
  ListChecks,
  RotateCcw,
  Share2,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  daysUntil,
  examDateLabel,
  getExam,
  sessionPath,
  updateExam,
  type DreamExam,
  type ExamSession,
} from "@/lib/exam-plans";
import { useOnline } from "@/lib/use-online";
import {
  buildRoute,
  nodeAccessibleName,
  paceStatus,
  pathAnnouncement,
  shareProgress,
  shareText,
  studyPath,
  TYPE_LABELS,
  type PaceKind,
  type PathNodeState,
  type RouteViewNode,
} from "@/lib/study-path";
import {
  dayDiff,
  localToday,
  type RouteChange,
  type RouteNodeType,
} from "@/supabase/functions/dream-api/route-plan.mjs";
import { DreamActivity } from "../dream-mark";
import { Modal } from "../modal";
import { Toast } from "../toast";
import { ExamFrame, ExamLoad, ErrorNotice, ProgressLine, useExam } from "./exam-ui";
import styles from "./route.module.css";

const TYPE_ICONS: Record<RouteNodeType, LucideIcon> = {
  study: BookOpen,
  practice: ListChecks,
  review: RotateCcw,
  mock: Flag,
};
const STATE_ICONS: Record<PathNodeState, LucideIcon> = {
  completed: Check,
  next: ArrowRight,
  in_progress: CircleDot,
  pending: Circle,
};
const PACE_ICONS: Record<PaceKind, LucideIcon> = {
  no_date: AlertTriangle,
  past: Flag,
  today: Flag,
  done: Check,
  good: Check,
  tight: Gauge,
  late: AlertTriangle,
};

function daysText(days: number | null) {
  if (days === null) return "Sin fecha";
  if (days < 0) return "Examen pasado";
  if (days === 0) return "Es hoy";
  if (days === 1) return "Es mañana";
  return `Faltan ${days} días`;
}

/** Anillo de dominio del tema (aciertos en tests). Vacío si no hay datos. */
function MasteryRing({ node }: { node: RouteViewNode }) {
  if (!node.topic) return null;
  const value = node.mastery?.percentage ?? 0;
  const c = 2 * Math.PI * 15;
  return (
    <span className={styles.mastery} data-empty={!node.mastery}>
      <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
        <circle className={styles.ringTrack} cx="18" cy="18" r="15" />
        {node.mastery && (
          <circle
            className={styles.ringValue}
            cx="18"
            cy="18"
            r="15"
            strokeDasharray={`${(value / 100) * c} ${c}`}
          />
        )}
      </svg>
      <small className={styles.num}>
        {node.mastery ? `${value} %` : "sin datos aún"}
      </small>
    </span>
  );
}

function RouteStep({
  node,
  index,
  highlighted,
  onOpen,
}: {
  node: RouteViewNode;
  index: number;
  highlighted: boolean;
  onOpen: (node: RouteViewNode) => void;
}) {
  const TypeIcon = TYPE_ICONS[node.type];
  const StateIcon = STATE_ICONS[node.state];
  return (
    <li
      className={styles.step}
      data-state={node.state}
      data-type={node.type}
      data-side={index % 2 ? "left" : "right"}
      data-highlight={highlighted || undefined}
      aria-current={node.state === "next" ? "step" : undefined}
    >
      <span className={styles.trail} aria-hidden="true">
        <span className={styles.trailFill} />
      </span>
      <button
        type="button"
        className={`${styles.node} press`}
        aria-label={nodeAccessibleName(node)}
        aria-haspopup="dialog"
        onClick={() => onOpen(node)}
      >
        <span className={styles.marker} aria-hidden="true">
          <TypeIcon className={styles.typeIcon} size={20} />
          <span className={styles.checkMask}>
            <span className={styles.checkInner}>
              <Check size={22} strokeWidth={3} />
            </span>
          </span>
        </span>
        <span className={styles.body}>
          <span className={styles.meta}>
            {TYPE_LABELS[node.type]}
            {node.when && (
              <>
                {" · "}
                <b className={styles.when}>{node.when}</b>
              </>
            )}
          </span>
          <strong className={styles.title}>{node.title}</strong>
          <span className={styles.detail}>
            {node.topic && node.type === "study" ? `${node.topic} · ` : ""}
            <span className={styles.num}>{node.minutes} min</span>
          </span>
          <span className={styles.state}>
            <StateIcon size={14} aria-hidden="true" />
            {node.label}
            {node.state === "next" && node.unit?.status === "in_progress"
              ? " · Ya la empezaste"
              : ""}
            {highlighted && node.state !== "completed" ? " · Recomendado" : ""}
          </span>
        </span>
        <MasteryRing node={node} />
      </button>
    </li>
  );
}

function changeText(change: RouteChange, titles: Map<string, string>) {
  const what = `${TYPE_LABELS[change.type]}${change.unit_id && titles.get(change.unit_id) ? `: ${titles.get(change.unit_id)}` : ""}`;
  const date = (d?: string | null) => (d ? examDateLabel(d, true) : "sin fecha");
  if (change.kind === "moved")
    return `${what}: del ${date(change.from)} al ${date(change.to)}`;
  if (change.kind === "added") return `${what}: nuevo el ${date(change.to)}`;
  return `${what}: ya no hace falta`;
}

function useToday() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localToday()), []);
  return today;
}

export function ExamPath({ id }: { id: string }) {
  const { exam, setExam, error, setError, loading, reload } = useExam(id);
  const online = useOnline();
  const router = useRouter();
  const today = useToday();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [open, setOpen] = useState<RouteViewNode | null>(null);
  const [confirm, setConfirm] = useState<RouteViewNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const [announce, setAnnounce] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sessionRequest = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Vuelta desde una unidad terminada: /ruta?hecho=<unitId> reproduce el avance una vez.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const done = params.get("hecho");
    if (!done) return;
    setCelebrate(done);
    params.delete("hecho");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);
  useEffect(() => {
    if (!celebrate || played || !exam) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPlayed(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [celebrate, played, exam]);

  // Plan generándose: vuelve a consultar cada pocos segundos.
  useEffect(() => {
    if (exam?.status !== "preparing") return;
    const t = setInterval(() => {
      getExam(id)
        .then(setExam)
        .catch(() => undefined);
    }, 6000);
    return () => clearInterval(t);
  }, [exam?.status, id, setExam]);

  // Durante la animación de «unidad completada», la unidad aún se pinta como pendiente.
  const shown = useMemo(() => {
    if (!exam || !celebrate || played) return exam;
    return {
      ...exam,
      units: exam.units.map((u) =>
        u.id === celebrate && u.status === "completed"
          ? { ...u, status: "in_progress" as const }
          : u,
      ),
    };
  }, [exam, celebrate, played]);
  const route = useMemo(
    () => (shown && today ? buildRoute(shown, today) : null),
    [shown, today],
  );
  useEffect(() => {
    if (!played || !exam || !celebrate) return;
    const unit = exam.units.find((u) => u.id === celebrate);
    if (unit?.status !== "completed") return;
    const next = route?.next;
    setAnnounce(
      `«${unit.title}» completada.${next ? ` A continuación: ${next.title}.` : ""}`,
    );
  }, [played, exam, celebrate, route]);

  // Un test con un resultado muy distinto a lo esperado pide ajustar la ruta (máx. 1 al día en servidor).
  useEffect(() => {
    if (!exam || !today || !online) return;
    if (!exam.route_source || exam.route_regenerated_on === today) return;
    const updated = exam.route_updated_at ? Date.parse(exam.route_updated_at) : 0;
    const fresh = exam.sessions.filter(
      (s) =>
        s.status === "completed" &&
        typeof s.percentage === "number" &&
        s.submitted_at &&
        Date.parse(s.submitted_at) > updated,
    );
    if (!fresh.some((s) => (s.percentage ?? 100) < 40 || (s.percentage ?? 0) > 90))
      return;
    let alive = true;
    callDream<{ exam: DreamExam }>("exam_route_regenerate", {
      exam_id: exam.id,
      trigger: "result",
    })
      .then((r) => {
        if (alive) setExam(r.exam);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // Solo al cargar un examen nuevo: no repetir por cada cambio de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id, today]);

  if (!exam && !online)
    return (
      <ExamFrame eyebrow="TU RUTA" title="Tu ruta de estudio">
        <section className={styles.card} data-testid="route-offline">
          <p className={styles.paceLine}>
            <WifiOff size={20} aria-hidden="true" />
            <strong>Sin conexión</strong>
          </p>
          <p className={styles.muted}>
            Tu ruta está guardada. Vuelve a intentarlo cuando tengas conexión.
          </p>
          <button className="primary press" onClick={reload}>
            Reintentar
          </button>
        </section>
      </ExamFrame>
    );
  if (loading || !exam) return <ExamLoad error={error} reload={reload} />;
  const back = (
    <Link className={styles.inlineLink} href={`/exams/${id}`}>
      Volver al examen
    </Link>
  );
  async function retryPlan() {
    setBusy(true);
    setError("");
    try {
      setExam(await updateExam("exam_prepare", id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (exam.status === "preparing")
    return (
      <ExamFrame eyebrow="TU RUTA" title={exam.title}>
        <section className={styles.card} aria-busy="true">
          {/* Enganche: aquí irá <ThinkingOrb state="thinking" /> (thinking-orbs)
              cuando Carlos apruebe el paquete. Mientras, el indicador de Dream. */}
          <DreamActivity state="thinking" label="Dream está preparando tu plan" />
          <p className={styles.muted}>
            Ordenamos tus temas y repartimos el tiempo hasta el examen. Puedes
            salir: lo guardamos.
          </p>
        </section>
        {back}
      </ExamFrame>
    );
  if (exam.status === "failed" || exam.status === "draft")
    return (
      <ExamFrame eyebrow="TU RUTA" title={exam.title}>
        <section className={styles.card}>
          <p className={styles.paceLine}>
            <AlertTriangle size={20} aria-hidden="true" />
            <strong>
              {exam.status === "failed"
                ? "No se pudo preparar tu plan"
                : "Tu plan aún no está preparado"}
            </strong>
          </p>
          <p className={styles.muted}>
            {exam.plan_error ||
              "Tus temas y materiales están guardados. Revisa el asistente para preparar el plan."}
          </p>
          {exam.status === "failed" ? (
            <button
              className="primary press"
              disabled={busy || !online}
              onClick={() => void retryPlan()}
            >
              {busy ? "Reintentando…" : "Reintentar"}
            </button>
          ) : (
            <Link className="primary press" href={`/exams/new?id=${id}`}>
              Retomar preparación <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
        </section>
        <ErrorNotice error={error} />
        {back}
      </ExamFrame>
    );
  if (!exam.units.length)
    return (
      <ExamFrame eyebrow="TU RUTA" title={exam.title}>
        <section className={styles.card}>
          <p>
            <strong>Este examen aún no tiene unidades.</strong>
          </p>
          <p className={styles.muted}>
            Tu ruta aparecerá cuando Dream haya preparado tu plan.
          </p>
          <Link className="primary press" href={`/exams/${id}`}>
            Ir a mi examen <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
        {back}
      </ExamFrame>
    );
  if (!route || !today) return <ExamLoad error="" reload={reload} />;

  const units = studyPath(exam.units);
  const days = daysUntil(exam.exam_date);
  const pace = paceStatus({
    units: exam.units,
    examDate: exam.exam_date,
    dailyMinutes: exam.daily_minutes,
    today,
  });
  const PaceIcon = PACE_ICONS[pace.kind];
  const changes = exam.route?.changes ?? [];
  const adjusted =
    !!changes.length &&
    !!exam.route_regenerated_on &&
    dayDiff(exam.route_regenerated_on, today) <= 2;
  const canRegenerate =
    !!exam.route_source && exam.route_regenerated_on !== today;
  const titles = new Map(exam.units.map((u) => [u.id, u.title]));

  async function share() {
    const outcome = await shareProgress(
      shareText(exam!.subject, exam!.units),
      navigator,
    );
    if (outcome === "shared" || outcome === "cancelled") return;
    clearTimeout(timer.current);
    setNotice(
      outcome === "copied"
        ? { text: "Copiado", error: false }
        : { text: "No se pudo compartir. Inténtalo de nuevo.", error: true },
    );
    timer.current = setTimeout(() => setNotice(undefined), 4000);
  }
  async function regenerate() {
    setBusy(true);
    setError("");
    try {
      const r = await callDream<{ exam: DreamExam }>("exam_route_regenerate", {
        exam_id: id,
        trigger: "manual",
      });
      setExam(r.exam);
      setAnnounce("Tu ruta se ha ajustado.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function practice(node: RouteViewNode) {
    setBusy(true);
    setError("");
    sessionRequest.current ??= crypto.randomUUID();
    try {
      const { session } = await callDream<{ session: ExamSession }>(
        "exam_session_create",
        {
          exam_id: id,
          ...(node.unit ? { unit_id: node.unit.id } : {}),
          session_id: sessionRequest.current,
          mode: "practice",
          time_limit_seconds: null,
        },
      );
      router.push(sessionPath(id, session.id));
    } catch (e) {
      sessionRequest.current = null;
      setError(errorMessage(e));
      setOpen(null);
    } finally {
      setBusy(false);
    }
  }
  function choose(node: RouteViewNode) {
    if (node.before) setConfirm(node);
    else setOpen(node);
  }

  return (
    <ExamFrame
      eyebrow="TU RUTA"
      title={exam.title}
      subtitle={`${exam.subject} · ${examDateLabel(exam.exam_date)}`}
      aside={
        <section className={styles.card}>
          <h3>Comparte tu avance</h3>
          <p className={styles.muted}>
            Solo se comparte tu porcentaje y tus temas. Nunca tu nombre ni tus
            conversaciones.
          </p>
          <button className="secondary press" onClick={() => void share()}>
            <Share2 size={18} aria-hidden="true" /> Compartir
          </button>
        </section>
      }
    >
      {!online && (
        <p className={styles.offline} role="status">
          <WifiOff size={16} aria-hidden="true" /> Sin conexión. Lo que ves
          puede no estar al día.
        </p>
      )}
      <section className={styles.card} aria-labelledby="ruta-resumen">
        <div className={styles.summaryTop}>
          <h2 id="ruta-resumen" className={`${styles.days} ${styles.num}`}>
            {daysText(days)}
          </h2>
          <span className={styles.badge}>
            <span className={styles.num}>
              {units.completed} de {units.total}
            </span>{" "}
            unidades
          </span>
        </div>
        <ProgressLine
          value={units.percentage}
          label={`Unidades completadas: ${units.percentage} %`}
        />
        <p className={styles.paceLine} data-pace={pace.kind} role="status">
          <PaceIcon size={18} aria-hidden="true" />
          <strong>{pace.message}</strong>
        </p>
        <p className={styles.muted}>{pace.detail}</p>
        {(pace.kind === "late" || pace.kind === "no_date") && (
          <Link className={styles.inlineLink} href={`/exams/${id}`}>
            {pace.kind === "late"
              ? "Ajustar mis minutos diarios"
              : "Revisar la fecha del examen"}
          </Link>
        )}
      </section>

      {adjusted && (
        <details className={styles.adjusted}>
          <summary>
            <Sparkles size={16} aria-hidden="true" /> Tu ruta se ha ajustado ·{" "}
            <span className={styles.summaryLink}>Ver qué cambió</span>
          </summary>
          <ul>
            {changes.map((c, i) => (
              <li key={i}>{changeText(c, titles)}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.routeHead}>
        <h2 className={styles.sectionTitle} id="ruta-camino">
          Tu camino
        </h2>
        <span className={styles.source} data-source={route.source}>
          {route.source === "ai" ? "Ruta de Dream" : "Ruta automática"}
        </span>
      </div>
      <p className={styles.muted}>
        {route.source === "ai"
          ? "Dream ha ordenado tus sesiones según tus temas, tus dificultades y tus resultados."
          : "Ordenada por temas y repartida en los días que quedan, sin pasar de tus minutos diarios."}
      </p>
      <p className="visually-hidden" role="status">
        {announce || pathAnnouncement(units)}
      </p>
      <ol
        className={styles.path}
        aria-labelledby="ruta-camino"
        data-celebrating={celebrate && !played ? "" : undefined}
      >
        {route.nodes.map((node, i) => (
          <RouteStep
            key={node.key}
            node={node}
            index={i}
            highlighted={node.type === "mock" && route.mockHighlighted}
            onOpen={choose}
          />
        ))}
      </ol>
      {canRegenerate && (
        <button
          className="secondary press"
          disabled={busy || !online}
          onClick={() => void regenerate()}
        >
          <RotateCcw size={18} aria-hidden="true" />{" "}
          {busy ? "Rehaciendo…" : "Rehacer mi ruta"}
        </button>
      )}
      <p className={styles.muted}>
        Puedes abrir cualquier paso. Tu avance refleja lo que completas, no una
        nota.
      </p>
      {back}
      <ErrorNotice error={error} />

      {confirm?.before && (
        <Modal labelledBy="ruta-aviso" onClose={() => setConfirm(null)}>
          <h2 id="ruta-aviso">¿Saltar al siguiente paso?</h2>
          <p>
            Te recomendamos terminar antes «{confirm.before.title}». ¿Ir
            igualmente?
          </p>
          <div className={`modal-actions ${styles.wrapActions}`}>
            <button
              className="secondary press"
              onClick={() => {
                setOpen(confirm);
                setConfirm(null);
              }}
            >
              Ir igualmente
            </button>
            <button
              className="primary press"
              autoFocus
              onClick={() => {
                setOpen(confirm.before);
                setConfirm(null);
              }}
            >
              Ir a «{confirm.before.title}»
            </button>
          </div>
        </Modal>
      )}
      {open && (
        <Modal labelledBy="ruta-hoja" onClose={() => setOpen(null)}>
          <div className={styles.sheet} data-testid="route-sheet">
            <p className={styles.meta}>
              {TYPE_LABELS[open.type]} · {open.label}
              {open.when ? ` · ${open.when}` : ""}
            </p>
            <h2 id="ruta-hoja">{open.title}</h2>
            <p>
              {open.type === "study" && open.unit
                ? open.unit.summary
                : open.node.reason}
            </p>
            {open.type === "study" && open.node.reason && (
              <p className={styles.reason}>
                <Sparkles size={14} aria-hidden="true" /> {open.node.reason}
              </p>
            )}
            <p className={`${styles.sheetMinutes} ${styles.num}`}>
              {open.minutes} min
              {open.topic ? ` · ${open.topic}` : ""}
            </p>
            <div className={styles.sheetActions}>
              {open.type === "mock" ? (
                <Link className="primary press" href={`/exams/${id}#simulacro`}>
                  Ir al «Simulacro de examen» <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ) : open.type === "study" && open.unit ? (
                <Link
                  className="primary press"
                  href={`/exams/${id}/study/${open.unit.id}`}
                >
                  Empezar <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ) : null}
              {open.type !== "mock" && (
                <button
                  className={`${open.type === "study" ? "secondary" : "primary"} press`}
                  disabled={busy || !online}
                  onClick={() => void practice(open)}
                >
                  {busy ? "Preparando test…" : "Hacer un test de este tema"}
                </button>
              )}
              {open.type !== "study" && open.unit && (
                <Link
                  className="secondary press"
                  href={`/exams/${id}/study/${open.unit.id}`}
                >
                  Repasar el tema
                </Link>
              )}
              <button className="secondary press" onClick={() => setOpen(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className="toast-position" aria-live="polite">
        {notice && (
          <Toast
            message={notice.text}
            error={notice.error}
            onClose={() => setNotice(undefined)}
          />
        )}
      </div>
    </ExamFrame>
  );
}
