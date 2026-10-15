import type { ExamUnit } from "./exam-plans";

// Ruta de estudio: vista de camino construida solo con las unidades del plan.
// El bloqueo es una guía visual; no cambia lo que el servidor permite.

export type PathUnit = Pick<ExamUnit, "id" | "position" | "title" | "status">;
export type PathNodeState =
  | "completed" // terminado
  | "current" // empezado: donde estás ahora
  | "next" // «A continuación»
  | "started" // empezado fuera de orden
  | "open" // pendiente, pero antes de tu punto actual
  | "locked"; // aún no
export interface PathNode {
  unit: PathUnit;
  state: PathNodeState;
  unlocked: boolean;
  label: string;
}
export interface StudyPath {
  nodes: PathNode[];
  completed: number;
  total: number;
  percentage: number;
  current: PathNode | null;
  next: PathNode | null;
}

export const STATE_LABELS: Record<PathNodeState, string> = {
  completed: "Completado",
  current: "Estás aquí",
  next: "A continuación",
  started: "Empezado",
  open: "Disponible",
  locked: "Bloqueado",
};

export function studyPath(units: readonly PathUnit[]): StudyPath {
  const ordered = [...units].sort((a, b) => a.position - b.position);
  const currentIndex = ordered.findIndex((u) => u.status === "in_progress");
  const nextIndex = ordered.findIndex(
    (u, i) =>
      u.status !== "completed" &&
      i !== currentIndex &&
      (currentIndex < 0 || i > currentIndex),
  );
  // Todo lo que queda antes del punto más avanzado sigue abierto.
  const frontier = Math.max(
    currentIndex,
    nextIndex,
    ordered.findLastIndex((u) => u.status !== "pending"),
  );
  const nodes = ordered.map((unit, i): PathNode => {
    const state: PathNodeState =
      unit.status === "completed"
        ? "completed"
        : i === currentIndex
          ? "current"
          : i === nextIndex
            ? "next"
            : unit.status === "in_progress"
              ? "started"
              : i < frontier
                ? "open"
                : "locked";
    return {
      unit,
      state,
      unlocked: state !== "locked",
      label: STATE_LABELS[state],
    };
  });
  const completed = nodes.filter((n) => n.state === "completed").length;
  const total = nodes.length;
  return {
    nodes,
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    current: currentIndex < 0 ? null : nodes[currentIndex],
    next: nextIndex < 0 ? null : nodes[nextIndex],
  };
}

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
  const upcoming = path.next ?? path.current;
  const nextTitle = upcoming ? cleanShareFragment(upcoming.unit.title) : "";
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

export function pathAnnouncement(path: StudyPath) {
  return `${path.completed} de ${path.total} temas completados, ${path.percentage} %.`;
}
