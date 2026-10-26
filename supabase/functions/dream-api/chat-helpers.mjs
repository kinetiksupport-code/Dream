// Ahorro de tokens sin llamar a la IA (Bloque 8 bis):
// - respuestas fijas a preguntas sobre la propia web (salen de DREAM_FEATURES);
// - un resumen corto, sin IA, de lo que se habló antes de la ventana del historial;
// - un recordatorio breve de las reglas clave cada 5 turnos en chats largos.
import { FEATURE_FLAGS, activeFeatures } from './features.mjs';

const ABOUT_DREAM = [
  { re: /\b(?:d[oó]nde|c[oó]mo)\b.*\b(?:subo|subir|pongo|adjunto|adjuntar|cargo)\b.*\b(?:apuntes?|fotos?|pdf|archivos?)\b/i, id: 'notes',
    answer: 'En **Apuntes** puedes subir fotos o PDF de tus apuntes, también desde el móvil escaneando el código QR. En el chat también puedes adjuntarlos con el botón **+**.' },
  { re: /\b(?:cu[aá]nto\s+(?:cuesta|vale|pago)|es\s+gratis|hay\s+que\s+pagar|tengo\s+que\s+pagar|precio\s+de\s+dream)\b/i, id: 'chat',
    answer: 'Dream es gratis. Hay un límite de uso que se renueva cada 5 horas para que el servicio aguante para todos; en **Ajustes › Límite de uso** ves cuánto te queda.' },
  { re: /\b(?:qu[eé]\s+(?:modos?|diferencia)\b.*\b(?:r[aá]pido|normal|pensar)|para\s+qu[eé]\s+(?:sirve|es)\s+(?:el\s+modo\s+)?(?:r[aá]pido|pensar m[aá]s))\b/i, id: 'modes',
    answer: 'Hay tres modos en el selector del chat: **Rápido** (respuestas cortas, gasta menos), **Normal** (el de siempre) y **Pensar más** (más cuidadoso, gasta más). Comparten el mismo límite de uso.' },
  { re: /\b(?:c[oó]mo|d[oó]nde)\b.*\b(?:borro|borrar|elimino|eliminar)\b.*\b(?:historial|cuenta|conversaciones)\b/i, id: 'settings',
    answer: 'En **Ajustes › Privacidad** tienes «Borrar historial» y «Eliminar mi cuenta». Las dos piden confirmación y no se pueden deshacer.' },
  { re: /\b(?:c[oó]mo|d[oó]nde)\b.*\b(?:cambio|cambiar)\b.*\b(?:apodo|nombre|aficiones|gustos)\b/i, id: 'settings',
    answer: 'Puedes cambiar tu nombre, cómo te llamo y tus aficiones en **Ajustes › Perfil**. El cambio se nota desde el siguiente mensaje.' },
  { re: /\b(?:c[oó]mo|d[oó]nde)\b.*\b(?:hago|hacer|crear|creo|preparo)\b.*\b(?:examen|simulacro|test)\b/i, id: 'exams',
    answer: 'En **Exámenes** puedes crear un examen con tus apuntes y hacer tests rápidos y simulacros que se corrigen solos. Si quieres, aquí mismo te pregunto sobre un tema: dime cuál.' },
];

/**
 * Respuesta fija si el mensaje es SOLO una pregunta sobre cómo usar Dream
 * (corta y sin ejercicio). null en cualquier otro caso: entonces responde la IA.
 * Solo usa funciones activas, así nunca habla de algo que no existe.
 * @param {string} prompt
 */
export function fixedAnswer(prompt, flags = FEATURE_FLAGS) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text || text.length > 140 || /\d\s*[-+*/^=]\s*\d|\n/.test(text)) return null;
  // Si además pide otra cosa («y luego…», «explícame…»), que responda la IA.
  if (/\b(?:y luego|adem[aá]s|expl[ií]ca|resuelve|ay[uú]dame con)\b/i.test(text)) return null;
  const active = new Set(activeFeatures(flags).map((f) => f.id));
  const hit = ABOUT_DREAM.find((r) => r.re.test(text) && active.has(r.id));
  return hit ? hit.answer : null;
}

/**
 * Resumen sin IA de lo que el alumno preguntó ANTES de la ventana del historial
 * (≤ 150 tokens): el principio de cada mensaje suyo, del más antiguo al más reciente.
 * @param {{role: string, content: string}[]} older mensajes anteriores a la ventana, en orden
 */
export function olderSummary(older) {
  const asks = older.filter((m) => m.role === 'user').map((m) => String(m.content).replace(/\s+/g, ' ').trim().slice(0, 70)).filter(Boolean);
  if (!asks.length) return '';
  let out = '';
  for (const a of asks.slice(-6)) {
    const next = out ? `${out}; ${a}` : a;
    if (next.length > 420) break;
    out = next;
  }
  return `Antes, en esta misma conversación, el alumno preguntó (resumen, datos): ${out}.`;
}

export const RULES_REMINDER = 'RECORDATORIO: un paso por mensaje y termina con una sola pregunta si hace falta; en deberes, pistas y no la solución; si no lo sabes, no lo inventes; español de España.';

/** Cada 5 turnos del alumno, a partir del décimo, se recuerda lo esencial. */
export function needsReminder(studentTurns) {
  return studentTurns >= 10 && studentTurns % 5 === 0;
}
