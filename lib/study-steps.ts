// Ruta de estudio rediseñada (docs/diseno/ruta-pasos, prompt de la ruta,
// Bloque 0). Detrás de DREAM_STUDY_STEPS_ENABLED: apagado en producción
// salvo que se encienda la variable; encendido en vistas previas y en local
// para poder revisarlo. Con el flag apagado la web se comporta como hoy.
import type { RouteNodeType } from "@/supabase/functions/dream-api/route-plan.mjs";

// Encendido por fases: el servidor dice en el perfil si esta cuenta la tiene
// (cuenta de prueba, Fundación Loyola o todos). Lo fija providers.tsx al
// cargar el perfil, antes de pintar nada de la app.
let runtimeOn = false;
let aiRouteOn = false;
/** El servidor tiene la ruta con IA (DREAM_AI_ROUTE_ENABLED): lo dice el perfil. */
export function setAiRouteForAccount(on: boolean) {
  aiRouteOn = on;
}
export const aiRouteEnabled = () => aiRouteOn;
export function setStudyStepsForAccount(on: boolean) {
  runtimeOn = on;
}

export function studyStepsEnabled(
  flag = process.env.NEXT_PUBLIC_DREAM_STUDY_STEPS_ENABLED,
  environment = process.env.NEXT_PUBLIC_DREAM_ENVIRONMENT,
) {
  if (flag === "true" || runtimeOn) return true;
  if (flag === "false") return false;
  return environment === "preview" || environment === "development";
}

/** Piezas 3D de Claude Design («Dream · Experiencia de estudio», Iconos3D). */
/**
 * Objetos de la lámina de Carlos (3-nov-2026), recortados sin retocar y con el
 * fondo quitado (public/estudio/objetos). Los que no están en la lámina siguen
 * con la pieza de siempre (public/estudio/3d).
 */
const OBJECTS = new Set([
  "hecha", "actual", "bloq", "gema", "leer", "test", "tarjetas", "simulacro", "dominado", "completada",
  "historia", "geografia", "matematicas", "quimica", "fisica", "biologia", "lengua", "arte",
]);
export const PIECE = (name: string) => (OBJECTS.has(name) ? `/estudio/objetos/${name}.webp` : `/estudio/3d/${name}.svg`);

/** Cada parada se llama «lección» (5b); el tipo va en la etiqueta corta. */
export const STEP_LABEL: Record<RouteNodeType, string> = {
  study: "Lección",
  practice: "Test",
  review: "Repaso",
  mock: "Simulacro",
};
export const STEP_PIECE: Record<RouteNodeType, string> = {
  study: "leer",
  practice: "test",
  review: "tarjetas",
  mock: "simulacro",
};

const SUBJECTS: [RegExp, string][] = [
  [/histori/, "historia"],
  [/geograf/, "geografia"],
  [/matem|algebra|calculo|estadist/, "matematicas"],
  [/educacion fisica|deporte/, "edfisica"],
  [/quimic/, "quimica"],
  [/fisica/, "fisica"],
  [/biolog|anatom/, "biologia"],
  [/lengua|literat|castellan|catalan|gallego|euskera|valenciano/, "lengua"],
  [/dibujo|arte|plastic/, "arte"],
  [/music/, "musica"],
  [/tecnolog/, "tecnologia"],
  [/ingles|frances|aleman|italiano|portugues|idioma|latin|griego/, "idiomas"],
  [/econom|empresa/, "economia"],
  [/filosof/, "filosofia"],
  [/religion|etica|valores/, "etica"],
  [/naturales|ciencias de la tierra|geolog/, "naturales"],
  [/informat|program|computa/, "informatica"],
  [/teatro|artes escenicas/, "teatro"],
  [/astronom/, "astronomia"],
  [/sociolog|psicolog/, "sociologia"],
];

/** La pieza de la asignatura, o el libro de «Leer» si no se reconoce. */
export function subjectPiece(subject: string | null | undefined) {
  const s = (subject ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return SUBJECTS.find(([re]) => re.test(s))?.[1] ?? "leer";
}

/**
 * Dominio: media de los tests terminados (null sin datos: no se pinta).
 * Preparación (la gema): parte de la ruta hecha. Son datos distintos (Reglas, 4).
 */
export function masteryOf(sessions: readonly { status: string; percentage?: number | null }[]) {
  const done = sessions.filter(
    (s) => s.status === "completed" && typeof s.percentage === "number",
  );
  if (!done.length) return null;
  return Math.round(done.reduce((a, s) => a + (s.percentage ?? 0), 0) / done.length);
}

export interface StepGroups<T> {
  done: T[];
  current: T | null;
  upcoming: T[];
  /** Lecciones que no se ven («+9 lecciones más»). */
  hidden: T[];
  final: T | null;
}

/**
 * Qué se ve en el camino (0.5): los hechos plegados, el actual, las N
 * siguientes, el resto en «+N» y el simulacro final siempre al final.
 */
export function stepGroups<T extends { state: string; type: RouteNodeType; key: string }>(
  nodes: readonly T[],
  current: T | null,
  visible = 4,
): StepGroups<T> {
  const final = [...nodes].reverse().find((n) => n.type === "mock") ?? null;
  const rest = nodes.filter((n) => n !== final);
  const done = rest.filter((n) => n.state === "completed");
  const now = current && current !== final ? current : rest.find((n) => n.state !== "completed") ?? null;
  const after = rest.filter((n) => n.state !== "completed" && n !== now);
  return {
    done,
    current: now,
    upcoming: after.slice(0, visible),
    hidden: after.slice(visible),
    final,
  };
}

/** Reloj discreto del simulacro (0.7): minutos hasta el último minuto; entonces, segundos. */
export function clockText(seconds: number) {
  if (seconds <= 0) return "0:00";
  if (seconds > 60) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
