// Esquemas visuales (docs/ESQUEMAS.md). Qwen solo decide el CONTENIDO en JSON
// estricto; el diseño lo pone el código de Dream (lib/esquema.ts). Aquí:
// esquema JSON para las salidas estructuradas de Groq, validador determinista
// y la generación con un único reintento que le pasa a Qwen los errores.
// Nunca se registra el contenido del alumno ni el del esquema.

export const SCHEME_LIMITS = Object.freeze({
  title: 70, subtitle: 150, subject: 40, heading: 56, period: 24, intro: 260, bullet: 150, quote: 200,
  subcardTitle: 40, year: 24, dateText: 100, formula: 200, highlight: 170, illustration: 160, caption: 90,
  keyIdea: 130, summary: 360, closing: 170,
  sections: [3, 7], bullets: 7, subcards: 3, subBullets: 7, dates: 10, keyIdeas: 4,
});

export const SECTION_KINDS = Object.freeze(['list', 'subcards', 'dates', 'formula', 'examples', 'mistakes', 'legacy']);

const L = SCHEME_LIMITS;
const str = (maxLength) => ({ type: 'string', maxLength });
const bullet = {
  type: 'object', additionalProperties: false, required: ['text', 'quote'],
  properties: { text: str(L.bullet), quote: str(L.quote) },
};

/** Esquema para `response_format: {type: 'json_schema'}` (todas las propiedades obligatorias, sin extras). */
export const SCHEME_JSON_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['title', 'subtitle', 'subject', 'sections', 'key_ideas', 'summary', 'closing'],
  properties: {
    title: str(L.title), subtitle: str(L.subtitle), subject: str(L.subject),
    sections: {
      type: 'array', minItems: L.sections[0], maxItems: L.sections[1],
      items: {
        type: 'object', additionalProperties: false,
        required: ['heading', 'period', 'kind', 'intro', 'bullets', 'subcards', 'dates', 'formula', 'highlight', 'illustration_prompt', 'illustration_caption'],
        properties: {
          heading: str(L.heading),
          period: str(L.period),
          kind: { type: 'string', enum: [...SECTION_KINDS] },
          intro: str(L.intro),
          bullets: { type: 'array', maxItems: L.bullets, items: bullet },
          subcards: {
            type: 'array', maxItems: L.subcards,
            items: {
              type: 'object', additionalProperties: false, required: ['title', 'period', 'bullets'],
              properties: { title: str(L.subcardTitle), period: str(L.period), bullets: { type: 'array', maxItems: L.subBullets, items: bullet } },
            },
          },
          dates: {
            type: 'array', maxItems: L.dates,
            items: {
              type: 'object', additionalProperties: false, required: ['year', 'text', 'quote'],
              properties: { year: str(L.year), text: str(L.dateText), quote: str(L.quote) },
            },
          },
          formula: str(L.formula),
          highlight: str(L.highlight),
          illustration_prompt: { type: ['string', 'null'], maxLength: L.illustration },
          illustration_caption: str(L.caption),
        },
      },
    },
    key_ideas: { type: 'array', maxItems: L.keyIdeas, items: str(L.keyIdea) },
    summary: str(L.summary), closing: str(L.closing),
  },
});

const HTML = /<\/?[a-z][^>]*>|&[a-z]+;|javascript:/i;
const MARKDOWN_JUNK = /(^|\s)(#{1,6}\s|```)/;
// Palabras muy frecuentes del inglés que casi nunca aparecen en un texto en español.
const ENGLISH = new Set(['the', 'and', 'of', 'with', 'which', 'was', 'were', 'is', 'are', 'this', 'that', 'from', 'by', 'for', 'its', 'their']);
const SPANISH = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'en', 'que', 'un', 'una', 'por', 'con', 'se', 'su', 'para', 'es', 'al']);
const HAS_FACT = /\d/;
const numbersIn = (text) => String(text ?? '').match(/\d+/g) ?? [];

/** Minúsculas, sin tildes ni signos, espacios simples: para comparar citas. */
export function normalizeForQuote(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[«»"“”'‘’`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** La cita (≥ 4 palabras) aparece tal cual en la fuente, salvo tildes y signos. */
export function quoteFound(quote, sourceNorm) {
  const q = normalizeForQuote(quote);
  if (!q || q.split(' ').length < 4) return false;
  return ` ${sourceNorm} `.includes(` ${q} `);
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Primer año (o siglo en romanos) de un campo «year», para ordenar. */
export function yearValue(year) {
  const text = clean(year).toLowerCase();
  const bc = /a\.?\s*c\.?|antes de cristo|a\.\s*e\.\s*c/.test(text) ? -1 : 1;
  const n = text.match(/\d{1,4}/);
  if (n) return bc * Number(n[0]);
  const roman = text.match(/\b(?:siglo\s+)?([ivxl]+)\b/);
  if (!roman) return null;
  const map = { i: 1, v: 5, x: 10, l: 50 };
  let total = 0;
  const chars = [...roman[1]];
  chars.forEach((c, i) => { const v = map[c]; total += v < (map[chars[i + 1]] || 0) ? -v : v; });
  return bc * (total * 100 - 50);
}

function languageLooksEnglish(text) {
  const words = normalizeForQuote(text).split(' ').filter(Boolean);
  if (words.length < 12) return false;
  const en = words.filter((w) => ENGLISH.has(w)).length;
  const es = words.filter((w) => SPANISH.has(w)).length;
  return en > es;
}

/**
 * Valida y limpia lo que devuelve la IA.
 * - `errors`: fallos graves (se reintenta una vez pasándoselos a la IA).
 * - `dropped`: viñetas o fechas con cifras cuya cita no está en la fuente; se
 *   quitan sin reintentar (nunca se enseña un dato sin respaldo).
 * - Las cifras de los textos libres (título, periodos, introducciones,
 *   destacados, pies de foto, ideas, resumen, cierre) tienen que estar ya
 *   respaldadas por alguna viñeta o fecha con cita; si no, es un error grave.
 * Si no hay fuente (`sources` vacío) no se comprueban citas: el que llama
 * decide si eso se permite (con apuntes o búsqueda siempre hay fuente).
 * @param {unknown} raw
 * @param {{ sources?: string }} [options]
 */
export function validateScheme(raw, { sources = '' } = {}) {
  const errors = [];
  let dropped = 0;
  let checkedFacts = 0;
  let foundFacts = 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { scheme: null, errors: ['La respuesta no es un objeto JSON.'], dropped, checkedFacts, foundFacts };
  const r = /** @type {Record<string, any>} */ (raw);
  const sourceNorm = sources ? normalizeForQuote(sources) : '';
  const texts = [];
  const verified = new Set();
  const freeNumbers = [];
  const field = (value, max, where, { required = true, free = false } = {}) => {
    const text = clean(value);
    if (required && !text) errors.push(`${where}: está vacío.`);
    if (text.length > max) errors.push(`${where}: tiene ${text.length} caracteres y el máximo es ${max}.`);
    if (HTML.test(text)) errors.push(`${where}: no puede llevar HTML.`);
    if (MARKDOWN_JUNK.test(text)) errors.push(`${where}: no puede llevar títulos Markdown ni bloques de código.`);
    if (free) numbersIn(text).forEach((n) => freeNumbers.push([n, where]));
    texts.push(text);
    return text.slice(0, max);
  };
  // Un dato con cifras solo pasa si su cita está en la fuente y contiene todas sus cifras.
  const supported = (text, quote) => {
    if (!sourceNorm || !HAS_FACT.test(text)) return true;
    checkedFacts++;
    const quoted = new Set(numbersIn(quote));
    if (quoteFound(quote, sourceNorm) && numbersIn(text).every((n) => quoted.has(n))) {
      foundFacts++;
      numbersIn(text).forEach((n) => verified.add(n));
      return true;
    }
    dropped++;
    return false;
  };
  const bullets = (list, max, where) => {
    if (!Array.isArray(list)) { errors.push(`${where}: debe ser una lista.`); return []; }
    if (list.length > max) errors.push(`${where}: tiene ${list.length} viñetas y el máximo es ${max}.`);
    const seen = new Set();
    return list.slice(0, max).flatMap((b, i) => {
      const text = field(b?.text, L.bullet, `${where}[${i + 1}]`);
      const quote = clean(b?.quote).slice(0, L.quote);
      const key = normalizeForQuote(text);
      if (key && seen.has(key)) { errors.push(`${where}[${i + 1}]: viñeta repetida.`); return []; }
      seen.add(key);
      return text && supported(text, quote) ? [{ text, quote }] : [];
    });
  };

  const title = field(r.title, L.title, 'title', { free: true });
  const subtitle = field(r.subtitle, L.subtitle, 'subtitle', { required: false, free: true });
  const subject = field(r.subject, L.subject, 'subject', { required: false });
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  if (rawSections.length < L.sections[0] || rawSections.length > L.sections[1]) errors.push(`sections: tiene ${rawSections.length} secciones y deben ser entre ${L.sections[0]} y ${L.sections[1]}.`);
  const headings = new Set();
  const sections = rawSections.slice(0, L.sections[1]).map((s, i) => {
    const where = `sections[${i + 1}]`;
    const heading = field(s?.heading, L.heading, `${where}.heading`, { free: true });
    const hk = normalizeForQuote(heading);
    if (hk && headings.has(hk)) errors.push(`${where}.heading: título de sección repetido.`);
    headings.add(hk);
    const period = field(s?.period, L.period, `${where}.period`, { required: false, free: true });
    const kind = SECTION_KINDS.includes(s?.kind) ? s.kind : (errors.push(`${where}.kind: «${clean(s?.kind).slice(0, 20)}» no es un tipo válido.`), 'list');
    const intro = field(s?.intro, L.intro, `${where}.intro`, { required: false, free: true });
    const sectionBullets = bullets(s?.bullets ?? [], L.bullets, `${where}.bullets`);
    const subcards = (Array.isArray(s?.subcards) ? s.subcards : []).slice(0, L.subcards).map((c, j) => ({
      title: field(c?.title, L.subcardTitle, `${where}.subcards[${j + 1}].title`, { free: true }),
      period: field(c?.period, L.period, `${where}.subcards[${j + 1}].period`, { required: false, free: true }),
      bullets: bullets(c?.bullets ?? [], L.subBullets, `${where}.subcards[${j + 1}].bullets`),
    })).filter((c) => c.title && c.bullets.length);
    const dates = (Array.isArray(s?.dates) ? s.dates : []).slice(0, L.dates).flatMap((d, j) => {
      const year = field(d?.year, L.year, `${where}.dates[${j + 1}].year`);
      const text = field(d?.text, L.dateText, `${where}.dates[${j + 1}].text`);
      const quote = clean(d?.quote).slice(0, L.quote);
      return year && text && supported(`${year} ${text}`, quote) ? [{ year, text, quote }] : [];
    });
    const values = dates.map((d) => yearValue(d.year));
    if (values.every((v) => v !== null) && values.some((v, k) => k > 0 && v < values[k - 1])) errors.push(`${where}.dates: las fechas deben ir en orden cronológico.`);
    const formula = field(s?.formula, L.formula, `${where}.formula`, { required: false });
    const highlight = field(s?.highlight, L.highlight, `${where}.highlight`, { required: false, free: true });
    const illustration = s?.illustration_prompt == null ? null : clean(s.illustration_prompt).slice(0, L.illustration) || null;
    const caption = illustration ? field(s?.illustration_caption, L.caption, `${where}.illustration_caption`, { required: false, free: true }) : '';
    if (kind === 'subcards' && !subcards.length && !sectionBullets.length) errors.push(`${where}: es de tipo subcards y no tiene subtarjetas.`);
    if (kind === 'dates' && !dates.length && !sectionBullets.length) errors.push(`${where}: es de tipo dates y no tiene fechas.`);
    if (kind === 'formula' && !formula) errors.push(`${where}: es de tipo formula y no tiene fórmula.`);
    return { heading, period, kind, intro, bullets: sectionBullets, subcards, dates, formula, highlight, illustration_prompt: illustration, illustration_caption: caption };
  });
  // Si quitar datos sin respaldo deja una sección vacía, la sección se va.
  const kept = sections.filter((s) => s.intro || s.bullets.length || s.subcards.length || s.dates.length || s.formula);
  if (rawSections.length >= L.sections[0] && kept.length < L.sections[0] && !errors.length) errors.push(`Tras quitar los datos sin cita en la fuente quedan ${kept.length} secciones: usa solo datos que aparezcan en la fuente.`);
  const keyIdeas = (Array.isArray(r.key_ideas) ? r.key_ideas : []).slice(0, L.keyIdeas)
    .map((k, i) => field(k, L.keyIdea, `key_ideas[${i + 1}]`, { free: true })).filter(Boolean);
  const summary = field(r.summary, L.summary, 'summary', { required: false, free: true });
  const closing = field(r.closing, L.closing, 'closing', { required: false, free: true });
  if (sourceNorm) {
    const unbacked = [...new Map(freeNumbers.filter(([n]) => !verified.has(n)).map(([n, where]) => [n, where])).entries()];
    unbacked.slice(0, 6).forEach(([n, where]) => errors.push(`${where}: la cifra ${n} no está en ninguna viñeta o fecha con cita de la fuente. Quítala o añade esa viñeta con su cita.`));
  }
  if (texts.some(languageLooksEnglish) || languageLooksEnglish(texts.join(' '))) errors.push('El texto debe estar en español de España, no en inglés.');
  const scheme = { title, subtitle, subject, sections: kept, key_ideas: keyIdeas, summary, closing };
  return { scheme: errors.length ? null : scheme, errors: errors.slice(0, 20), dropped, checkedFacts, foundFacts };
}

/**
 * Genera un esquema: una llamada y, si falla la validación, un único
 * reintento con la lista exacta de errores. `call(messages)` devuelve el
 * objeto JSON ya parseado (o lanza). Sin éxito → `{ ok: false }` y el que
 * llama no gasta el cupo del alumno.
 * @param {{ call: (messages: {role: string, content: string}[]) => Promise<unknown>, messages: {role: string, content: string}[], sources?: string }} input
 */
export async function generateScheme({ call, messages, sources = '' }) {
  let attempts = 0;
  let last = { errors: ['Sin respuesta.'] };
  let history = messages;
  while (attempts < 2) {
    attempts++;
    let raw;
    try { raw = await call(history); }
    catch (error) { if (attempts >= 2 || error?.name === 'AdmissionError') throw error; last = { errors: ['La respuesta no era JSON válido.'] }; continue; }
    const result = validateScheme(raw, { sources });
    if (result.scheme) return { ok: true, attempts, ...result };
    last = result;
    history = [...messages, { role: 'assistant', content: JSON.stringify(raw).slice(0, 12000) },
      { role: 'user', content: `El JSON tiene estos errores. Corrígelos y devuelve el JSON completo otra vez:\n- ${result.errors.join('\n- ')}` }];
  }
  return { ok: false, attempts, ...last, scheme: null };
}
