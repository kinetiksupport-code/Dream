// Actividad de sintagmas (prompt «sintagmas»): acciones syntax_* de dream-api.
// La IA propone frases y explica errores; la corrección la decide
// sintagmas.mjs en código. A la IA solo van la frase y las convenciones del
// profesor, nunca datos del alumno. Nada del contenido se escribe en los logs.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.95.0';
import {
  LEVEL_WORDS, acceptSentence, compareAnalysis, hintFor, nextLevel, nextPhase, normalizeText,
  sanitizeConventions, sanitizeMarks, spanFeedback, tokenize, treeErrors, treeFromMarks, weakestLabel,
} from './sintagmas.mjs';
import { syntaxConventionsMessages, syntaxExplainMessages, syntaxGenerateMessages } from './prompts.mjs';
import { wrapStudentMaterial } from './file-guard.mjs';

export const SYNTAX_ACTIONS = new Set(['syntax_state', 'syntax_settings', 'syntax_conventions', 'syntax_next', 'syntax_check', 'syntax_hint']);
type Body = Record<string, unknown>;
type SyntaxNames = Record<string, string>;
type SyntaxNode = Parameters<typeof compareAnalysis>[0][number];
type Message = { role: string; content: string };
/** Llamada JSON a la IA con temperatura baja (la pone index.ts con su admisión). */
export type SyntaxAI = (messages: Message[], operation: string, opts: { temperature: number; maxTokens: number }) => Promise<unknown>;

export class SyntaxActivityError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'SyntaxActivityError'; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 3;
const MAX_NOTE_SENTENCES = 12;
const RETRY_GAP = 3;
/** Veces que vuelve una frase fallada. */
const MAX_RETRIES = 2;

function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new SyntaxActivityError('No se pudo guardar. Tus datos anteriores se conservan.', 503);
  return data;
}

type Settings = {
  owner_id: string; conventions: SyntaxNames; conventions_source: 'standard' | 'notes';
  note_sentences: string[]; phase: 'options' | 'write'; level: number; tutorial_hidden: boolean;
  phase_changed_at: string; level_changed_at: string;
};

async function settingsFor(db: SupabaseClient, owner: string): Promise<Settings> {
  const found = checked(await db.from('dream_syntax_settings').select('*').eq('owner_id', owner).maybeSingle());
  if (found) return found as Settings;
  checked(await db.from('dream_syntax_settings').upsert({ owner_id: owner }, { onConflict: 'owner_id', ignoreDuplicates: true }));
  return checked(await db.from('dream_syntax_settings').select('*').eq('owner_id', owner).single()) as Settings;
}

/** Lo que ve el navegador de los ajustes: nunca las frases de los apuntes. */
const publicState = (s: Settings) => ({
  conventions: { names: s.conventions ?? {}, source: s.conventions_source },
  phase: s.phase, level: s.level, tutorial_hidden: s.tutorial_hidden,
});

async function update(db: SupabaseClient, owner: string, patch: Partial<Settings>) {
  checked(await db.from('dream_syntax_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('owner_id', owner));
}

export async function syntaxAction(db: SupabaseClient, owner: string, b: Body, ai: SyntaxAI): Promise<unknown> {
  const action = String(b.action);
  const settings = await settingsFor(db, owner);
  const names: SyntaxNames = settings.conventions ?? {};

  if (action === 'syntax_state') return { state: publicState(settings) };

  if (action === 'syntax_settings') {
    if (typeof b.tutorial_hidden !== 'boolean') throw new SyntaxActivityError('Ajuste no válido.');
    await update(db, owner, { tutorial_hidden: b.tutorial_hidden });
    return { state: publicState({ ...settings, tutorial_hidden: b.tutorial_hidden }) };
  }

  if (action === 'syntax_conventions') return conventionsFromNotes(db, owner, b, ai, settings);
  if (action === 'syntax_next') return nextSentence(db, owner, ai, settings, names);

  const sentenceId = String(b.sentence_id ?? '');
  if (!uuid.test(sentenceId)) throw new SyntaxActivityError('Frase no válida.');
  const sentence = checked(await db.from('dream_syntax_sentences').select('id,text,words,analysis').eq('id', sentenceId).eq('owner_id', owner).maybeSingle());
  if (!sentence) throw new SyntaxActivityError('Frase no encontrada.', 404);
  const words: string[] = sentence.words;
  const official = sentence.analysis as SyntaxNode[];
  const marks = sanitizeMarks(b.marks, words.length, names);
  if (!marks) throw new SyntaxActivityError('Las rayas no son válidas. Revisa que no se crucen.');

  if (action === 'syntax_hint') {
    const level = b.level === 2 ? 2 : 1;
    return { hint: hintFor(official, marks, level, names) };
  }
  if (action !== 'syntax_check') throw new SyntaxActivityError('Acción no válida.');

  const result = compareAnalysis(official, marks);
  let explanation = '';
  let alternative = false;
  if (!result.perfect && marks.length) {
    // Solo cuando no coincide: la IA explica y juzga si es una alternativa defendible.
    const wrong = result.spans.filter((s) => s.status !== 'correct').map((s) => `${s.status}:${words.slice(s.start, s.end).join(' ')}:${s.label}`);
    try {
      const answer = await ai(syntaxExplainMessages({
        text: sentence.text, names, wrong,
        official: official,
        student: marks.map((m) => ({ label: m.label, text: words.slice(m.start, m.end).join(' ') })),
      }), 'syntax_check', { temperature: 0.1, maxTokens: 300 }) as Record<string, unknown>;
      if (typeof answer?.explanation === 'string') explanation = answer.explanation.trim().slice(0, 400);
      // Una alternativa solo vale si además cumple las reglas mecánicas.
      alternative = answer?.valid_alternative === true && !treeErrors(words.length, treeFromMarks(marks)).length;
    } catch {
      // Sin IA la corrección en código sigue valiendo.
    }
  }
  const score = alternative ? 1 : result.score;
  const hints = Math.max(0, Math.min(20, Number(b.hints) || 0));
  checked(await db.from('dream_syntax_attempts').insert({
    owner_id: owner, sentence_id: sentence.id, phase: settings.phase, marks, correct: result.correct,
    total: result.total, score: Math.round(score * 1000) / 1000, labels: result.byLabel, hints, alternative,
  }));

  // Adaptación (prompt §5): cuentan solo las frases desde el último cambio.
  const since = async (from: string) => (checked(await db.from('dream_syntax_attempts').select('score')
    .eq('owner_id', owner).gte('created_at', from).order('created_at', { ascending: false }).limit(5)) ?? [])
    .map((r: { score: number }) => Number(r.score)).reverse();
  const phase = nextPhase(settings.phase, await since(settings.phase_changed_at));
  const level = nextLevel(settings.level, await since(settings.level_changed_at));
  const now = new Date().toISOString();
  if (phase !== settings.phase || level !== settings.level) {
    await update(db, owner, {
      phase, level,
      ...(phase !== settings.phase ? { phase_changed_at: now } : {}),
      ...(level !== settings.level ? { level_changed_at: now } : {}),
    });
  }
  return {
    check: {
      spans: result.spans.map((s) => ({ ...s, feedback: alternative ? '' : spanFeedback(s, words, names) })),
      extra: result.extra,
      correct: result.correct, total: result.total, score, perfect: result.perfect || alternative,
      alternative, explanation, labels: result.byLabel,
    },
    phase, phase_change: phase !== settings.phase ? phase : null,
    level, level_change: level !== settings.level ? level : null,
  };
}

async function conventionsFromNotes(db: SupabaseClient, owner: string, b: Body, ai: SyntaxAI, settings: Settings) {
  const conversation = String(b.conversation_id ?? '');
  const ids = Array.isArray(b.attachment_ids) ? b.attachment_ids.filter((x): x is string => typeof x === 'string' && uuid.test(x)).slice(0, 8) : [];
  if (!uuid.test(conversation) || !ids.length) throw new SyntaxActivityError('Sube al menos un archivo.');
  const rows = checked(await db.from('dream_attachments').select('id,file_name,extracted_text')
    .in('id', ids).eq('conversation_id', conversation).eq('owner_id', owner).eq('status', 'processed')) ?? [];
  if (!rows.length) throw new SyntaxActivityError('No encuentro esos archivos.', 404);
  const answer = await ai(syntaxConventionsMessages(wrapStudentMaterial(rows, 12000)), 'syntax_conventions', { temperature: 0.1, maxTokens: 700 }) as Record<string, unknown>;
  const found = answer?.found !== false;
  const conventions = sanitizeConventions(found ? answer : {}, found ? 'notes' : 'standard');
  const sentences = (Array.isArray(answer?.sentences) ? answer.sentences : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t.length <= 200 && tokenize(t).length >= 2 && tokenize(t).length <= 14)
    .slice(0, 8);
  const merged = [...new Set([...sentences, ...(settings.note_sentences ?? [])])].slice(0, MAX_NOTE_SENTENCES);
  const patch = { conventions: conventions.names, conventions_source: conventions.source, note_sentences: merged };
  await update(db, owner, patch);
  return { state: publicState({ ...settings, ...patch }), found, sentences: sentences.length };
}

async function nextSentence(db: SupabaseClient, owner: string, ai: SyntaxAI, settings: Settings, names: SyntaxNames) {
  const served = (row: { id: string; words: string[] }, retry = false) =>
    ({ sentence: { id: row.id, words: row.words }, retry, ...publicState(settings) });

  // 1. Lo fallado vuelve más tarde: una frase sin acertar, tras RETRY_GAP frases.
  const recent = checked(await db.from('dream_syntax_attempts').select('sentence_id,score,labels')
    .eq('owner_id', owner).order('created_at', { ascending: false }).limit(30)) ?? [];
  const seen = new Map<string, { best: number; count: number; last: number }>();
  recent.forEach((row: { sentence_id: string; score: number }, index: number) => {
    const item = seen.get(row.sentence_id) ?? { best: 0, count: 0, last: index };
    item.best = Math.max(item.best, Number(row.score)); item.count++; item.last = Math.min(item.last, index);
    seen.set(row.sentence_id, item);
  });
  const again = [...seen.entries()].filter(([, v]) => v.best < 1 && v.count <= MAX_RETRIES && v.last >= RETRY_GAP).sort((a, b) => b[1].last - a[1].last)[0];
  if (again) {
    const row = checked(await db.from('dream_syntax_sentences').select('id,words').eq('id', again[0]).eq('owner_id', owner).maybeSingle());
    if (row) return served(row, true);
  }

  // 2. Una frase ya preparada del nivel actual.
  const queued = checked(await db.from('dream_syntax_sentences').select('id,words').eq('owner_id', owner)
    .is('served_at', null).eq('level', settings.level).order('created_at').limit(1).maybeSingle());
  if (queued) {
    checked(await db.from('dream_syntax_sentences').update({ served_at: new Date().toISOString() }).eq('id', queued.id));
    return served(queued);
  }

  // 3. Nuevas: la IA propone y aquí se valida. Si nada pasa, se reintenta una vez.
  const [minWords, maxWords] = LEVEL_WORDS[settings.level as 1 | 2 | 3 | 4 | 5] ?? LEVEL_WORDS[1];
  const focus = weakestLabel(recent.map((r: { labels: Record<string, { ok: number; total: number }> }) => r.labels));
  const notes = (settings.note_sentences ?? []).slice(0, 2);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ai(syntaxGenerateMessages({ count: BATCH, minWords, maxWords, focus, names, noteSentences: attempt ? [] : notes }),
      'syntax_next', { temperature: 0.1, maxTokens: 2400 }) as Record<string, unknown>;
    const accepted = (Array.isArray(answer?.sentences) ? answer.sentences : []).map(acceptSentence).filter((s) => s !== null);
    const noteKeys = new Set(notes.map(normalizeText));
    if (!attempt && notes.length) await update(db, owner, { note_sentences: (settings.note_sentences ?? []).slice(notes.length) });
    console.log(JSON.stringify({ event: 'syntax_generated', proposed: Array.isArray(answer?.sentences) ? answer.sentences.length : 0, accepted: accepted.length, attempt }));
    if (!accepted.length) continue;
    const now = new Date().toISOString();
    const rows = checked(await db.from('dream_syntax_sentences').insert(accepted.map((s, i) => ({
      owner_id: owner, text: s.text, words: s.words, analysis: s.analysis, level: settings.level,
      source: noteKeys.has(normalizeText(s.text)) ? 'notes' : 'ai', served_at: i === 0 ? now : null,
    }))).select('id,words,served_at')) ?? [];
    const first = rows.find((r: { served_at: string | null }) => r.served_at) ?? rows[0];
    if (first) return served(first);
  }
  throw new SyntaxActivityError('No he podido preparar una frase. Inténtalo de nuevo.', 502);
}
