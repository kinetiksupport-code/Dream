// Comprobaciones automáticas de los evals (sin IA). Cada una recibe la
// respuesta final de Dream y devuelve true/false. Las usa comparar-modelos.mjs
// y las prueba tests/evals-checks.test.ts con respuestas reales buenas y malas.

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
