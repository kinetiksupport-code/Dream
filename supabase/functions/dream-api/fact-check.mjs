// «Si no lo sabes, búscalo; si no lo encuentras, dilo» (Bloque 2 bis).
// El modelo decide mal cuándo buscar, así que el servidor marca con reglas
// (sin llamar a la IA) las peticiones que necesitan comprobación y lanza él la
// búsqueda. Aquí también se limpia la consulta que sale hacia Tavily: nunca
// lleva el apodo, el nombre, las aficiones, correos ni teléfonos del alumno.

// \b de JavaScript no entiende las tildes («escribió»): borde de palabra Unicode.
const B = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
const words_re = (source, flags) => new RegExp(source.replaceAll(String.raw`\b`, B), flags);

// Pide un concepto, un dato, una fecha, una regla o un método.
const ASKS_FACT = new RegExp([
  String.raw`\bexpl[ií]ca(?:me|nos|r)?\b`,
  String.raw`\bqu[eé] (?:es|son|significa|significan|fue|fueron)\b`,
  String.raw`\bc[oó]mo (?:se (?:hace|hacen|calcula|calculan|resuelve|resuelven|halla|obtiene|saca|pasa|forma|forman|escribe)|funciona|funcionan)\b`,
  String.raw`\b(?:regla|reglas|f[oó]rmula|f[oó]rmulas|definici[oó]n|def[ií]neme|teorema|ley de|propiedad(?:es)?)\b`,
  String.raw`\b(?:en qu[eé] (?:a[nñ]o|siglo|fecha)|cu[aá]ndo (?:fue|se|naci[oó]|muri[oó]|empez[oó]|termin[oó]))\b`,
  String.raw`\bqui[eé]n (?:es|fue|escribi[oó]|descubri[oó]|invent[oó]|pint[oó]|dijo|gobern[oó])\b`,
  String.raw`\bart[ií]culo \d+\b`,
  String.raw`\b(?:temario|selectividad|pau|ebau|evau)\b`,
].join('|').replaceAll(String.raw`\b`, B), 'iu');

// Mensajes que no piden un dato: saludos, ánimo, la propia web o el alumno.
const NOT_A_FACT = words_re(String.raw`^(?:hola|buenas|hey|gracias|vale|ok|adi[oó]s)\b|\b(?:dream|esta web|la web|la app|mi clase|mi profe(?:sor|sora)?|mi examen de ayer|me llamo|c[oó]mo me llamo)\b`, 'iu');

/**
 * ¿Hay que comprobar antes de responder? Solo con reglas, para no gastar IA.
 * Con apuntes adjuntos no: la fuente son los apuntes del alumno.
 * @param {string} prompt
 * @param {{ attachments?: number }} [context]
 */
export function needsVerification(prompt, { attachments = 0 } = {}) {
  if (typeof prompt !== 'string') return false;
  const text = prompt.trim();
  if (text.length < 8 || attachments > 0) return false;
  if (NOT_A_FACT.test(text)) return false;
  return ASKS_FACT.test(text);
}

// Matemáticas, Física y Química: aquí se razona (si el interruptor lo permite)
// y el ejemplo se comprueba con una operación.
const STEM = words_re(String.raw`\b(?:matem[aá]tic\w*|f[ií]sica|qu[ií]mica|ecuaci[oó]n\w*|fracci[oó]n\w*|generatriz|derivad\w*|integral\w*|l[ií]mite\w*|logaritm\w*|trigonometr\w*|vector\w*|matri(?:z|ces)|polinomi\w*|probabilidad\w*|estad[ií]stic\w*|velocidad|aceleraci[oó]n|fuerza|energ[ií]a|mol(?:es)?|estequiometr\w*|[aá]tomo\w*|enlace\w*|reacci[oó]n\w*|pH)\b|\d\s*[-+*/^=]\s*\d|\d,\d`, 'iu');

/** @param {string} prompt */
export const isStemPrompt = (prompt) => typeof prompt === 'string' && STEM.test(prompt);

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+?\d[\s.-]?){9,}/g;
const URL = /\bhttps?:\/\/\S+/gi;
const MAX_WORDS = 16;
const PASTED_RUN = 8;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** ¿La consulta copia un trozo largo (≥ 8 palabras seguidas) del mensaje? */
export function copiesStatement(query, prompt) {
  const q = words(query);
  const p = words(prompt).join(' ');
  if (q.length < PASTED_RUN) return false;
  for (let i = 0; i + PASTED_RUN <= q.length; i++) {
    if (` ${p} `.includes(` ${q.slice(i, i + PASTED_RUN).join(' ')} `)) return true;
  }
  return false;
}

/**
 * Consulta limpia para Tavily. Quita correos, teléfonos, enlaces, el marcador
 * del apodo, el apodo, el nombre y las aficiones. Si el modelo ha pegado el
 * enunciado, se queda con las 6 primeras palabras (la búsqueda es para
 * entender el método, no para traer la solución). Devuelve '' si no queda nada.
 * @param {string} query
 * @param {{ prompt?: string, profile?: { nickname?: string|null, display_name?: string|null, interests?: string[]|null } | null }} [context]
 */
export function sanitizeSearchQuery(query, { prompt = '', profile = null } = {}) {
  let text = String(query ?? '').replace(/\{\{\s*APODO\s*\}\}/gi, ' ')
    .replace(EMAIL, ' ').replace(URL, ' ').replace(PHONE, ' ');
  const personal = [profile?.nickname, ...String(profile?.display_name ?? '').split(/\s+/), ...(Array.isArray(profile?.interests) ? profile.interests : [])]
    .map((x) => String(x ?? '').trim()).filter((x) => x.length >= 2);
  for (const item of personal) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(item)}(?![\\p{L}\\p{N}])`, 'giu'), ' ');
  let list = text.replace(/[\r\n\t"`<>{}]/g, ' ').split(/\s+/).filter(Boolean);
  if (prompt && copiesStatement(list.join(' '), prompt)) list = list.slice(0, 6);
  return list.slice(0, MAX_WORDS).join(' ').slice(0, 200).trim();
}
