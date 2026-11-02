// Dreams interactivos (docs/ESQUEMAS.md, Bloque 7). Qwen solo aporta el
// CONTENIDO en JSON; la lógica del juego es una plantilla de Dream
// (lib/dream-games.ts) que corre en un iframe aislado. Aquí: esquema JSON para
// Groq, validador determinista (cada respuesta con una cita literal de los
// apuntes) y la generación con un único reintento. Nunca se registra contenido.

export const GAME_KINDS = Object.freeze(['classify', 'match']);

export const GAME_LIMITS = Object.freeze({
  title: 70, instructions: 160, category: 40, item: 120, explanation: 160, quote: 200,
  concept: 60, definition: 160,
  categories: [2, 5], items: [4, 14], pairs: [4, 8],
});

const L = GAME_LIMITS;
const str = (maxLength) => ({ type: 'string', maxLength });

/** Esquemas para `response_format: {type: 'json_schema'}`. */
export const GAME_JSON_SCHEMAS = Object.freeze({
  classify: Object.freeze({
    type: 'object', additionalProperties: false,
    required: ['title', 'instructions', 'categories', 'items'],
    properties: {
      title: str(L.title), instructions: str(L.instructions),
      categories: { type: 'array', minItems: L.categories[0], maxItems: L.categories[1], items: str(L.category) },
      items: {
        type: 'array', minItems: L.items[0], maxItems: L.items[1],
        items: {
          type: 'object', additionalProperties: false, required: ['text', 'category', 'explanation', 'quote'],
          properties: { text: str(L.item), category: str(L.category), explanation: str(L.explanation), quote: str(L.quote) },
        },
      },
    },
  }),
  match: Object.freeze({
    type: 'object', additionalProperties: false,
    required: ['title', 'instructions', 'pairs'],
    properties: {
      title: str(L.title), instructions: str(L.instructions),
      pairs: {
        type: 'array', minItems: L.pairs[0], maxItems: L.pairs[1],
        items: {
          type: 'object', additionalProperties: false, required: ['concept', 'definition', 'quote'],
          properties: { concept: str(L.concept), definition: str(L.definition), quote: str(L.quote) },
        },
      },
    },
  }),
});

/** Qué plantilla pide el alumno: clasificar (sintagmas, categorías) o emparejar. */
export function gameKindFor(text) {
  return /clasific|sintagma|categor|agrupa|ordena por tipo/i.test(String(text ?? '')) ? 'classify' : 'match';
}

/** Minúsculas, sin tildes ni signos: para comparar citas (igual que schemes.mjs). */
export function normalizeText(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[«»"“”'‘’`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function quoteFound(quote, sourceNorm) {
  const q = normalizeText(quote);
  if (!q || q.split(' ').length < 4) return false;
  return ` ${sourceNorm} `.includes(` ${q} `);
}

// Texto plano: sin etiquetas, entidades ni enlaces javascript:. La plantilla lo
// pinta con textContent, así que esto es una segunda barrera, no la única.
const clean = (value, max) => String(value ?? '').replace(/<[^>]*>|&[a-z#0-9]+;|javascript:/gi, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);
const key = (text) => normalizeText(text);

/**
 * Comprueba y limpia el juego. Quita los elementos sin cita en la fuente (no
 * se puede comprobar su respuesta) y falla si quedan pocos.
 * @param {unknown} raw
 * @param {{ kind: 'classify' | 'match', sources?: string }} options
 * @returns {{ game: object | null, errors: string[], dropped: number }}
 */
export function validateGame(raw, { kind, sources = '' }) {
  const errors = [];
  const v = /** @type {any} */ (raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { game: null, errors: ['La respuesta no es un objeto JSON.'], dropped: 0 };
  const sourceNorm = normalizeText(sources);
  const title = clean(v.title, L.title);
  const instructions = clean(v.instructions, L.instructions);
  if (!title) errors.push('Falta el título.');
  let dropped = 0;

  if (kind === 'classify') {
    const categories = [];
    for (const c of Array.isArray(v.categories) ? v.categories : []) {
      const name = clean(c, L.category);
      if (name && !categories.some((x) => key(x) === key(name))) categories.push(name);
    }
    if (categories.length < L.categories[0]) errors.push(`Hacen falta al menos ${L.categories[0]} categorías distintas.`);
    const items = [];
    for (const it of Array.isArray(v.items) ? v.items.slice(0, L.items[1]) : []) {
      const text = clean(it?.text, L.item);
      const category = categories.find((c) => key(c) === key(it?.category));
      if (!text || items.some((x) => key(x.text) === key(text))) { dropped++; continue; }
      if (!category) { errors.push(`«${text}» tiene una categoría que no está en la lista.`); dropped++; continue; }
      if (!quoteFound(it?.quote, sourceNorm)) { errors.push(`La cita de «${text}» no aparece literal en la fuente.`); dropped++; continue; }
      items.push({ text, category, explanation: clean(it?.explanation, L.explanation) });
    }
    const used = categories.filter((c) => items.some((it) => it.category === c));
    if (items.length < L.items[0]) errors.push(`Hacen falta al menos ${L.items[0]} elementos con cita literal de la fuente.`);
    else if (used.length < L.categories[0]) errors.push('Cada categoría necesita al menos un elemento.');
    if (errors.length && (items.length < L.items[0] || used.length < L.categories[0] || !title))
      return { game: null, errors, dropped };
    return { game: { kind, title, instructions: instructions || 'Coloca cada elemento en su categoría.', categories: used, items }, errors, dropped };
  }

  if (kind === 'match') {
    const pairs = [];
    for (const p of Array.isArray(v.pairs) ? v.pairs.slice(0, L.pairs[1]) : []) {
      const concept = clean(p?.concept, L.concept);
      const definition = clean(p?.definition, L.definition);
      if (!concept || !definition || pairs.some((x) => key(x.concept) === key(concept) || key(x.definition) === key(definition))) { dropped++; continue; }
      if (!quoteFound(p?.quote, sourceNorm)) { errors.push(`La cita de «${concept}» no aparece literal en la fuente.`); dropped++; continue; }
      pairs.push({ concept, definition });
    }
    if (pairs.length < L.pairs[0]) errors.push(`Hacen falta al menos ${L.pairs[0]} parejas con cita literal de la fuente.`);
    if (pairs.length < L.pairs[0] || !title) return { game: null, errors, dropped };
    return { game: { kind, title, instructions: instructions || 'Une cada concepto con su definición.', pairs }, errors, dropped };
  }

  return { game: null, errors: ['Tipo de juego desconocido.'], dropped: 0 };
}

/**
 * Genera y valida; si falla, un reintento con los errores (como generateScheme).
 * @param {{ call: (messages: { role: string, content: string }[]) => Promise<unknown>, messages: { role: string, content: string }[], kind: 'classify' | 'match', sources: string }} input
 */
export async function generateGame({ call, messages, kind, sources }) {
  let attempts = 0;
  let last = { errors: ['Sin respuesta.'], dropped: 0 };
  let history = messages;
  while (attempts < 2) {
    attempts++;
    let raw;
    try { raw = await call(history); }
    catch (error) { if (attempts >= 2 || error?.name === 'AdmissionError') throw error; last = { errors: ['La respuesta no era JSON válido.'], dropped: 0 }; continue; }
    const result = validateGame(raw, { kind, sources });
    if (result.game) return { ok: true, attempts, ...result };
    last = result;
    history = [...messages, { role: 'assistant', content: JSON.stringify(raw).slice(0, 8000) },
      { role: 'user', content: `El JSON tiene estos errores. Corrígelos y devuelve el JSON completo otra vez:\n- ${result.errors.slice(0, 12).join('\n- ')}` }];
  }
  return { ok: false, attempts, ...last, game: null };
}

/** Resultado que manda el juego por postMessage y Dream guarda (aciertos/total). */
export function validResult(aciertos, total) {
  return Number.isInteger(aciertos) && Number.isInteger(total) && total > 0 && total <= 50 && aciertos >= 0 && aciertos <= total;
}
