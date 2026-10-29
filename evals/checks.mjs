// Comprobaciones automáticas de los evals (sin IA). Cada una recibe la
// respuesta final de Dream y devuelve true/false. Las usa comparar-modelos.mjs
// y las prueba tests/evals-checks.test.ts con respuestas reales buenas y malas.

import { hasForeignScript, readability, robotPhrases, scanReply } from '../supabase/functions/dream-api/reply-shape.mjs';

export { readability, robotPhrases, scanReply };

const WORD = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

/** Palabras visibles (sin LaTeX ni Markdown). */
export function wordCount(text) {
  const plain = String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, ' fórmula ')
    .replace(/\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' fórmula ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return (plain.match(WORD) ?? []).length;
}

export const hasNumberedList = (text) => /^\s*\d+[.)]\s+\S/m.test(text);
export const hasBulletList = (text) => /^\s*[-*•]\s+\S/m.test(text);
export const hasList = (text) => hasNumberedList(text) || hasBulletList(text);
export const hasHeading = (text) => /^\s{0,3}#{1,6}\s+\S/m.test(text) || /^\s*\*\*[^*\n]{2,60}\*\*\s*:?\s*$/m.test(text);

/** Preguntas reales (signo de cierre). */
export const questionCount = (text) => (String(text).match(/\?/g) ?? []).length;
export const endsWithQuestion = (text) => /\?\s*[)»"”*_]*\s*$/.test(String(text).trim());
export const singleQuestion = (text) => questionCount(text) === 1 && endsWithQuestion(text);

/** Frases prohibidas (sin distinguir mayúsculas). */
export function forbiddenFound(text, phrases = []) {
  const lower = String(text).toLowerCase();
  return phrases.filter((p) => lower.includes(p.toLowerCase()));
}

/**
 * Números pegados dos veces, el fallo de KaTeX sin su hoja de estilos:
 * 246/100 se ve como «246100100246» (MathML + HTML con el denominador delante).
 */
export const hasDuplicatedNumbers = (text) => /(\d{2,})(\d{2,})\2\1/.test(String(text).replace(/[\s.,]/g, ''));

/**
 * Corrector de español (hunspell, diccionario es de LibreOffice vía nspell).
 * Se carga una vez. Se saltan los nombres propios (mayúscula inicial que no
 * empieza frase), las siglas, las palabras con números y lo que va entre
 * comillas, cursiva o fórmula (citas del ejercicio, otros idiomas).
 */
let speller = null;
export async function loadSpeller() {
  if (speller) return speller;
  const [{ default: dictionary }, { default: nspell }] = await Promise.all([import('dictionary-es'), import('nspell')]);
  speller = nspell(dictionary);
  // Palabras de Dream y del aula que el diccionario no trae.
  for (const w of ['Dream', 'Dreams', 'apuntes', 'finde', 'profe', 'profes', 'mates', 'selectividad', 'PAU', 'EBAU', 'ESO', 'online', 'quiz', 'sintagma', 'sintagmas', 'generatriz', 'vale']) speller.add(w);
  return speller;
}

/** Errores de ortografía por cada 100 palabras (meta: menos de 1). */
export function spellingErrors(text, spell = speller) {
  if (!spell) throw new Error('Llama antes a loadSpeller()');
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' ')
    .replace(/[«"“][^»"”]*[»"”]|\*[^*\n]+\*|_[^_\n]+_|`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
  const words = [];
  for (const m of plain.matchAll(/(^|[.!?¿¡]\s*|\s)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g)) {
    const w = m[2];
    const starts = /^$|[.!?¿¡]\s*$/.test(m[1]);
    if (/^[A-ZÁÉÍÓÚÑ]/.test(w) && !starts) continue; // nombre propio
    if (w.length > 1 && w === w.toUpperCase()) continue; // sigla
    words.push(w);
  }
  if (!words.length) return { errors: [], per100: 0 };
  const errors = words.filter((w) => !spell.correct(w) && !spell.correct(w.toLowerCase()));
  return { errors, per100: Math.round((errors.length / words.length) * 1000) / 10 };
}

/**
 * Da el procedimiento entero (lo que Carlos no quiere): lista numerada de
 * pasos o tres o más líneas con «=» seguidas.
 */
export const givesWholeProcedure = (text) =>
  /^\s*\d+[.)]\s+\S/m.test(text) && (String(text).match(/^\s*\d+[.)]\s+\S/gm) ?? []).length >= 3
  || (String(text).match(/^[^\n]*=[^\n]*$/gm) ?? []).length >= 3;

export const matchesAny = (text, patterns = []) => patterns.some((p) => new RegExp(p, 'i').test(text));

/**
 * Aplica las comprobaciones de un caso. `run` trae la respuesta y lo que hizo
 * el servidor ({ answer, searched, query, prompt }).
 * @returns {Record<string, boolean>} un resultado por criterio
 */
export function checkCase(expect, run, { unsure } = {}) {
  const a = run.answer ?? '';
  const out = {};
  if (expect.maxWords) out.maxWords = wordCount(a) <= expect.maxWords;
  if (expect.noLists) out.noLists = !hasList(a);
  if (expect.noHeadings) out.noHeadings = !hasHeading(a);
  if (expect.forbidden?.length) out.forbidden = forbiddenFound(a, expect.forbidden).length === 0;
  if (expect.endsWithQuestion) out.endsWithQuestion = endsWithQuestion(a);
  if (expect.singleQuestion) out.singleQuestion = singleQuestion(a);
  if (expect.mustMatchAny) out.mustMatchAny = matchesAny(a, expect.mustMatchAny);
  if (expect.mustNotMatch) out.mustNotMatch = !new RegExp(expect.mustNotMatch, 'i').test(a);
  if (expect.reactsTo) out.reactsTo = new RegExp(expect.reactsTo, 'i').test(a.split(/[.!?]/)[0] ?? '');
  if (expect.noDuplicateNumbers) out.noDuplicateNumbers = !hasDuplicatedNumbers(a);
  if (expect.saysUnsure) out.saysUnsure = new RegExp(unsure, 'i').test(a);
  if (typeof expect.searched === 'boolean') out.searched = Boolean(run.searched) === expect.searched;
  if (expect.queryNotPasted) out.queryNotPasted = !run.query || !run.queryPasted;
  if (expect.noRobot) out.noRobot = robotPhrases(a).length === 0;
  if (expect.noForeign) out.noForeign = !hasForeignScript(a);
  if (expect.oneStep) out.oneStep = !givesWholeProcedure(a);
  if (expect.minReadability) { const r = readability(a); out.minReadability = r === null || r >= expect.minReadability; }
  if (expect.maxSpelling !== undefined && speller) out.maxSpelling = spellingErrors(a).per100 <= expect.maxSpelling;
  if (expect.mustMatch) out.mustMatch = new RegExp(expect.mustMatch, 'i').test(a);
  return out;
}

/** Une los valores por defecto del archivo con los del caso. */
export function expectationsFor(file, testCase) {
  const d = file.defaults ?? {};
  return { ...d, ...testCase.expect, forbidden: [...(d.forbidden ?? []), ...(testCase.expect?.forbidden ?? [])] };
}

/** % de mensajes con el apodo (debe ser ≤ 1 de cada 3). */
export function nicknameRate(answers, nickname) {
  if (!answers.length || !nickname) return 0;
  const re = new RegExp(`(?<![\\p{L}])${nickname}(?![\\p{L}])`, 'iu');
  return answers.filter((a) => re.test(a)).length / answers.length;
}
