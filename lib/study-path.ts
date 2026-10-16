import type { DreamExam, ExamSessionSummary, ExamUnit } from "./exam-plans";
import {
  dayDiff,
  fallbackRoute,
  isIsoDate,
  routeProgress,
  type RouteNode,
  type RouteNodeType,
} from "../supabase/functions/dream-api/route-plan.mjs";

// Ruta de estudio. El bloqueo es una guía (bloqueo suave): nunca cambia lo que
// el servidor permite. Todo se calcula en el cliente con los datos del examen.

export type PathUnit = Pick<ExamUnit, "id" | "position" | "title" | "status">;
export type PathNodeState = "completed" | "next" | "in_progress" | "pending";
export const STATE_LABELS: Record<PathNodeState, string> = {
  completed: "Completada",
  next: "A continuación",
  in_progress: "En curso",
  pending: "Pendiente",
};
function stateFor(done: boolean, first: boolean, started: boolean) {
  return done
    ? "completed"
    : first
      ? "next"
      : started
        ? "in_progress"
        : "pending";
}

export interface UnitPathNode {
  unit: PathUnit;
  state: PathNodeState;
  label: string;
}
export interface StudyPath {
  nodes: UnitPathNode[];
  completed: number;
  total: number;
  percentage: number;
  next: UnitPathNode | null;
}
/** Avance por unidades: lo que se comparte y lo que mide la barra. */
export function studyPath(units: readonly PathUnit[]): StudyPath {
  const ordered = [...units].sort((a, b) => a.position - b.position);
  const first = ordered.findIndex((u) => u.status !== "completed");
  const nodes = ordered.map((unit, i): UnitPathNode => {
    const state = stateFor(
      unit.status === "completed",
      i === first,
      unit.status === "in_progress",
    );
    return { unit, state, label: STATE_LABELS[state] };
  });
  const completed = nodes.filter((n) => n.state === "completed").length;
  const total = nodes.length;
  return {
    nodes,
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    next: first < 0 ? null : nodes[first],
  };
}

// ---------------------------------------------------------------- Ritmo
export type PaceKind =
  | "no_date"
  | "past"
  | "today"
  | "done"
  | "good"
  | "tight"
  | "late";
export interface Pace {
  kind: PaceKind;
  message: string;
  detail: string;
  days: number | null;
  pendingMinutes: number;
  availableMinutes: number;
  suggestedMinutes: number | null;
}
/**
 * Compara los minutos pendientes (unidades no completadas) con los disponibles
 * (días que quedan × minutos diarios).
 */
export function paceStatus({
  units,
  examDate,
  dailyMinutes,
  today,
}: {
  units: readonly Pick<ExamUnit, "status" | "estimated_minutes">[];
  examDate: string | null | undefined;
  dailyMinutes: number;
  today: string;
}): Pace {
  const pendingMinutes = units
    .filter((u) => u.status !== "completed")
    .reduce((sum, u) => sum + u.estimated_minutes, 0);
  const days = isIsoDate(examDate) ? dayDiff(today, examDate as string) : null;
  const availableMinutes = days && days > 0 ? days * dailyMinutes : 0;
  const base = { days, pendingMinutes, availableMinutes };
  if (days === null)
    return {
      ...base,
      kind: "no_date",
      message: "Pon la fecha de tu examen",
      detail: "Con la fecha, Dream calcula si vas a tiempo.",
      suggestedMinutes: null,
    };
  if (days < 0)
    return {
      ...base,
      kind: "past",
      message: "La fecha del examen ya pasó",
      detail: "Puedes seguir repasando a tu ritmo.",
      suggestedMinutes: null,
    };
  if (!pendingMinutes)
    return {
      ...base,
      kind: "done",
      message: "Has completado tus unidades",
      detail: "Queda repasar y hacer el simulacro.",
      suggestedMinutes: null,
    };
  if (days === 0)
    return {
      ...base,
      kind: "today",
      message: "Tu examen es hoy",
      detail: "Repasa lo esencial y descansa un poco antes.",
      suggestedMinutes: null,
    };
  const ratio = pendingMinutes / availableMinutes;
  const suggested = Math.min(120, Math.ceil(pendingMinutes / days / 5) * 5);
  const detail = `Te quedan ${pendingMinutes} min de estudio y tienes ${availableMinutes} min hasta el examen.`;
  if (ratio <= 0.8)
    return {
      ...base,
      kind: "good",
      message: "Vas bien",
      detail,
      suggestedMinutes: null,
    };
  if (ratio <= 1)
    return {
      ...base,
      kind: "tight",
      message: "Vas justo",
      detail,
      suggestedMinutes: null,
    };
  return {
    ...base,
    kind: "late",
    message: "Vas tarde, conviene subir los minutos diarios",
    detail: `${detail} Con unos ${suggested} min al día llegarías.`,
    suggestedMinutes: suggested,
  };
}

// ---------------------------------------------------------------- Fechas
const WEEKDAY = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  timeZone: "UTC",
});
/** «Hoy», «Mañana» o «Jue 22». */
export function dayLabel(iso: string | null | undefined, today: string) {
  if (!iso || !isIsoDate(iso)) return "";
  const diff = dayDiff(today, iso);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Mañana";
  const day = new Date(`${iso}T00:00:00Z`);
  const weekday = WEEKDAY.format(day).replace(".", "");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day.getUTCDate()}`;
}

// ---------------------------------------------------------------- Dominio
export interface Mastery {
  percentage: number;
  tests: number;
}
/** Media de aciertos de los tests terminados de cada tema. */
export function topicMastery(
  units: readonly Pick<ExamUnit, "id" | "topic">[],
  sessions: readonly ExamSessionSummary[],
) {
  const topicOf = new Map(units.map((u) => [u.id, u.topic]));
  const sums = new Map<string, { total: number; tests: number }>();
  for (const s of sessions) {
    if (s.status !== "completed" || typeof s.percentage !== "number") continue;
    const topic = s.unit_id ? topicOf.get(s.unit_id) : undefined;
    if (!topic) continue;
    const entry = sums.get(topic) ?? { total: 0, tests: 0 };
    entry.total += s.percentage;
    entry.tests += 1;
    sums.set(topic, entry);
  }
  const out = new Map<string, Mastery>();
  for (const [topic, { total, tests }] of sums)
    out.set(topic, { percentage: Math.round(total / tests), tests });
  return out;
}

// ---------------------------------------------------------------- Camino
export interface RouteViewNode {
  key: string;
  node: RouteNode;
  type: RouteNodeType;
  unit: ExamUnit | null;
  state: PathNodeState;
  label: string;
  title: string;
  topic: string;
  minutes: number;
  when: string;
  mastery: Mastery | null;
  /** Bloqueo suave: el primer paso sin terminar que recomendamos antes. */
  before: RouteViewNode | null;
}
export interface RouteView {
  source: "ai" | "auto";
  nodes: RouteViewNode[];
  next: RouteViewNode | null;
  /** El simulacro final se resalta con pocas unidades o pocos días. */
  mockHighlighted: boolean;
}
export const TYPE_LABELS: Record<RouteNodeType, string> = {
  study: "Estudiar",
  practice: "Práctica",
  review: "Repaso",
  mock: "Simulacro",
};
function nodeTitle(type: RouteNodeType, unit: ExamUnit | null) {
  if (type === "study") return unit?.title ?? "Estudiar un tema";
  if (type === "mock") return "Simulacro del examen";
  if (type === "practice")
    return unit ? `Test de «${unit.topic}»` : "Test de lo visto";
  return unit ? `Repaso de «${unit.topic}»` : "Repaso de tus errores";
}

export function buildRoute(
  exam: Pick<
    DreamExam,
    "units" | "sessions" | "exam_date" | "daily_minutes" | "route" | "route_source"
  >,
  today: string,
): RouteView {
  const saved = exam.route?.nodes?.length ? exam.route.nodes : null;
  const source: "ai" | "auto" =
    saved && exam.route_source === "ai" ? "ai" : "auto";
  const nodes =
    saved ??
    fallbackRoute({
      units: exam.units,
      sessions: exam.sessions,
      examDate: exam.exam_date,
      dailyMinutes: exam.daily_minutes,
      today,
    }).nodes;
  const done = routeProgress(nodes, exam.units, exam.sessions);
  const units = new Map(exam.units.map((u) => [u.id, u]));
  const mastery = topicMastery(exam.units, exam.sessions);
  const first = done.findIndex((d) => !d);
  const view: RouteViewNode[] = [];
  nodes.forEach((node, i) => {
    const unit = node.unit_id ? (units.get(node.unit_id) ?? null) : null;
    const state = stateFor(
      done[i],
      i === first,
      node.type === "study" && unit?.status === "in_progress",
    );
    const topic = unit?.topic ?? "";
    view.push({
      key: `${node.id}-${i}`,
      node,
      type: node.type,
      unit,
      state,
      label: STATE_LABELS[state],
      title: nodeTitle(node.type, unit),
      topic,
      minutes: node.minutes,
      when: done[i] ? "" : dayLabel(node.planned_date, today),
      mastery: topic ? (mastery.get(topic) ?? null) : null,
      before: null,
    });
  });
  const next = first < 0 ? null : view[first];
  for (const v of view)
    if (v.state === "pending" && next && v !== next) v.before = next;
  const days = isIsoDate(exam.exam_date)
    ? dayDiff(today, exam.exam_date)
    : null;
  const left = exam.units.filter((u) => u.status !== "completed").length;
  return {
    source,
    nodes: view,
    next,
    mockHighlighted: left <= 1 || (days !== null && days <= 3),
  };
}

/** Nodo «A continuación» del examen más cercano (tarjeta de Inicio). */
export function nearestExam<T extends Pick<DreamExam, "exam_date" | "status">>(
  exams: readonly T[],
  today: string,
) {
  return (
    [...exams]
      .filter(
        (e) =>
          e.status !== "completed" &&
          e.status !== "draft" &&
          isIsoDate(e.exam_date) &&
          dayDiff(today, e.exam_date) >= 0,
      )
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0] ?? null
  );
}

// ---------------------------------------------------------------- Compartir
const SHARE_SITE = "edudream.es";

// Quita lo que podría identificar a alguien si se coló en un campo libre.
export function cleanShareFragment(value: string, max = 60) {
  const clean = value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/(https?:\/\/|www\.)\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/\+?\d[\d\s.-]{7,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Texto para compartir: asignatura, porcentaje, temas y siguiente tema.
// Nunca recibe nombre, correo, título del examen ni conversaciones.
export function shareText(subject: string, units: readonly PathUnit[]) {
  const path = studyPath(units);
  const what = cleanShareFragment(subject) || "mi examen";
  const signature = `Con Dream — ${SHARE_SITE}`;
  if (path.total && path.completed === path.total)
    return `He completado mi ruta para ${what}: ${path.total} de ${path.total} temas. ${signature}`;
  const nextTitle = path.next ? cleanShareFragment(path.next.unit.title) : "";
  return [
    `Voy por el ${path.percentage} % de mi ruta para ${what}: ${path.completed} de ${path.total} temas.`,
    nextTitle ? `Siguiente: ${nextTitle}.` : "",
    signature,
  ]
    .filter(Boolean)
    .join(" ");
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";
export interface ShareTarget {
  share?: (data: { text: string; title?: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

// Web Share API si existe; si no (o falla), portapapeles.
export async function shareProgress(
  text: string,
  target: ShareTarget,
): Promise<ShareOutcome> {
  if (typeof target.share === "function") {
    try {
      await target.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  if (typeof target.clipboard?.writeText !== "function") return "failed";
  try {
    await target.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function pathAnnouncement(path: Pick<StudyPath, "completed" | "total" | "percentage">) {
  return `${path.completed} de ${path.total} temas completados, ${path.percentage} %.`;
}

/** Texto accesible de cada nodo: título, estado, cuándo y dominio. */
export function nodeAccessibleName(v: RouteViewNode) {
  return [
    v.title,
    v.label,
    v.when ? `Toca ${v.when.toLowerCase() === "hoy" || v.when.toLowerCase() === "mañana" ? v.when.toLowerCase() : `el ${v.when}`}` : "",
    `${v.minutes} min`,
    v.mastery
      ? `Dominio del tema ${v.mastery.percentage} %`
      : v.topic
        ? "Dominio: sin datos aún"
        : "",
  ]
    .filter(Boolean)
    .join(". ");
}
