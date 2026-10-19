// Asignatura → modelo 3D (PR 6, §5.8) y la inclinación hacia el puntero.
// Lógica pura, probada en tests/subject-3d.test.ts. Solo la importa el trozo
// 3D (components/subject-3d/*), que se carga con import() en escritorio.
// Los modelos se construyen por código en components/subject-3d/models.ts.
import {
  DEFAULT_OBJECT,
  subjectObject,
  type SubjectObjectKey,
} from "./subject-objects";

/** Modelos 3D disponibles. */
export const SUBJECT_MODELS = [
  "globe",
  "calculator",
  "book",
  "brush",
  "scroll",
  "atom",
  "flask",
  "microscope",
  "speech",
  "bulb",
  "note",
  "laptop",
  "coin",
  "ball",
  "cap",
] as const;
export type SubjectModelKey = (typeof SUBJECT_MODELS)[number];

/** Modelo para una asignatura desconocida: el birrete. */
export const DEFAULT_MODEL: SubjectModelKey = "cap";

/**
 * Icono estático → modelo 3D. Casi siempre es el mismo objeto; cambia donde
 * el icono era un apaño: Fluent no tiene calculadora (ábaco) y el prompt pide
 * un matraz para Química (el icono es un tubo de ensayo).
 */
export const MODEL_FOR_OBJECT: Record<SubjectObjectKey, SubjectModelKey> = {
  globe: "globe",
  abacus: "calculator",
  book: "book",
  brush: "brush",
  scroll: "scroll",
  atom: "atom",
  testtube: "flask",
  microscope: "microscope",
  speech: "speech",
  bulb: "bulb",
  note: "note",
  laptop: "laptop",
  coin: "coin",
  ball: "ball",
  cap: DEFAULT_MODEL,
};

/** Modelo de una asignatura (mismo mapa que el icono: lib/subject-objects). */
export function subjectModel(
  subject: string | null | undefined,
  object?: SubjectObjectKey,
): SubjectModelKey {
  return MODEL_FOR_OBJECT[object ?? subjectObject(subject)] ?? MODEL_FOR_OBJECT[DEFAULT_OBJECT];
}

/**
 * Inclinación hacia el puntero, en radianes, a partir de la posición del
 * puntero relativa al centro del objeto (en píxeles) y del tamaño de la
 * ventana. Suave y acotada: como mucho `max` en cada eje.
 */
export function pointerTilt(
  dx: number,
  dy: number,
  viewportW: number,
  viewportH: number,
  max = 0.35,
): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const nx = viewportW > 0 ? clamp(dx / (viewportW / 2)) : 0;
  const ny = viewportH > 0 ? clamp(dy / (viewportH / 2)) : 0;
  // Mirar hacia el puntero: a la derecha gira en +y; arriba inclina en -x.
  return { x: ny * max, y: nx * max };
}
