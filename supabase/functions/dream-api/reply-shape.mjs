// Forma de las respuestas del chat (docs/HABLA_NATURAL.md). Sin IA y sin
// guardar texto: solo cuenta. Lo usan dream-api (contadores en los logs) y los
// evals (evals/checks.mjs), así los dos miden lo mismo.

const WORD = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

/** Palabras visibles: sin marcas ocultas y con cada fórmula como una palabra. */
export function replyWords(text) {
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, ' fórmula ')
    .replace(/\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' fórmula ');
  return (plain.match(WORD) ?? []).length;
}

/**
 * Frases de relleno o de robot. En minúsculas; se buscan sin distinguir
 * mayúsculas. «claro» solo cuenta al empezar la respuesta («¡Claro!»,
 * «Claro, …»), no dentro de una frase («está claro que…»).
 */
export const ROBOT_PHRASES = Object.freeze([
  'aquí tienes',
  'gran pregunta',
  'excelente pregunta',
  'buena pregunta',
  'espero que te ayude',
  'espero que te sirva',
  'espero haberte ayudado',
  '¿te queda claro',
  '¿lo entiendes',
  '¿tiene sentido',
  'como ia',
  'como una ia',
  'como modelo de lenguaje',
  'no dudes en preguntar',
  'si tienes más preguntas',
  'si tienes alguna otra pregunta',
  'estoy aquí para ayudarte',
  'en resumen,',
  'en conclusión,',
  'es importante destacar',
  'cabe destacar',
  'cabe señalar',
  'vamos a desglosar',
  'desglosemos',
  'sumerjámonos',
  'por supuesto',
  'básicamente',
]);
const OPENER = /^\s*[¡]?\s*(claro|perfecto|genial|excelente|entendido)\s*[!,.:]/i;

/** Frases de robot que aparecen (sin repetir). */
export function robotPhrases(text) {
  const lower = String(text ?? '').toLowerCase();
  const found = ROBOT_PHRASES.filter((p) => lower.includes(p));
  if (OPENER.test(String(text ?? ''))) found.unshift('apertura de relleno');
  return found;
}

export const hasNumberedList = (text) => /^\s*\d+[.)]\s+\S/m.test(String(text ?? ''));
export const hasBulletList = (text) => /^\s*[-*•]\s+\S/m.test(String(text ?? ''));
export const hasHeading = (text) => /^\s{0,3}#{1,6}\s+\S/m.test(String(text ?? '')) || /^\s*\*\*[^*\n]{2,60}\*\*\s*:?\s*$/m.test(String(text ?? ''));
export const hasBold = (text) => /\*\*[^*\n]+\*\*/.test(String(text ?? ''));

/**
 * Letras de otras escrituras que no deberían salir en una respuesta en
 * español: chino, japonés, coreano, cirílico, árabe, hebreo, tailandés,
 * devanagari… (Qwen a veces cuela caracteres chinos). Los símbolos
 * matemáticos y las letras griegas (π, Δ, α) sí valen.
 */
const FOREIGN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]/u;
const FOREIGN_ALL = new RegExp(FOREIGN.source, 'gu');
export const hasForeignScript = (text) => FOREIGN.test(String(text ?? ''));
export const foreignCount = (text) => (String(text ?? '').match(FOREIGN_ALL) ?? []).length;

/** Preguntas (signos de cierre) de la respuesta. */
export const questionCount = (text) => (String(text ?? '').match(/\?/g) ?? []).length;

/**
 * Legibilidad de Fernández-Huerta (adaptación al español de Flesch):
 * 206,84 − 0,60·P − 1,02·F, con P = sílabas por 100 palabras y F = frases por
 * 100 palabras. 60-70 es «normal»; más de 70, fácil; menos de 50, difícil.
 * Las sílabas se cuentan por grupos de vocales (aproximación: une los
 * diptongos y separa los hiatos con tilde).
 */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 0;
  // Hiato con tilde en la débil (río, país, oído): dos sílabas.
  const hiatus = (w.match(/[aeo][íú]|[íú][aeo]/g) ?? []).length;
  const groups = (w.match(/[aeiouáéíóúü]+/g) ?? []).length;
  // Dos fuertes juntas (le-er, ca-os) también son hiato.
  const strong = (w.match(/[aeoáéó](?=[aeoáéó])/g) ?? []).length;
  return Math.max(1, groups + hiatus + strong);
}

export function readability(text) {
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' ')
    .replace(/[*_#`>]/g, ' ');
  const words = plain.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  if (words.length < 5) return null;
  const sentences = Math.max(1, (plain.match(/[.!?…]+(\s|$)|\n\s*\n/g) ?? []).length);
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const P = (syl / words.length) * 100;
  const F = (sentences / words.length) * 100;
  return Math.round((206.84 - 0.6 * P - 1.02 * F) * 10) / 10;
}

/**
 * Resumen de una respuesta en números (para los logs y los evals). Nunca
 * lleva texto de la respuesta.
 */
export function scanReply(text) {
  const t = String(text ?? '');
  return {
    words: replyWords(t),
    numbered_list: hasNumberedList(t),
    bullets: hasBulletList(t),
    heading: hasHeading(t),
    bold: hasBold(t),
    robot: robotPhrases(t).length,
    questions: questionCount(t),
    foreign_chars: foreignCount(t),
  };
}
