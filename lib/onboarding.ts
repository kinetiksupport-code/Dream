/**
 * Bienvenida para usuarios nuevos (prompt «landing, login y bienvenida» §4).
 * Pure logic shared by components/welcome/ and its tests: steps, limits,
 * validation, nickname suggestions and the birth date wheel.
 */
import { ageOn, isoDate, MIN_AGE, type ConsentProfile } from "./consent";

export const WELCOME_STEPS = [
  { key: "hola", label: "Hola" },
  { key: "nombre", label: "Tu nombre" },
  { key: "gustos", label: "Lo que te gusta" },
  { key: "apodo", label: "Cómo te llama la IA" },
  { key: "edad", label: "Tu edad" },
  { key: "ia", label: "Vas a hablar con una IA" },
] as const;
// "memoria" and "otraia" only exist when dream-api has the memory switched on
// (profile.memory_feature); they sit between the nickname and the age.
export type WelcomeStep = (typeof WELCOME_STEPS)[number]["key"] | "memoria" | "otraia" | "listo" | "menor";

export const LIMITS = { name: 40, nickname: 20, interest: 30, interests: 8 } as const;

/** Chips on «¿Qué te gusta?». Icons live in the component. */
export const INTERESTS = [
  "Fútbol",
  "Baloncesto",
  "Música",
  "Videojuegos",
  "Dibujo",
  "Leer",
  "Series y pelis",
  "Baile",
  "Cocina",
  "Animales",
  "Tecnología",
  "Moda",
  "Viajar",
  "Naturaleza",
] as const;

/**
 * «Cómo estudias» (P4, docs/HABLA_NATURAL.md): listas cerradas, todo
 * opcional. Igual que dream-api › onboarding.mjs › STUDY (lo comprueba
 * tests/habla-natural.test.ts).
 */
export const STUDY = {
  level: ["1º ESO", "2º ESO", "3º ESO", "4º ESO", "1º Bachillerato", "2º Bachillerato", "FP", "Universidad", "Otro"],
  hard: ["Matemáticas", "Lengua", "Inglés", "Física", "Química", "Biología", "Geología", "Historia", "Geografía", "Filosofía", "Economía", "Latín", "Dibujo técnico", "Otra"],
  region: ["Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria", "Castilla-La Mancha", "Castilla y León", "Cataluña", "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", "Navarra", "País Vasco", "Ceuta", "Melilla", "Fuera de España"],
  goal: ["Aprobar", "Subir nota", "Preparar la PAU", "Entenderlo de verdad"],
  style: ["Con ejemplos", "Paso a paso", "Directo y corto", "Con esquemas"],
  time: ["Menos de 30 min", "30-60 min", "1-2 horas", "Más de 2 horas"],
} as const;
export const MAX_HARD_SUBJECTS = 4;
export type StudyProfile = {
  hard?: string[];
  region?: string;
  goal?: string;
  style?: string;
  time?: string;
};

export const WELCOME_ERRORS = {
  name: "Escribe cómo te llamas.",
  nameLong: `Tu nombre puede tener hasta ${LIMITS.name} letras.`,
  birth: "Mueve las ruedas hasta tu fecha de nacimiento.",
  birthInvalid: "Revisa la fecha: tiene que ser un día real y anterior a hoy.",
} as const;

/** Spaces collapsed, trimmed and cut to `max` characters. */
export function clean(value: string, max: number) {
  return [...value.replace(/\s+/g, " ").trim()].slice(0, max).join("");
}

export function nameError(name: string): string | null {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) return WELCOME_ERRORS.name;
  if ([...value].length > LIMITS.name) return WELCOME_ERRORS.nameLong;
  return null;
}

const same = (a: string, b: string) =>
  a.localeCompare(b, "es", { sensitivity: "base" }) === 0;

/**
 * Adds a custom hobby: trimmed to 30 characters, no duplicates (ignoring case
 * and accents) and never more than 8. Returns the same list when it cannot.
 */
export function addInterest(list: readonly string[], value: string): string[] {
  const item = clean(value, LIMITS.interest);
  if (!item || list.length >= LIMITS.interests) return [...list];
  if (list.some((x) => same(x, item))) return [...list];
  return [...list, item];
}

export function toggleInterest(list: readonly string[], value: string): string[] {
  if (list.some((x) => same(x, value))) return list.filter((x) => !same(x, value));
  return addInterest(list, value);
}

/** Usual Spanish short forms. Only used as suggestions the student can ignore. */
const SHORT: Record<string, string> = {
  alejandro: "Ale",
  alejandra: "Ale",
  alberto: "Albert",
  antonio: "Toni",
  beatriz: "Bea",
  cristina: "Cris",
  cristian: "Cris",
  daniel: "Dani",
  daniela: "Dani",
  eduardo: "Edu",
  enrique: "Quique",
  fernando: "Fer",
  francisco: "Fran",
  gabriel: "Gabi",
  gabriela: "Gabi",
  guillermo: "Guille",
  ignacio: "Nacho",
  isabel: "Isa",
  javier: "Javi",
  jesús: "Chus",
  josé: "Pepe",
  manuel: "Manu",
  maría: "Mari",
  natalia: "Nati",
  nicolás: "Nico",
  patricia: "Patri",
  rafael: "Rafa",
  ramón: "Moncho",
  roberto: "Rober",
  santiago: "Santi",
  sebastián: "Sebas",
  susana: "Susi",
  valentina: "Vale",
  victoria: "Vicky",
};

/** Chips on «¿Cómo quieres que te llame la IA?»: the name, the first name and a short form. */
export function nicknameSuggestions(name: string): string[] {
  const full = clean(name, LIMITS.name);
  if (!full) return [];
  const first = full.split(" ")[0];
  const out: string[] = [];
  const push = (v: string | undefined) => {
    const item = v ? clean(v, LIMITS.nickname) : "";
    if (item && !out.some((x) => same(x, item))) out.push(item);
  };
  push(first);
  push(SHORT[first.toLocaleLowerCase("es")]);
  if ([...full].length <= LIMITS.nickname) push(full);
  return out;
}

/** What the AI calls the student: their choice, or the first name. */
export function nicknameFor(nickname: string, name: string) {
  return clean(nickname, LIMITS.nickname) || nicknameSuggestions(name)[0] || "";
}

/**
 * Step to open: where the student was (dream-api keeps `onboarding_step`, the
 * index of the next step) or, after a withdrawn permission or new terms, the
 * consent step only. The age is never resumed: it is not saved before the
 * consent, so a reload asks it again.
 */
export function resumeStep(profile: ConsentProfile | null | undefined, gate: "welcome" | "consent"): WelcomeStep {
  if (gate === "consent") return profile?.age_band ? "ia" : "edad";
  const i = Math.max(0, Math.min(4, Math.trunc(profile?.onboarding_step ?? 0)));
  return WELCOME_STEPS[i].key;
}

export function stepIndex(step: WelcomeStep) {
  return WELCOME_STEPS.findIndex((s) => s.key === step);
}

// ---------------------------------------------------------------- Fecha de nacimiento

export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export interface BirthParts {
  day: number;
  month: number; // 1–12
  year: number;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Years on the wheel: from 100 years ago to this year, oldest first. */
export function birthYears(today = new Date()) {
  const last = today.getFullYear();
  return Array.from({ length: 101 }, (_, i) => last - 100 + i);
}

/** Where the wheels start before the student moves them (nothing is chosen yet). */
export function initialBirth(today = new Date()): BirthParts {
  return { day: 1, month: 1, year: today.getFullYear() - 15 };
}

/** The day is clamped to the month (31 → 28 on February). */
export function setBirthPart(parts: BirthParts, key: keyof BirthParts, value: number): BirthParts {
  const next = { ...parts, [key]: value };
  next.day = Math.min(next.day, daysInMonth(next.year, next.month));
  return next;
}

export function birthIso(parts: BirthParts) {
  return isoDate(new Date(parts.year, parts.month - 1, parts.day));
}

/** «3 de mayo de 2010». */
export function birthLabel(parts: BirthParts) {
  return `${parts.day} de ${MONTHS[parts.month - 1]} de ${parts.year}`;
}

export function birthFromIso(iso: string): BirthParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** null when it can go on; otherwise the reason (or «menor» under 14). */
export function birthCheck(
  iso: string,
  touched: boolean,
  today = new Date(),
): { error: string } | { minor: true } | null {
  if (!touched) return { error: WELCOME_ERRORS.birth };
  const age = ageOn(iso, today);
  if (age === null) return { error: WELCOME_ERRORS.birthInvalid };
  if (age < MIN_AGE) return { minor: true };
  return null;
}

/** Wheel keyboard: arrows ±1, Re Pág/Av Pág ±`page`, Inicio and Fin. */
export function wheelIndexForKey(index: number, count: number, key: string, page = 5): number | null {
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case "ArrowUp":
      return clamp(index - 1);
    case "ArrowDown":
      return clamp(index + 1);
    case "PageUp":
      return clamp(index - page);
    case "PageDown":
      return clamp(index + page);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
