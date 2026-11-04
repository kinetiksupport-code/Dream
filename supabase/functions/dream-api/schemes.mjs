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
// Cifras sueltas: las pegadas a letras o a ^ y _ son parte de una fórmula
// (CO2, H2O, x^2, 4ac) y no cuentan como dato.
const NUMBER = /(?<![\p{L}\d^_])\d+(?![\p{L}\d])/gu;
// Lo que va entre $…$ es matemática en línea (KaTeX): tampoco cuenta.
const numbersIn = (text) => String(text ?? '').replace(/\$[^$\n]{1,200}\$/g, ' ').match(NUMBER) ?? [];
/** «1936-1936» → «1936». */
const tidyPeriod = (period) => { const m = period.match(/^\s*(\S+)\s*[-–]\s*(\S+)\s*$/); return m && m[1] === m[2] ? m[1] : period; };
/** Quita el año repetido al principio del texto de una fecha («1085: 1085: Conquista…»). */
const stripYear = (text, year) => {
  let out = text;
  for (let i = 0; i < 2; i++) {
    const lower = out.toLowerCase();
    const y = year.toLowerCase();
    if (!lower.startsWith(y)) break;
    out = out.slice(year.length).replace(/^[\s:.,–-]+/, '');
  }
  return out ? out[0].toUpperCase() + out.slice(1) : text;
};
const hasFact = (text) => numbersIn(text).length > 0;

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
 *   destacados, pies de foto, ideas, resumen, cierre) tienen que aparecer en
 *   la fuente; si no, es un error grave.
 * Si no hay fuente (`sources` vacío) no se comprueban citas: el que llama
 * decide si eso se permite (con apuntes o búsqueda siempre hay fuente).
 * @param {unknown} raw
 * @param {{ sources?: string }} [options]
 */
export function validateScheme(raw, { sources = '', lenient = false } = {}) {
  const errors = [];
  // Modo «arreglar» (último recurso tras los reintentos): los fallos pequeños
  // se corrigen solos (recortar, ordenar, quitar la frase con una cifra sin
  // respaldo) en vez de tirar el esquema entero. Nunca se inventa nada: solo se quita.
  const soft = [];
  const fix = (message) => (lenient ? soft.push(message) : errors.push(message));
  let dropped = 0;
  let checkedFacts = 0;
  let foundFacts = 0;
  /** @type {string[]} */ const droppedTexts = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { scheme: null, errors: ['La respuesta no es un objeto JSON.'], dropped, checkedFacts, foundFacts };
  const r = /** @type {Record<string, any>} */ (raw);
  const sourceNorm = sources ? normalizeForQuote(sources) : '';
  const texts = [];
  const verified = new Set();
  const freeNumbers = [];
  const field = (value, max, where, { required = true, free = false } = {}) => {
    let text = clean(value);
    if (lenient) text = text.replace(/<\/?[a-z][^>]*>|&[a-z]+;|javascript:/gi, ' ').replace(/(^|\s)(#{1,6}\s|```)/g, ' ').replace(/\s+/g, ' ').trim();
    if (required && !text) errors.push(`${where}: está vacío.`);
    if (text.length > max) fix(`${where}: tiene ${text.length} caracteres y el máximo es ${max}.`);
    if (HTML.test(text)) errors.push(`${where}: no puede llevar HTML.`);
    if (MARKDOWN_JUNK.test(text)) errors.push(`${where}: no puede llevar títulos Markdown ni bloques de código.`);
    if (free) numbersIn(text).forEach((n) => freeNumbers.push([n, where]));
    texts.push(text);
    return text.slice(0, max);
  };
  // Un dato con cifras solo pasa si su cita está en la fuente y contiene todas sus cifras.
  const supported = (text, quote) => {
    if (!sourceNorm || !hasFact(text)) return true;
    checkedFacts++;
    const quoted = new Set(numbersIn(quote));
    if (quoteFound(quote, sourceNorm) && numbersIn(text).every((n) => quoted.has(n))) {
      foundFacts++;
      numbersIn(text).forEach((n) => verified.add(n));
      return true;
    }
    dropped++;
    droppedTexts.push(String(text).slice(0, 160));
    return false;
  };
  const bullets = (list, max, where) => {
    if (!Array.isArray(list)) { errors.push(`${where}: debe ser una lista.`); return []; }
    if (list.length > max) fix(`${where}: tiene ${list.length} viñetas y el máximo es ${max}.`);
    const seen = new Set();
    return list.slice(0, max).flatMap((b, i) => {
      const text = field(b?.text, L.bullet, `${where}[${i + 1}]`);
      const quote = clean(b?.quote).slice(0, L.quote);
      const key = normalizeForQuote(text);
      if (key && seen.has(key)) { fix(`${where}[${i + 1}]: viñeta repetida.`); return []; }
      seen.add(key);
      return text && supported(text, quote) ? [{ text, quote }] : [];
    });
  };

  const title = field(r.title, L.title, 'title', { free: true });
  const subtitle = field(r.subtitle, L.subtitle, 'subtitle', { required: false, free: true });
  const subject = field(r.subject, L.subject, 'subject', { required: false });
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  if (rawSections.length < L.sections[0]) errors.push(`sections: tiene ${rawSections.length} secciones y deben ser entre ${L.sections[0]} y ${L.sections[1]}.`);
  else if (rawSections.length > L.sections[1]) fix(`sections: tiene ${rawSections.length} secciones y deben ser entre ${L.sections[0]} y ${L.sections[1]}.`);
  const headings = new Set();
  const sections = rawSections.slice(0, L.sections[1]).map((s, i) => {
    const where = `sections[${i + 1}]`;
    const heading = field(s?.heading, L.heading, `${where}.heading`, { free: true });
    const hk = normalizeForQuote(heading);
    if (hk && headings.has(hk)) fix(`${where}.heading: título de sección repetido.`);
    headings.add(hk);
    const period = tidyPeriod(field(s?.period, L.period, `${where}.period`, { required: false, free: true }));
    let kind = SECTION_KINDS.includes(s?.kind) ? s.kind : (fix(`${where}.kind: «${clean(s?.kind).slice(0, 20)}» no es un tipo válido.`), 'list');
    const intro = field(s?.intro, L.intro, `${where}.intro`, { required: false, free: true });
    const sectionBullets = bullets(s?.bullets ?? [], L.bullets, `${where}.bullets`);
    const subcards = (Array.isArray(s?.subcards) ? s.subcards : []).slice(0, L.subcards).map((c, j) => ({
      title: field(c?.title, L.subcardTitle, `${where}.subcards[${j + 1}].title`, { free: true }),
      period: tidyPeriod(field(c?.period, L.period, `${where}.subcards[${j + 1}].period`, { required: false, free: true })),
      bullets: bullets(c?.bullets ?? [], L.subBullets, `${where}.subcards[${j + 1}].bullets`),
    })).filter((c) => c.title && c.bullets.length);
    let dates = (Array.isArray(s?.dates) ? s.dates : []).slice(0, L.dates).flatMap((d, j) => {
      const year = field(d?.year, L.year, `${where}.dates[${j + 1}].year`);
      const text = stripYear(field(d?.text, L.dateText, `${where}.dates[${j + 1}].text`), year);
      const quote = clean(d?.quote).slice(0, L.quote);
      return year && text && supported(`${year} ${text}`, quote) ? [{ year, text, quote }] : [];
    });
    const values = dates.map((d) => yearValue(d.year));
    if (values.every((v) => v !== null) && values.some((v, k) => k > 0 && v < values[k - 1])) {
      fix(`${where}.dates: las fechas deben ir en orden cronológico.`);
      if (lenient) dates = [...dates].sort((a, b) => Number(yearValue(a.year)) - Number(yearValue(b.year)));
    }
    const formula = field(s?.formula, L.formula, `${where}.formula`, { required: false });
    const highlight = field(s?.highlight, L.highlight, `${where}.highlight`, { required: false, free: true });
    const illustration = s?.illustration_prompt == null ? null : clean(s.illustration_prompt).slice(0, L.illustration) || null;
    const caption = illustration ? field(s?.illustration_caption, L.caption, `${where}.illustration_caption`, { required: false, free: true }) : '';
    if (kind === 'subcards' && !subcards.length && !sectionBullets.length) fix(`${where}: es de tipo subcards y no tiene subtarjetas.`);
    if (kind === 'dates' && !dates.length && !sectionBullets.length) fix(`${where}: es de tipo dates y no tiene fechas.`);
    if (kind === 'formula' && !formula) fix(`${where}: es de tipo formula y no tiene fórmula.`);
    if (lenient && ((kind === 'subcards' && !subcards.length) || (kind === 'dates' && !dates.length) || (kind === 'formula' && !formula))) kind = 'list';
    return { heading, period, kind, intro, bullets: sectionBullets, subcards, dates, formula, highlight, illustration_prompt: illustration, illustration_caption: caption };
  });
  // Cifras sin respaldo en los textos libres: en modo arreglar se quita ese texto
  // (o la cifra, si es un título) en vez de tirar el esquema.
  const inSourceAll = sourceNorm ? new Set(numbersIn(sources)) : null;
  const backed = (text) => !inSourceAll || numbersIn(text).every((n) => verified.has(n) || inSourceAll.has(n));
  const dropNumbers = (text) => (backed(text) ? text : text.replace(/\(?\s*\b\d[\d.,:/-]*\b\s*\)?/g, (m) => (backed(m) ? m : ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim());
  if (lenient && inSourceAll) {
    for (const sec of sections) {
      sec.heading = dropNumbers(sec.heading);
      if (!backed(sec.period)) sec.period = '';
      if (!backed(sec.intro)) sec.intro = '';
      if (!backed(sec.highlight)) sec.highlight = '';
      if (!backed(sec.illustration_caption)) sec.illustration_caption = '';
      for (const c of sec.subcards) { c.title = dropNumbers(c.title); if (!backed(c.period)) c.period = ''; }
    }
  }
  // Si quitar datos sin respaldo deja una sección vacía, la sección se va.
  const seenHeadings = new Set();
  const kept = sections.filter((s) => s.intro || s.bullets.length || s.subcards.length || s.dates.length || s.formula)
    .filter((s) => !lenient || (s.heading && !seenHeadings.has(normalizeForQuote(s.heading)) && seenHeadings.add(normalizeForQuote(s.heading))));
  if (rawSections.length >= L.sections[0] && kept.length < L.sections[0] && !errors.length) errors.push(`Tras quitar los datos sin cita en la fuente quedan ${kept.length} secciones: usa solo datos que aparezcan en la fuente.`);
  let keyIdeas = (Array.isArray(r.key_ideas) ? r.key_ideas : []).slice(0, L.keyIdeas)
    .map((k, i) => field(k, L.keyIdea, `key_ideas[${i + 1}]`, { free: true })).filter(Boolean);
  let summary = field(r.summary, L.summary, 'summary', { required: false, free: true });
  let closing = field(r.closing, L.closing, 'closing', { required: false, free: true });
  let fixedTitle = title;
  let fixedSubtitle = subtitle;
  if (lenient && inSourceAll) {
    keyIdeas = keyIdeas.filter(backed);
    if (!backed(summary)) summary = '';
    if (!backed(closing)) closing = '';
    fixedTitle = dropNumbers(title) || title;
    if (!backed(subtitle)) fixedSubtitle = '';
  }
  if (sourceNorm && !lenient) {
    // En los textos sin cita solo valen cifras ya respaldadas o que aparecen en la fuente.
    const inSource = new Set(numbersIn(sources));
    const unbacked = [...new Map(freeNumbers.filter(([n]) => !verified.has(n) && !inSource.has(n)).map(([n, where]) => [n, where])).entries()];
    unbacked.slice(0, 6).forEach(([n, where]) => errors.push(`${where}: la cifra ${n} no aparece en la fuente. Quítala.`));
  }
  if (texts.some(languageLooksEnglish) || languageLooksEnglish(texts.join(' '))) errors.push('El texto debe estar en español de España, no en inglés.');
  if (lenient && kept.length < L.sections[0] && !errors.length) errors.push(`Quedan ${kept.length} secciones con datos de la fuente.`);
  const scheme = { title: fixedTitle, subtitle: fixedSubtitle, subject, sections: kept, key_ideas: keyIdeas, summary, closing };
  return { scheme: errors.length ? null : scheme, errors: errors.slice(0, 20), dropped, droppedTexts, checkedFacts, foundFacts, repaired: soft.length };
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
  /** @type {string[]} */ let firstErrors = [];
  let lastRaw = null;
  while (attempts < 2) {
    attempts++;
    let raw;
    try { raw = await call(history); }
    catch (error) { if (attempts >= 2 || error?.name === 'AdmissionError') throw error; last = { errors: ['La respuesta no era JSON válido.'] }; firstErrors = last.errors; continue; }
    lastRaw = raw;
    const result = validateScheme(raw, { sources });
    if (result.scheme) return { ok: true, attempts, firstErrors, ...result };
    // Fallos pequeños en el segundo intento: se arreglan solos en vez de tirar el esquema.
    if (attempts >= 2) {
      const repaired = validateScheme(raw, { sources, lenient: true });
      if (repaired.scheme) return { ok: true, attempts, firstErrors, ...repaired };
    }
    last = result;
    if (attempts === 1) firstErrors = result.errors;
    history = [...messages, { role: 'assistant', content: JSON.stringify(raw).slice(0, 12000) },
      { role: 'user', content: `El JSON tiene estos errores. Corrígelos y devuelve el JSON completo otra vez:\n- ${result.errors.join('\n- ')}` }];
  }
  // El primer intento falló por formato y el segundo no llegó a validar: último arreglo.
  if (lastRaw && attempts >= 2) {
    const repaired = validateScheme(lastRaw, { sources, lenient: true });
    if (repaired.scheme) return { ok: true, attempts, firstErrors, ...repaired };
  }
  return { ok: false, attempts, firstErrors, ...last, scheme: null };
}

/**
 * Tope de la fuente: Groq admite ~7.000 tokens de entrada por minuto con esta
 * cuenta; con más, rechaza la petición (visto en el banco nocturno).
 */
export const SCHEME_SOURCE_CHARS = 10000;

/**
 * Une el texto de los apuntes en una sola fuente, con el nombre de cada
 * archivo y el mismo espacio para cada uno (el que sobra a uno pasa al resto).
 * @param {{ name: string, text: string }[]} files
 */
export function schemeSourceFrom(files, max = SCHEME_SOURCE_CHARS) {
  const list = files.map((f) => ({ name: clean(f.name).slice(0, 80) || 'Apuntes', text: String(f.text ?? '').trim() })).filter((f) => f.text);
  // Primero los más cortos: lo que no usan pasa a los largos.
  const room = new Array(list.length).fill(0);
  let budget = max;
  [...list.keys()].sort((a, b) => list[a].text.length - list[b].text.length).forEach((i, k) => {
    const share = Math.floor(budget / (list.length - k));
    const head = list[i].name.length + 4;
    room[i] = Math.max(0, Math.min(list[i].text.length, share - head));
    budget -= room[i] + head;
  });
  return list.map((f, i) => `[${f.name}]\n${f.text.slice(0, room[i])}`).join('\n\n');
}

// ── Edición del alumno y «Pedir a la IA» (tanda 1) ──────────────────────────

const TONES = new Set(['amarillo', 'azul', 'rojo', 'indigo', 'celeste', 'naranja', 'verde', 'lila']);

/**
 * Esquema editado por el alumno: es su texto, así que no se le piden citas.
 * Se limpia (longitudes, sin HTML, viñetas vacías fuera) y se rechaza solo si
 * no queda un esquema con título y al menos una sección con algo dentro.
 * @param {unknown} raw
 */
export function normalizeEditedScheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = /** @type {Record<string, any>} */ (raw);
  const txt = (v, max) => clean(v).replace(/<[^>]*>|&[a-z]+;|javascript:/gi, '').trim().slice(0, max);
  const bullets = (list, max) => (Array.isArray(list) ? list : []).slice(0, max)
    .map((b) => ({ text: txt(b?.text, L.bullet), quote: txt(b?.quote, L.quote) })).filter((b) => b.text);
  const sections = (Array.isArray(r.sections) ? r.sections : []).slice(0, 10).map((s) => {
    const kind = SECTION_KINDS.includes(s?.kind) ? s.kind : 'list';
    const section = {
      heading: txt(s?.heading, L.heading), period: txt(s?.period, L.period), kind,
      intro: txt(s?.intro, L.intro), bullets: bullets(s?.bullets, 12),
      subcards: (Array.isArray(s?.subcards) ? s.subcards : []).slice(0, 4)
        .map((c) => ({ title: txt(c?.title, L.subcardTitle), period: txt(c?.period, L.period), bullets: bullets(c?.bullets, 10) }))
        .filter((c) => c.title || c.bullets.length),
      dates: (Array.isArray(s?.dates) ? s.dates : []).slice(0, 14)
        .map((d) => ({ year: txt(d?.year, L.year), text: txt(d?.text, L.dateText), quote: txt(d?.quote, L.quote) }))
        .filter((d) => d.year || d.text),
      formula: txt(s?.formula, L.formula), highlight: txt(s?.highlight, L.highlight),
      illustration_prompt: s?.illustration_prompt == null ? null : txt(s.illustration_prompt, L.illustration) || null,
      illustration_caption: txt(s?.illustration_caption, L.caption),
    };
    if (TONES.has(s?.tone)) section.tone = s.tone;
    return section;
  }).filter((s) => s.heading || s.intro || s.bullets.length || s.subcards.length || s.dates.length || s.formula);
  const title = txt(r.title, L.title);
  if (!title || !sections.length) return null;
  return {
    title, subtitle: txt(r.subtitle, L.subtitle), subject: txt(r.subject, L.subject), sections,
    key_ideas: (Array.isArray(r.key_ideas) ? r.key_ideas : []).slice(0, 6).map((k) => txt(k, L.keyIdea)).filter(Boolean),
    summary: txt(r.summary, L.summary), closing: txt(r.closing, L.closing),
  };
}

/** Formato de una sola sección (para «Pedir a la IA»). */
export const SECTION_JSON_SCHEMA = Object.freeze(SCHEME_JSON_SCHEMA.properties.sections.items);

/**
 * Valida una sección rehecha por la IA con las mismas reglas que el esquema:
 * se monta un esquema mínimo alrededor y se usa validateScheme.
 */
export function validateSection(raw, { sources = '', context }) {
  const filler = (h) => ({ heading: h, period: '', kind: 'list', intro: '', bullets: [{ text: 'relleno de validación', quote: '' }], subcards: [], dates: [], formula: '', highlight: '', illustration_prompt: null, illustration_caption: '' });
  const result = validateScheme({ ...context, title: context.title || 'Esquema', sections: [raw, filler('Relleno A'), filler('Relleno B')], key_ideas: [], summary: '', closing: '' }, { sources });
  return { section: result.scheme ? result.scheme.sections.find((s) => !s.heading.startsWith('Relleno')) ?? null : null, errors: result.errors, dropped: result.dropped };
}
