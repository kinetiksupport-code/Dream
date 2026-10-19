// La IA identifica el examen a partir de los apuntes (PROMPT_EXAMEN_ESTILO.md
// §5.7 y §9.1): nombre, asignatura y temas. Módulo puro (sin Deno ni npm),
// probado con Node en tests/exam-identify.test.ts.
//
// - Solo recibe el texto extraído de los apuntes, delimitado como datos
//   (wrapStudentMaterial, PR #31). Nunca el correo ni el nombre del alumno.
// - La salida es JSON estricto y se valida aquí: longitudes, caracteres y la
//   asignatura de una lista cerrada (o «Otra»).
import { MATERIAL_GUARD, wrapStudentMaterial } from './file-guard.mjs';

/** Lista cerrada. Debe coincidir con KNOWN_SUBJECTS de lib/subject-objects.ts (hay prueba). */
export const IDENTIFY_SUBJECTS = Object.freeze([
  'Matemáticas', 'Lengua y Literatura', 'Inglés', 'Historia', 'Geografía',
  'Geografía e Historia', 'Biología', 'Biología y Geología', 'Física', 'Química',
  'Física y Química', 'Filosofía', 'Economía', 'Informática', 'Tecnología',
  'Música', 'Plástica', 'Educación Física', 'Otra',
]);
export const OTHER_SUBJECT = 'Otra';

export const IDENTIFY_LIMITS = Object.freeze({
  titleMin: 3,
  titleMax: 80,
  topicMin: 2,
  topicMax: 60,
  topicsMax: 8,
  /** Material que ve la IA: suficiente para reconocer el tema, barato. */
  materialChars: 12000,
});

/** Letras, números, espacios y puntuación corriente. Sin < > { } ` \ ni control. */
const SAFE_TEXT = /^[\p{L}\p{M}\p{N} .,:;()'"«»¿?¡!&+/·ºª%–—-]+$/u;

const norm = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Limpia espacios; null si no es un texto válido entre min y max. */
export function cleanText(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (text.length < min || text.length > max) return null;
  if (!SAFE_TEXT.test(text) || !/\p{L}/u.test(text)) return null;
  return text;
}

/** La asignatura de la lista que corresponde, u «Otra». */
export function canonicalSubject(value) {
  if (typeof value !== 'string') return OTHER_SUBJECT;
  const n = norm(value);
  return IDENTIFY_SUBJECTS.find((s) => norm(s) === n) ?? OTHER_SUBJECT;
}

/**
 * Valida la respuesta de la IA.
 * @returns {{ok: true, value: {title: string, subject: string, topics: string[]}} | {ok: false, reason: string}}
 */
export function validateIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not_object' };
  const title = cleanText(raw.title, IDENTIFY_LIMITS.titleMin, IDENTIFY_LIMITS.titleMax);
  if (!title) return { ok: false, reason: 'title' };
  if (typeof raw.subject !== 'string') return { ok: false, reason: 'subject' };
  if (raw.topics !== undefined && !Array.isArray(raw.topics)) return { ok: false, reason: 'topics' };
  const seen = new Set();
  const topics = [];
  for (const item of (raw.topics ?? []).slice(0, 20)) {
    const topic = cleanText(item, IDENTIFY_LIMITS.topicMin, IDENTIFY_LIMITS.topicMax);
    if (!topic || seen.has(norm(topic))) continue;
    seen.add(norm(topic));
    topics.push(topic);
    if (topics.length === IDENTIFY_LIMITS.topicsMax) break;
  }
  return { ok: true, value: { title, subject: canonicalSubject(raw.subject), topics } };
}

/** Instrucción de sistema (modo Normal, JSON). */
export function identifySystem() {
  return [
    'Eres el asistente de Dream que pone nombre a un examen a partir de los apuntes de un estudiante de ESO o Bachillerato en España.',
    MATERIAL_GUARD,
    'Devuelve SOLO un objeto JSON con esta forma exacta: {"title":"...","subject":"...","topics":["..."]}.',
    `"title": nombre corto y claro del examen, de ${IDENTIFY_LIMITS.titleMin} a ${IDENTIFY_LIMITS.titleMax} caracteres, en español, sin comillas ni emojis (por ejemplo «Ecuaciones de segundo grado»).`,
    `"subject": exactamente una de estas asignaturas: ${IDENTIFY_SUBJECTS.join(', ')}. Si no encaja ninguna, "Otra".`,
    `"topics": de 1 a ${IDENTIFY_LIMITS.topicsMax} temas que aparecen de verdad en los apuntes, cada uno de ${IDENTIFY_LIMITS.topicMin} a ${IDENTIFY_LIMITS.topicMax} caracteres.`,
    'No inventes contenidos que no estén en el material. No incluyas nombres de personas ni datos personales.',
  ].join('\n');
}

/** Contexto: solo el material delimitado como datos. */
export function identifyContext(materials) {
  return `Apuntes del examen:\n${wrapStudentMaterial(materials, IDENTIFY_LIMITS.materialChars)}`;
}
