// Que el mensaje quepa en el límite de Groq (8.000 tokens por minuto y por
// petición en la cuenta gratuita; Groq cuenta la entrada + max_tokens). Si
// no cabe, Groq responde 413 y el alumno veía un error (3-nov-2026: 5 chats
// seguidos de una conversación con apuntes adjuntos).
//
// Orden de recorte, de lo que menos se nota a lo que más:
// 1. el historial más antiguo (se deja siempre el último intercambio);
// 2. el texto de los apuntes adjuntos (se corta por el final, con aviso);
// 3. la longitud máxima de la respuesta (nunca por debajo de MIN_ANSWER).
// Nunca se toca el bloque común de reglas ni el mensaje del alumno. Si aun
// así no cabe, sale tal cual y el respaldo (Cloudflare) responde el 413.
// Función pura, con pruebas (tests/groq-budget.test.ts).

export const GROQ_REQUEST_LIMIT = 8000;
// Margen: nuestra estimación (3,5 caracteres por token) no es el tokenizador
// de Groq; en los registros, Groq contó un 13 % menos que la estimación, pero
// se deja holgura para mensajes con muchos números o fórmulas.
export const GROQ_SAFE_LIMIT = 7600;
export const MIN_ANSWER = 450;
const PER_MESSAGE = 4;
const CUT_NOTE = "\n[…apuntes recortados para que quepan; si falta algo, pídeme esa parte en concreto]";

const len = (m) => (typeof m?.content === "string" ? m.content.length : JSON.stringify(m?.content ?? "").length);
export const estimateTokens = (messages) => messages.reduce((t, m) => t + Math.ceil(len(m) / 3.5) + PER_MESSAGE, 0);
const isMaterial = (m) => m?.role === "system" && typeof m.content === "string" && m.content.startsWith("Contexto de archivos adjuntos");

/**
 * @param {{system: {role:string,content:string}[], history: {role:string,content:string}[], tail: {role:string,content:string}[], maxTokens: number, limit?: number}} p
 *   tail: lo que va después del historial (recordatorio de estilo y mensaje del alumno).
 * @returns {{messages: {role:string,content:string}[], maxTokens: number, trimmed: {history: number, materialChars: number, answer: number}, fits: boolean}}
 */
export function fitGroqBudget({ system, history, tail, maxTokens, limit = GROQ_SAFE_LIMIT }) {
  const sys = system.map((m) => ({ ...m }));
  let hist = [...history];
  let answer = maxTokens;
  const trimmed = { history: 0, materialChars: 0, answer: 0 };
  const total = () => estimateTokens([...sys, ...hist, ...tail]) + answer;

  // 1. Historial antiguo, de dos en dos (pregunta y respuesta), dejando el último intercambio.
  while (total() > limit && hist.length > 2) {
    const drop = hist.length - 2 >= 2 ? 2 : 1;
    hist = hist.slice(drop);
    trimmed.history += drop;
  }
  // 2. Apuntes adjuntos: se recorta lo justo, por el final.
  const mi = sys.findIndex(isMaterial);
  if (total() > limit && mi >= 0) {
    const over = total() - limit;
    const content = sys[mi].content;
    const keep = Math.max(600, content.length - Math.ceil(over * 3.5) - CUT_NOTE.length - 40);
    if (keep < content.length) {
      trimmed.materialChars = content.length - keep;
      sys[mi] = { ...sys[mi], content: content.slice(0, keep) + CUT_NOTE };
    }
  }
  // 3. Respuesta más corta, sin bajar de MIN_ANSWER.
  if (total() > limit) {
    const next = Math.max(MIN_ANSWER, answer - (total() - limit));
    trimmed.answer = answer - next;
    answer = next;
  }
  return { messages: [...sys, ...hist, ...tail], maxTokens: answer, trimmed, fits: total() <= limit };
}
