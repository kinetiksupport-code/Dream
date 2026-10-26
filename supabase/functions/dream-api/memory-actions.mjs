// Acciones de memoria de dream-api (Bloques 4 y 6). Las dependencias llegan
// por parámetro (base de datos, IA, admisión) para probarlas sin red.
// Nada del contenido va a los logs: solo cuántos recuerdos y si hubo descartes.
import { FEATURE_FLAGS } from './features.mjs';
import {
  IMPORT_JSON_SCHEMA, MEMORY_EXPORT_PROMPT, MEMORY_JSON_SCHEMA, MEMORY_LIMITS,
  extractionMessages, importMessages, memoryBlock, validateExtraction, validateImport,
} from './memory.mjs';
import { onboardingPatch } from './onboarding.mjs';

export const MEMORY_ACTIONS = new Set([
  'memory_list', 'memory_toggle', 'memory_delete', 'memory_delete_all', 'memory_pin', 'memory_import_preview', 'memory_import_commit',
]);
// Modelo barato para extraer (el «Rápido» de Groq: gpt-oss-20b, con JSON estricto).
export const MEMORY_MODEL = 'openai/gpt-oss-20b';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_FIELDS = 'id,kind,content,subject,pinned,source,source_conversation_id,created_at,last_used_at,expires_at';

/** ¿Está la memoria disponible para este alumno ahora? */
export const memoryOn = (profile, flags = FEATURE_FLAGS) => flags.memory === true && profile?.memory_enabled === true;

class MemoryError extends Error {
  constructor(message, status = 400, code = 'memory_invalid') { super(message); this.status = status; this.code = code; }
}
const madridDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

/**
 * @param {{ admin: any, user: {id: string}, profile: Record<string, any>, body: Record<string, any>,
 *   ai: (messages: any[], schema: any, operation: string) => Promise<any>, flags?: Record<string, boolean> }} ctx
 * @returns {Promise<{status: number, body: Record<string, unknown>}>}
 */
export async function handleMemoryAction({ admin, user, profile, body, ai, flags = FEATURE_FLAGS }) {
  // Interruptor apagado: lo mismo que una acción que no existe.
  if (flags.memory !== true) return { status: 400, body: { error: 'Acción no válida.' } };
  try {
    switch (body.action) {
      case 'memory_list': {
        const items = profile.memory_enabled ? (await admin.from('dream_memories').select(ITEM_FIELDS).eq('user_id', user.id)
          .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(MEMORY_LIMITS.perStudent)).data ?? [] : [];
        return { status: 200, body: { memory_enabled: profile.memory_enabled === true, items, export_prompt: MEMORY_EXPORT_PROMPT,
          imports_left: importsLeft(profile), import_available: flags.memoryImport === true } };
      }
      case 'memory_toggle': {
        if (typeof body.enabled !== 'boolean') throw new MemoryError('Elige sí o no.');
        const saved = await admin.from('dream_profiles').update({ memory_enabled: body.enabled, memory_choice_at: new Date().toISOString() }).eq('id', user.id);
        if (saved.error) throw new MemoryError('No se pudo guardar.', 503, 'memory_save_failed');
        return { status: 200, body: { memory_enabled: body.enabled } };
      }
      case 'memory_delete': {
        if (!uuid.test(String(body.id ?? ''))) throw new MemoryError('Recuerdo no válido.');
        const r = await admin.from('dream_memories').delete().eq('id', body.id).eq('user_id', user.id);
        if (r.error) throw new MemoryError('No se pudo borrar.', 503, 'memory_save_failed');
        return { status: 200, body: { ok: true } };
      }
      case 'memory_delete_all': {
        if (body.confirm !== 'BORRAR') throw new MemoryError('Confirma que quieres borrarlo todo.');
        const a = await admin.from('dream_memories').delete().eq('user_id', user.id);
        const b = await admin.from('dream_conversation_summaries').delete().eq('user_id', user.id);
        if (a.error || b.error) throw new MemoryError('No se pudo borrar.', 503, 'memory_save_failed');
        return { status: 200, body: { ok: true } };
      }
      case 'memory_pin': {
        if (!uuid.test(String(body.id ?? '')) || typeof body.pinned !== 'boolean') throw new MemoryError('Recuerdo no válido.');
        const r = await admin.from('dream_memories').update({ pinned: body.pinned, updated_at: new Date().toISOString() }).eq('id', body.id).eq('user_id', user.id);
        if (r.error) throw new MemoryError('No se pudo guardar.', 503, 'memory_save_failed');
        return { status: 200, body: { ok: true } };
      }
      case 'memory_import_preview': {
        if (flags.memoryImport !== true) return { status: 400, body: { error: 'Acción no válida.' } };
        if (!profile.memory_enabled) throw new MemoryError('Activa primero la memoria.', 409, 'memory_disabled');
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (text.length < 20 || text.length > MEMORY_LIMITS.importChars) throw new MemoryError(`Pega entre 20 y ${MEMORY_LIMITS.importChars} caracteres.`);
        if (importsLeft(profile) <= 0) throw new MemoryError('Ya has importado 3 veces hoy. Vuelve mañana.', 429, 'memory_import_limit');
        const day = madridDay();
        await admin.from('dream_profiles').update({ memory_imports_day: day, memory_imports_count: (profile.memory_imports_day === day ? profile.memory_imports_count ?? 0 : 0) + 1 }).eq('id', user.id);
        // El texto pegado solo va al extractor (nunca al chat) y no se guarda.
        const preview = validateImport(await ai(importMessages(text), IMPORT_JSON_SCHEMA, 'memory_import'), { today: day });
        console.log(JSON.stringify({ event: 'memory_import_preview', memories: preview.memories.length, discarded: preview.discarded }));
        return { status: 200, body: { preview, has_nickname: Boolean(profile.nickname), has_interests: (profile.interests ?? []).length > 0 } };
      }
      case 'memory_import_commit': {
        if (flags.memoryImport !== true) return { status: 400, body: { error: 'Acción no válida.' } };
        if (!profile.memory_enabled) throw new MemoryError('Activa primero la memoria.', 409, 'memory_disabled');
        // Lo que vuelve del navegador se valida otra vez con las mismas reglas.
        const clean = validateImport(body.preview ?? {}, { today: madridDay() });
        const patch = {};
        if (clean.nickname && body.use_nickname === true) Object.assign(patch, onboardingPatch({ nickname: clean.nickname }));
        if (clean.interests.length) {
          const current = Array.isArray(profile.interests) ? profile.interests : [];
          const merged = body.interests_mode === 'replace' ? clean.interests : [...current, ...clean.interests.filter((x) => !current.some((c) => c.toLowerCase() === x.toLowerCase()))];
          Object.assign(patch, onboardingPatch({ interests: merged.slice(0, 8) }));
        }
        if (Object.keys(patch).length) {
          const saved = await admin.from('dream_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (saved.error) throw new MemoryError('No se pudo guardar.', 503, 'memory_save_failed');
        }
        const applied = await admin.rpc('dream_memory_apply', { p_owner: user.id, p_conversation: null, p_summary: '', p_topics: [], p_memories: clean.memories, p_forget: [], p_source: 'import' });
        if (applied.error || applied.data?.ok !== true) throw new MemoryError('No se pudo guardar.', 503, 'memory_save_failed');
        return { status: 200, body: { ok: true, added: applied.data.added, discarded: clean.discarded } };
      }
    }
    return { status: 400, body: { error: 'Acción no válida.' } };
  } catch (error) {
    if (error instanceof MemoryError) return { status: error.status, body: { error: error.message, code: error.code } };
    if (error?.status === 429) return { status: 429, body: { error: 'La IA está ocupada ahora. Inténtalo en un momento.', code: 'memory_busy' } };
    console.error(JSON.stringify({ event: 'memory_action_failed', action: body.action }));
    return { status: 503, body: { error: 'No se pudo completar. Inténtalo de nuevo.', code: 'memory_failed' } };
  }
}

function importsLeft(profile) {
  const used = profile?.memory_imports_day === madridDay() ? Number(profile.memory_imports_count) || 0 : 0;
  return Math.max(0, MEMORY_LIMITS.importsPerDay - used);
}

/**
 * Al empezar una conversación: calcula el bloque de memoria, lo guarda con la
 * conversación (prompt estable) y marca el uso de esos recuerdos. '' si no hay.
 */
export async function startConversationMemory({ admin, userId, conversationId, prompt }) {
  const [items, last] = await Promise.all([
    admin.from('dream_memories').select(ITEM_FIELDS).eq('user_id', userId).limit(MEMORY_LIMITS.perStudent),
    admin.from('dream_conversation_summaries').select('summary').eq('user_id', userId).neq('conversation_id', conversationId)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (items.error) return '';
  const { block, used } = memoryBlock(items.data ?? [], { summary: last.data?.summary ?? null, prompt, today: madridDay() });
  await admin.from('dream_conversations').update({ memory_block: block || '' }).eq('id', conversationId).eq('owner_id', userId);
  if (used.length) await admin.from('dream_memories').update({ last_used_at: new Date().toISOString() }).in('id', used).eq('user_id', userId);
  return block;
}

/**
 * Al abrir otra conversación: extrae la memoria de la anterior si tiene al
 * menos 4 mensajes del alumno y no se ha extraído después de su último
 * mensaje. Prioridad baja: si la IA está ocupada, se deja para la próxima.
 */
export async function extractPreviousConversation({ admin, userId, currentConversationId, ai }) {
  const previous = await admin.from('dream_conversations').select('id,updated_at,memory_extracted_at').eq('owner_id', userId)
    .neq('id', currentConversationId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const conv = previous.data;
  if (!conv || (conv.memory_extracted_at && conv.memory_extracted_at >= conv.updated_at)) return { skipped: 'nothing_new' };
  const messages = (await admin.from('dream_messages').select('role,content').eq('conversation_id', conv.id).eq('owner_id', userId)
    .order('created_at', { ascending: true }).limit(60)).data ?? [];
  if (messages.filter((m) => m.role === 'user').length < MEMORY_LIMITS.minStudentMessages) return { skipped: 'too_short' };
  const current = (await admin.from('dream_memories').select('id,content').eq('user_id', userId).limit(MEMORY_LIMITS.perStudent)).data ?? [];
  const raw = await ai(extractionMessages(messages, current), MEMORY_JSON_SCHEMA, 'memory_extract');
  const out = validateExtraction(raw, { knownIds: current.map((m) => m.id), today: madridDay() });
  const applied = await admin.rpc('dream_memory_apply', { p_owner: userId, p_conversation: conv.id, p_summary: out.summary, p_topics: out.topics,
    p_memories: out.memories, p_forget: out.forget, p_source: 'chat' });
  console.log(JSON.stringify({ event: 'memory_extracted', added: out.memories.length, forgotten: out.forget.length, discarded: out.discarded, ok: applied.data?.ok === true }));
  return { added: out.memories.length };
}
