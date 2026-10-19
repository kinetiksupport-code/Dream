// Asistente de crear examen (PROMPT_EXAMEN_ESTILO.md §5). Lógica pura,
// probada en tests/exam-wizard.test.ts. La interfaz vive en
// components/exams/wizard/.
import { daysUntil, type DreamExam } from "./exam-plans";

// ---------------------------------------------------------------- Pasos

/** Pasos que se ven en la barra de progreso («Paso 2 de 5»). */
export const WIZARD_STEPS = [
  { id: "inicio", label: "Bienvenida" },
  { id: "apuntes", label: "Tus apuntes" },
  { id: "fecha", label: "Fecha" },
  { id: "nota", label: "Nota" },
  { id: "examen", label: "Tu examen" },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]["id"] | "listo";
/** Paso guardado en el borrador (columna wizard_step). */
export type ServerStep = NonNullable<DreamExam["wizard_step"]>;

const SERVER_TO_STEP: Record<ServerStep, WizardStep> = {
  upload: "apuntes",
  date: "fecha",
  grade: "nota",
  identify: "examen",
};
export const STEP_TO_SERVER: Partial<Record<WizardStep, ServerStep>> = {
  apuntes: "upload",
  fecha: "date",
  nota: "grade",
  examen: "identify",
};

export function stepIndex(step: WizardStep) {
  return step === "listo"
    ? WIZARD_STEPS.length
    : WIZARD_STEPS.findIndex((s) => s.id === step);
}
export function isWizardStep(value: string | null): value is WizardStep {
  return value === "listo" || WIZARD_STEPS.some((s) => s.id === value);
}

/** Hasta dónde puede llegar un borrador con lo que ya tiene guardado. */
type DraftState = Pick<DreamExam, "exam_date" | "target_grade" | "wizard_step"> & {
  materials: readonly unknown[];
};
export function furthestStep(exam: Omit<DraftState, "wizard_step">): WizardStep {
  if (!exam.materials.length) return "apuntes";
  if (!exam.exam_date) return "fecha";
  if (exam.target_grade === null || exam.target_grade === undefined) return "nota";
  return "examen";
}

/**
 * Dónde retomar un borrador (§5.9): el paso pedido en la URL si ya se puede
 * estar ahí; si no, el guardado; nunca más allá de lo que tiene datos.
 */
export function resumeStep(
  exam: DraftState,
  requested: WizardStep | null,
): WizardStep {
  const limit = stepIndex(furthestStep(exam));
  const saved = exam.wizard_step ? SERVER_TO_STEP[exam.wizard_step] : "apuntes";
  const wanted = requested && requested !== "inicio" && requested !== "listo" ? requested : saved;
  return stepIndex(wanted) <= limit ? wanted : WIZARD_STEPS[limit].id;
}

/** Dirección de la transición entre pasos (mismo sistema que las páginas). */
export function stepDirection(from: WizardStep, to: WizardStep): "forward" | "back" | null {
  const a = stepIndex(from);
  const b = stepIndex(to);
  return a === b ? null : b > a ? "forward" : "back";
}

// ---------------------------------------------------------------- Pocos apuntes

/**
 * Umbral de «pocos apuntes» (§5.4). Único sitio: cámbialo aquí.
 *
 * 3.000 caracteres de texto extraído ≈ 1,7 páginas normalizadas (1.800
 * caracteres por página: 30 líneas de 60, la medida editorial española), es
 * decir, menos de 2 páginas: una hoja manuscrita por las dos caras o el
 * resumen de un solo apartado. Por debajo, la IA no tiene material para más
 * de dos o tres unidades y se inventaría el resto. Empezamos por debajo de
 * las 2 páginas (3.600) para no molestar con apuntes cortos pero suficientes.
 */
export const FEW_NOTES = {
  minChars: 3000,
  pageChars: 1800,
} as const;

export interface NotesAnalysis {
  files: number;
  chars: number;
}
export function pagesEquivalent(chars: number) {
  return Math.round((chars / FEW_NOTES.pageChars) * 10) / 10;
}
export function isFewNotes(analysis: NotesAnalysis) {
  return analysis.files > 0 && analysis.chars < FEW_NOTES.minChars;
}
/** Solo se pregunta una vez por examen. */
export function shouldWarnFewNotes(analysis: NotesAnalysis, acknowledged: boolean) {
  return !acknowledged && isFewNotes(analysis);
}

// ---------------------------------------------------------------- Nota (ruedecita)

export const GRADE = { min: 0, max: 10, step: 0.5, initial: 8 } as const;
/** 0, 0,5, 1 … 10 (21 valores). */
export const GRADE_VALUES = Array.from(
  { length: (GRADE.max - GRADE.min) / GRADE.step + 1 },
  (_, i) => GRADE.min + i * GRADE.step,
);
export function clampGrade(value: number) {
  if (!Number.isFinite(value)) return GRADE.initial;
  const snapped = Math.round(value / GRADE.step) * GRADE.step;
  return Math.min(GRADE.max, Math.max(GRADE.min, snapped));
}
/** «8», «8,5». */
export function formatGrade(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}
/** Índice del valor centrado según el desplazamiento del rodillo. */
export function gradeIndexAt(scrollTop: number, itemHeight: number) {
  const i = Math.round(scrollTop / itemHeight);
  return Math.min(GRADE_VALUES.length - 1, Math.max(0, i));
}
/** Escala y opacidad de un valor según su distancia (en filas) al centro. */
export function wheelItemStyle(distance: number) {
  const d = Math.min(3, Math.abs(distance));
  return {
    scale: Math.round((1 - d * 0.18) * 1000) / 1000,
    opacity: Math.round(Math.max(0.12, 1 - d * 0.34) * 1000) / 1000,
  };
}
/** Teclado del rodillo: flechas ±0,5, Re Pág/Av Pág ±1, Inicio y Fin. */
export function gradeForKey(value: number, key: string): number | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return clampGrade(value + GRADE.step);
    case "ArrowDown":
    case "ArrowLeft":
      return clampGrade(value - GRADE.step);
    case "PageUp":
      return clampGrade(value + 1);
    case "PageDown":
      return clampGrade(value - 1);
    case "Home":
      return GRADE.min;
    case "End":
      return GRADE.max;
    default:
      return null;
  }
}
/** Intensidad del fondo cálido (0 → 1) según la nota. */
export function gradeWarmth(value: number) {
  return Math.round((clampGrade(value) / GRADE.max) * 100) / 100;
}

// ---------------------------------------------------------------- Fecha

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}
export function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return isoDay(new Date(y, m - 1 + n, Math.min(d, last)));
}
/** Hasta dos años vista: más allá no hay ruta que preparar. */
export const MAX_DAYS_AHEAD = 730;

/** Semanas del mes (lunes primero) con días ISO o null de relleno. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => isoDay(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Error de fecha en palabras, o null si vale. */
export function dateError(iso: string, now = new Date()) {
  if (!iso) return "Elige el día de tu examen.";
  const days = daysUntil(iso, now);
  if (days === null) return "Esa fecha no existe. Elige otra.";
  if (days < 0) return "Ese día ya ha pasado. Elige hoy o un día futuro.";
  if (days > MAX_DAYS_AHEAD) return "Elige una fecha de los próximos dos años.";
  return null;
}

/** «Faltan 12 días» con el número aparte para animarlo. */
export function countdownParts(iso: string, now = new Date()) {
  const days = daysUntil(iso, now);
  if (days === null || days < 0) return null;
  if (days === 0) return { before: "", n: null, after: "Es hoy" };
  if (days === 1) return { before: "", n: null, after: "Es mañana" };
  return { before: "Faltan", n: days, after: "días" };
}

// ---------------------------------------------------------------- Archivos

export interface KnownFile {
  name: string;
  size: number;
  hash?: string;
}
/** Mismo contenido, o mismo nombre y tamaño (§5.9). */
export function findDuplicate(file: KnownFile, existing: KnownFile[]) {
  return (
    existing.find(
      (e) =>
        (file.hash && e.hash && file.hash === e.hash) ||
        (e.name === file.name && e.size === file.size),
    ) ?? null
  );
}

/** «248 KB», «1,2 MB». */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Nombre visible de una foto de la cámara («image.jpg» → «Foto 3»). */
export function photoName(n: number, type: string) {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `Foto ${n}.${ext}`;
}
