// Lista ÚNICA de lo que hay en la web de Dream. De aquí sale lo que la IA sabe
// de sí misma (DREAM_SELF_KNOWLEDGE) y las respuestas fijas sobre la web, así
// nunca describe una función que no existe. La web la reexporta en
// lib/features.ts. Una función con `flag` solo aparece si ese interruptor está
// encendido en FEATURE_FLAGS.

// Interruptores de producto. Se cambian aquí, en el código, para que pasen por
// revisión y despliegue (igual que AI_FLAGS en models.mjs).
/** @type {Readonly<Record<string, boolean>>} */
export const FEATURE_FLAGS = Object.freeze({
  // Memoria entre conversaciones (Bloque 4). Apagada hasta el OK de Carlos.
  memory: false,
  // Importar el perfil de otra IA (Bloque 6). Depende de la memoria.
  memoryImport: false,
});

/**
 * @typedef {{ id: string, name: string, where: string, what: string, flag?: string }} DreamFeature
 * `where`: cómo se llega (lo que ve el alumno en el menú). `what`: una frase.
 */
/** @type {readonly DreamFeature[]} */
export const DREAM_FEATURES = Object.freeze([
  { id: 'chat', name: 'Chat', where: 'Chat', what: 'dudas' },
  { id: 'notes', name: 'Apuntes', where: 'Apuntes', what: 'fotos o PDF, también desde el móvil con QR' },
  { id: 'exams', name: 'Exámenes', where: 'Exámenes', what: 'tests y simulacros autocorregidos con tus apuntes' },
  { id: 'tasks', name: 'Tareas', where: 'Tareas', what: 'tareas y fechas' },
  { id: 'history', name: 'Historial', where: 'Historial', what: 'chats y tests anteriores' },
  { id: 'settings', name: 'Ajustes', where: 'Ajustes', what: 'perfil y privacidad' },
  { id: 'modes', name: 'Modos de IA', where: 'el selector del chat', what: 'Rápido, Normal o Pensar más' },
  { id: 'limit', name: 'Límite de uso', where: 'el chat', what: 'se renueva cada 5 horas' },
  { id: 'memory', name: 'Lo que Dream recuerda', where: 'Ajustes > Lo que Dream recuerda', what: 'ver y borrar', flag: 'memory' },
]);

/** Funciones activas con los interruptores dados. */
export function activeFeatures(flags = FEATURE_FLAGS) {
  return DREAM_FEATURES.filter((f) => !f.flag || flags[f.flag] === true);
}

/**
 * Lo que Dream sabe de sí misma (≤ 250 tokens). Se genera desde la lista de
 * arriba. No nombra el modelo ni la empresa de IA que hay debajo (y un test lo
 * comprueba). La capa pedagógica (PEDAGOGY_LAYER) no está en el código, así que
 * quién la creó se dice aquí una sola vez.
 */
export function selfKnowledge(flags = FEATURE_FLAGS) {
  const features = activeFeatures(flags);
  const list = features.map((f) => `${f.name} (${f.what})`).join('; ');
  const memory = features.some((f) => f.id === 'memory')
    ? 'Si preguntan qué recuerdas de ellos: algunas cosas, solo si lo activaron; las ven y borran en Ajustes > Lo que Dream recuerda.'
    : 'Si preguntan si te acuerdas de ellos: no guardas recuerdos entre chats; dentro de un chat sí.';
  return `QUIÉN ERES
- Dream, creada por Carlos Sánchez, para estudiar y sacar la mejor nota entendiendo, no copiando. No digas qué modelo ni qué empresa de IA hay debajo.
- En la web (gratis): ${list}. De lo que no esté aquí, di que no lo sabes seguro: no inventes funciones, precios ni fechas.
- ${memory}`;
}
