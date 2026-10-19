// Asignatura → objeto 3D (PROMPT_EXAMEN_ESTILO.md §5.8). Único sitio del mapa:
// cambia aquí qué objeto lleva cada asignatura. Los iconos son Microsoft
// Fluent Emoji 3D (MIT), en public/subjects/<objeto>-{96,192}.webp
// (docs/ASSETS_LICENCIAS.md). Lógica pura, probada en tests/subject-objects.test.ts.

/** Objetos disponibles (nombre del archivo en public/subjects). */
export const SUBJECT_OBJECTS = [
  "globe",
  "abacus",
  "book",
  "brush",
  "scroll",
  "atom",
  "testtube",
  "microscope",
  "speech",
  "bulb",
  "note",
  "laptop",
  "coin",
  "ball",
  "cap",
] as const;
export type SubjectObjectKey = (typeof SUBJECT_OBJECTS)[number];

/** Objeto para «otra» asignatura o una que no reconocemos. */
export const DEFAULT_OBJECT: SubjectObjectKey = "cap";

/** Texto alternativo de cada objeto (cuando no es decorativo). */
export const OBJECT_LABEL: Record<SubjectObjectKey, string> = {
  globe: "Globo terráqueo",
  abacus: "Ábaco",
  book: "Libro",
  brush: "Pincel",
  scroll: "Pergamino",
  atom: "Átomo",
  testtube: "Tubo de ensayo",
  microscope: "Microscopio",
  speech: "Bocadillo de diálogo",
  bulb: "Bombilla",
  note: "Nota musical",
  laptop: "Portátil",
  coin: "Moneda",
  ball: "Balón",
  cap: "Birrete",
};

/**
 * Asignaturas conocidas, en el orden en que se ofrecen para corregir la
 * detección («No es esta asignatura»). La IA solo puede devolver una de
 * estas o «Otra» (dream-api valida contra la misma lista).
 */
export const KNOWN_SUBJECTS = [
  "Matemáticas",
  "Lengua y Literatura",
  "Inglés",
  "Historia",
  "Geografía",
  "Geografía e Historia",
  "Biología",
  "Biología y Geología",
  "Física",
  "Química",
  "Física y Química",
  "Filosofía",
  "Economía",
  "Informática",
  "Tecnología",
  "Música",
  "Plástica",
  "Educación Física",
  "Otra",
] as const;

/** Objeto de cada asignatura conocida. */
const BY_SUBJECT: Record<(typeof KNOWN_SUBJECTS)[number], SubjectObjectKey> = {
  Matemáticas: "abacus",
  "Lengua y Literatura": "book",
  Inglés: "speech",
  Historia: "scroll",
  Geografía: "globe",
  "Geografía e Historia": "globe",
  Biología: "microscope",
  "Biología y Geología": "microscope",
  Física: "atom",
  Química: "testtube",
  "Física y Química": "atom",
  Filosofía: "bulb",
  Economía: "coin",
  Informática: "laptop",
  Tecnología: "laptop",
  Música: "note",
  Plástica: "brush",
  "Educación Física": "ball",
  Otra: DEFAULT_OBJECT,
};

/**
 * Palabras que delatan la asignatura cuando el nombre es libre («Mates 2º
 * ESO», «English B1», «Historia de España»). Se comprueban en este orden:
 * las más concretas primero («educación física» antes que «física»).
 */
const KEYWORDS: [string, SubjectObjectKey][] = [
  ["educacion fisica", "ball"],
  ["ed. fisica", "ball"],
  ["deporte", "ball"],
  ["fisica y quimica", "atom"],
  ["quimica", "testtube"],
  ["fisica", "atom"],
  ["matematica", "abacus"],
  ["mates", "abacus"],
  ["algebra", "abacus"],
  ["geometria", "abacus"],
  ["calculo", "abacus"],
  ["estadistica", "abacus"],
  ["lengua", "book"],
  ["literatura", "book"],
  ["castellano", "book"],
  ["valenciano", "book"],
  ["catalan", "book"],
  ["euskera", "book"],
  ["gallego", "book"],
  ["latin", "book"],
  ["griego", "book"],
  ["ingles", "speech"],
  ["english", "speech"],
  ["frances", "speech"],
  ["aleman", "speech"],
  ["italiano", "speech"],
  ["idioma", "speech"],
  ["geografia", "globe"],
  ["historia", "scroll"],
  ["arte", "brush"],
  ["plastica", "brush"],
  ["dibujo", "brush"],
  ["biologia", "microscope"],
  ["geologia", "microscope"],
  ["ciencias naturales", "microscope"],
  ["anatomia", "microscope"],
  ["filosofia", "bulb"],
  ["etica", "bulb"],
  ["psicologia", "bulb"],
  ["musica", "note"],
  ["informatica", "laptop"],
  ["programacion", "laptop"],
  ["tecnologia", "laptop"],
  ["computacion", "laptop"],
  ["economia", "coin"],
  ["empresa", "coin"],
  ["contabilidad", "coin"],
];

/** Minúsculas, sin tildes ni espacios de más: «  Física  » → «fisica». */
export function normalizeSubject(subject: string): string {
  return subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** La asignatura conocida que corresponde a un texto, o null. */
export function knownSubject(
  subject: string,
): (typeof KNOWN_SUBJECTS)[number] | null {
  const n = normalizeSubject(subject);
  return KNOWN_SUBJECTS.find((s) => normalizeSubject(s) === n) ?? null;
}

/** Objeto de una asignatura: exacta, por palabra clave o el de por defecto. */
export function subjectObject(subject: string | null | undefined): SubjectObjectKey {
  if (!subject) return DEFAULT_OBJECT;
  const known = knownSubject(subject);
  if (known) return BY_SUBJECT[known];
  // Al principio de una palabra: «arte» no salta con «aparte».
  const n = ` ${normalizeSubject(subject).replace(/[^a-z0-9.]+/g, " ")}`;
  return (
    KEYWORDS.find(([word]) => n.includes(` ${word}`))?.[1] ?? DEFAULT_OBJECT
  );
}

/** Archivos servidos: 96 px (hasta 48 px en pantalla) y 192 px. */
export const OBJECT_SIZES = [96, 192] as const;
export function objectSrc(key: SubjectObjectKey, px: (typeof OBJECT_SIZES)[number]) {
  return `/subjects/${key}-${px}.webp`;
}
