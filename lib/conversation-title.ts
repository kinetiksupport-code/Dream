// Titles for conversations without spending AI: derived on the client from the
// first question. Pure functions, unit-tested in tests/history.test.ts.

/** Title the API gives a conversation before its first message. */
export const DEFAULT_TITLE = "Nueva conversación";
export const TITLE_MAX = 48;

const MONTHS = [
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
];

/** «15 de octubre», plus the year when it is not the current one. */
export function spanishDate(date: Date, now: Date = date): string {
  const base = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? base
    : `${base} de ${date.getFullYear()}`;
}

/** «Conversación del 15 de octubre». */
export function dateTitle(date: Date, now: Date = date): string {
  return `Conversación del ${spanishDate(date, now)}`;
}

// Greetings that say nothing about the topic. Repeated: «Hola, buenas, …».
const GREETING =
  /^(?:hola+|holi|buenas(?:\s+(?:tardes|noches))?|buenos\s+d[ií]as|hey|ey|oye|hi|hello|saludos|qu[eé]\s+tal)(?:\s+dream)?\s*[,!.:;]*\s+/iu;

const VOWEL = /[aeiouáéíóúü]/iu;

/** True for text that cannot name a conversation: «ggfg», «aaaa», «x». */
export function isGibberish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return true;
  if (!VOWEL.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const word = words[0].toLocaleLowerCase("es");
    if (new Set(word.match(/\p{L}/gu)).size <= 2) return true;
    if (/[^aeiouáéíóúü\s\d\p{P}]{5,}/iu.test(word)) return true;
  }
  return false;
}

function capitalize(text: string): string {
  const i = text.search(/\p{L}/u);
  if (i < 0) return text;
  return text.slice(0, i) + text[i].toLocaleUpperCase("es") + text.slice(i + 1);
}

/**
 * Title from the first question: tidy spaces, drop greetings, cut at a whole
 * word near 48 characters, capitalise. Falls back to the date for junk.
 */
export function titleFromPrompt(prompt: string, now: Date): string {
  let text = prompt.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = (text + " ").replace(GREETING, "").trim();
    if (next === text) break;
    text = next;
  }
  // A greeting alone («Hola», «Buenas tardes») leaves nothing to name.
  if (GREETING.test(text + " ")) text = "";
  text = text.replace(/^[\s,.;:!-]+/u, "").replace(/[\s,.;:-]+$/u, "");
  if (isGibberish(text)) return dateTitle(now);
  if (text.length > TITLE_MAX) {
    const cut = text.slice(0, TITLE_MAX + 1);
    const space = cut.lastIndexOf(" ");
    text =
      (space >= 16 ? cut.slice(0, space) : text.slice(0, TITLE_MAX)).replace(
        /[\s,.;:¿¡-]+$/u,
        "",
      ) + "…";
  }
  return capitalize(text);
}

/** True for the API's placeholder title (or an empty one). */
export function isDefaultTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return !t || t === DEFAULT_TITLE;
}

/**
 * What the list shows. Old conversations still called «Nueva conversación»
 * read as «Conversación del <fecha>» (interface only, nothing is renamed).
 */
export function displayTitle(
  c: { title: string; updated_at: string },
  now: Date = new Date(),
): string {
  if (!isDefaultTitle(c.title)) return c.title;
  const date = new Date(c.updated_at);
  return Number.isNaN(date.getTime()) ? "Conversación" : dateTitle(date, now);
}
