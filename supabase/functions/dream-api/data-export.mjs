// «Descargar mis datos» (derecho de acceso y portabilidad, RGPD arts. 15 y 20).
// Reúne en un JSON todo lo que Dream guarda del alumno: perfil, conversaciones y
// mensajes, textos de sus archivos, exámenes, tests, progreso, memoria y
// resúmenes. Solo filas suyas (filtro por su id en cada tabla) y con un tope
// por tabla. Las tablas que aún no existan se saltan sin fallar.

/** Tabla → columna con el id del alumno. */
export const EXPORT_TABLES = Object.freeze([
  ['dream_conversations', 'owner_id'],
  ['dream_messages', 'owner_id'],
  ['dream_attachments', 'owner_id'],
  ['dream_exams', 'owner_id'],
  ['dream_exam_units', 'owner_id'],
  ['dream_exam_materials', 'owner_id'],
  ['dream_exam_sessions', 'owner_id'],
  ['dream_tests', 'owner_id'],
  ['dream_test_attempts', 'student_id'],
  ['dream_test_answers', 'student_id'],
  ['dream_learning_topics', 'student_id'],
  ['dream_learning_events', 'student_id'],
  ['dream_user_settings', 'user_id'],
  ['dream_memories', 'user_id'],
  ['dream_conversation_summaries', 'owner_id'],
]);
export const EXPORT_ROWS_PER_TABLE = 5000;
// Lo interno o de otros que no se exporta aunque esté en la fila.
const HIDDEN = new Set(['storage_path', 'file_hash', 'memory_block']);

const clean = (row) => Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !HIDDEN.has(k)));

/**
 * @param {any} admin cliente con service_role
 * @param {string} userId
 * @param {Record<string, unknown>} profile fila de dream_profiles
 */
export async function exportUserData(admin, userId, profile) {
  const out = {
    formato: 'Dream · copia de tus datos',
    generado_el: new Date().toISOString(),
    nota: 'Incluye todo lo que Dream guarda de ti. Los archivos originales no se guardan: solo el texto que se extrajo.',
    perfil: clean(profile),
    tablas: {},
    incompletas: [],
  };
  for (const [table, column] of EXPORT_TABLES) {
    const { data, error } = await admin.from(table).select('*').eq(column, userId).limit(EXPORT_ROWS_PER_TABLE + 1);
    if (error) continue; // tabla que no existe en esta base
    const rows = (data ?? []).map(clean);
    if (rows.length > EXPORT_ROWS_PER_TABLE) out.incompletas.push(table);
    out.tablas[table] = rows.slice(0, EXPORT_ROWS_PER_TABLE);
  }
  return out;
}
