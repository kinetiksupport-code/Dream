// Cómo se busca (docs/HABLA_NATURAL.md, «Búsqueda»): por fecha si es algo
// reciente o de actualidad, a fondo si hace falta mucha información, y una
// búsqueda automática cuando la IA dice que no lo sabe. Reglas fijas, sin IA,
// sobre el texto del alumno y la consulta (nunca se registra el texto).
// Límites de palabra con \p{L}: \b no entiende las tildes («última»).

/** Ventanas de fecha que acepta Tavily (time_range). */
export const RECENCY = Object.freeze(['day', 'week', 'month', 'year']);

const DAY = /(?<![\p{L}\p{N}])(hoy|esta (mañana|tarde|noche)|anoche|ayer|[uú]ltima hora|en directo|ahora mismo)(?![\p{L}\p{N}])/iu;
const WEEK = /(?<![\p{L}\p{N}])(esta semana|estos d[ií]as|[uú]ltimos d[ií]as|este (fin de semana|finde))(?![\p{L}\p{N}])/iu;
const MONTH = /(?<![\p{L}\p{N}])(este mes|[uú]ltimo mes|[uú]ltimas semanas|hace poco|recientemente)(?![\p{L}\p{N}])/iu;
const YEAR = /(?<![\p{L}\p{N}])(este año|[uú]ltimos meses|en 202[5-9])(?![\p{L}\p{N}])/iu;
const NEWS = /(?<![\p{L}\p{N}])(noticias?|actualidad|titulares?|qu[eé] ha pasado|qu[eé] pas[oó]|ha (muerto|ganado|dimitido)|elecciones|resultados? del partido|[uú]ltima hora|novedad(es)?|acaba de)(?![\p{L}\p{N}])/iu;
const RECENT = /(?<![\p{L}\p{N}])(reciente(s|mente)?|lo [uú]ltimo|actualmente|hoy en d[ií]a|vigente|nuevo (iphone|modelo|gobierno|presidente|papa)|[uú]ltim[oa]s? (versi[oó]n|noticia|ley|reforma))(?![\p{L}\p{N}])/iu;
const DEEP = /(?<![\p{L}\p{N}])(a fondo|en profundidad|en detalle|detallad[oa]|todo (sobre|lo que)|investiga(r|me)?|compara(r|ción|me)?|diferencias? entre|ventajas y (desventajas|inconvenientes)|causas y consecuencias|(un|mi) trabajo (sobre|de)|informe|historia (de|del)|resumen completo|cu[eé]ntame todo|con muchos datos)(?![\p{L}\p{N}])/iu;

/**
 * Opciones de búsqueda para la petición. `asked` es lo que pidió la IA en la
 * llamada a web_search (recency, deep): manda si es más exigente.
 * @param {string} text Petición del alumno y consulta, juntas.
 * @param {{recency?: string|null, deep?: boolean}} [asked]
 * @returns {{topic: 'general'|'news', timeRange: string|null, deep: boolean}}
 */
export function searchOptionsFor(text, asked = {}) {
  const t = typeof text === 'string' ? text : '';
  const news = NEWS.test(t);
  let timeRange = DAY.test(t) ? 'day' : WEEK.test(t) ? 'week' : MONTH.test(t) ? 'month' : YEAR.test(t) ? 'year' : null;
  if (!timeRange && news) timeRange = 'week';
  if (!timeRange && RECENT.test(t)) timeRange = 'year';
  if (RECENCY.includes(asked.recency ?? '')) {
    // La IA puede estrechar la ventana, nunca ensancharla más que las reglas.
    const mine = timeRange ? RECENCY.indexOf(timeRange) : RECENCY.length;
    if (RECENCY.indexOf(asked.recency) < mine) timeRange = asked.recency;
  }
  return { topic: news ? 'news' : 'general', timeRange, deep: asked.deep === true || DEEP.test(t) };
}

/**
 * La IA reconoce que no sabe algo (o que sus datos pueden estar viejos): el
 * servidor busca en internet en vez de dejar la duda.
 */
const UNSURE = /(?<![\p{L}\p{N}])(no lo s[eé] con seguridad|no (lo )?s[eé] (exactamente|seguro)|no estoy segur[oa]|no tengo (datos|informaci[oó]n)|mis (datos|conocimientos) (llegan|son|est[aá]n)|no puedo (saberlo|comprobarlo|confirmarlo|verificarlo)|no dispongo de (datos|informaci[oó]n)|fecha de corte|no tengo acceso a internet|podr[ií]a(n)? haber cambiado)(?![\p{L}\p{N}])/iu;
export const soundsUnsure = (text) => typeof text === 'string' && UNSURE.test(text);
