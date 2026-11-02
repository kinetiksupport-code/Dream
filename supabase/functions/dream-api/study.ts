// Acciones de la ruta de estudio (prompt de la ruta, Bloques 1-4, 7 y 8).
// Detrás de DREAM_STUDY_STEPS_ENABLED (apagado = estas acciones no existen).
// Todo es del alumno: cada consulta filtra por student_id = owner y escribe
// solo dream-api (service_role). En los registros solo hay contadores y
// códigos, nunca texto de lecciones, respuestas ni tarjetas.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.95.0';
import { ExamError, id, type Body } from './validation.ts';
import { DIFFICULTIES, LESSON_MAX_TOKENS, MASTERY_THRESHOLD, gradeQuestion, lessonContext, lessonSystem, mistakeCard, pickLessonTest, publicQuestion, unitNotes, validateLesson } from './lesson.mjs';
import { schedule } from './srs.mjs';
import { MOCK_ACTIONS, mockAction } from './mock.ts';

interface LessonValue {
  reading: { sections: { title: string; body_markdown: string; why_it_matters?: string; check: { statement: string; is_true: boolean; explanation: string } }[]; sources: string[] };
  quiz: unknown[];
  cards: { front: string; back: string }[];
}
type JsonAI = (system: string, context: string, operation: string, signal?: AbortSignal) => Promise<unknown>;

export const STUDY_ACTIONS = new Set([
  'unit_content_get', 'unit_progress_save', 'cards_due', 'card_review', 'card_create', 'card_update',
  'card_delete', 'cards_import', 'card_report', 'error_bank_list', 'study_quota',
  'unit_quiz_get', 'unit_quiz_answer', 'unit_quiz_finish', 'cards_list', 'study_today', ...MOCK_ACTIONS,
]);
export const studyEnabled = () => Deno.env.get('DREAM_STUDY_STEPS_ENABLED') === 'true';
/**
 * Encendido por fases (prompt de la ruta, apartado 6):
 * - DREAM_STUDY_STEPS_ENABLED=true: para todos.
 * - DREAM_STUDY_STEPS_ENABLED=loyola: para las cuentas de Fundación Loyola.
 * - DREAM_STUDY_STEPS_USERS: correos o ids separados por comas (la cuenta de prueba).
 * Sin nada de eso, apagado: las acciones no existen (404).
 */
export function studyEnabledFor(user: { id: string; email?: string | null }, loyola: boolean) {
  const mode = Deno.env.get('DREAM_STUDY_STEPS_ENABLED');
  if (mode === 'true') return true;
  if (mode === 'loyola' && loyola) return true;
  const list = (Deno.env.get('DREAM_STUDY_STEPS_USERS') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.id.toLowerCase()) || (!!user.email && list.includes(user.email.toLowerCase()));
}

/** Medianoche de hoy en Madrid (los días del alumno). */
export function madridDayStart(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // Desfase de Madrid a esa hora (CET/CEST).
  const offset = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(utcMidnight)) || 0;
  return new Date(utcMidnight.getTime() - offset * 3_600_000);
}

/** Candado de generación: dos pestañas no generan la misma lección. */
const LOCK_MS = 120_000;
const IMPORT_MAX = 500;
const DUE_MAX = 100;

function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new ExamError('No se pudo guardar. Tus datos anteriores se conservan.', 503);
  return data;
}
const tokens = (s: string) => Math.ceil(s.length / 3.6); // estimación (sin el tokenizador real)
const cardText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
function cardSide(v: unknown) {
  const s = cardText(v);
  if (!s || s.length > 300) throw new ExamError('Cada cara de la tarjeta lleva entre 1 y 300 caracteres.');
  return s;
}

async function ownedUnit(db: SupabaseClient, owner: string, examId: unknown, unitId: unknown) {
  const unit = checked(await db.from('dream_exam_units').select('id,exam_id,title,topic,summary,status')
    .eq('id', id(unitId)).eq('exam_id', id(examId)).eq('owner_id', owner).maybeSingle());
  if (!unit) throw new ExamError('Lección no encontrada.', 404);
  return unit as { id: string; exam_id: string; title: string; topic: string; summary: string; status: string };
}

/** Lo que ve el alumno de la lección: la lectura sin las respuestas de las mini-preguntas. */
function publicReading(reading: { sections: { title: string; body_markdown: string; why_it_matters?: string; check: { statement: string } }[]; sources: string[] }) {
  return {
    sections: reading.sections.map((s) => ({ title: s.title, body_markdown: s.body_markdown, why_it_matters: s.why_it_matters ?? null, check: { statement: s.check.statement } })),
    sources: reading.sources,
  };
}

export async function studyAction(db: SupabaseClient, owner: string, b: Body, ai: JsonAI, signal: AbortSignal, ctx: { course?: string | null } = {}): Promise<unknown> {
  const action = String(b.action);
  const quota = async (kind: 'lesson' | 'mock', exam?: string) => {
    const { data, error } = await db.rpc('dream_study_quota', { p_owner: owner, p_kind: kind, p_exam: exam ?? null });
    if (error || !data) throw new ExamError('No se pudo comprobar tu límite. Inténtalo en un momento.', 503);
    return data as { ok: boolean; used: number; cap: number; unlimited: boolean };
  };

  if (action === 'study_quota') return { lessons: await quota('lesson') };
  // Repaso de hoy y meta diaria suave (Bloque 6.1 y 6.7): solo contadores, sin IA.
  if (action === 'study_today') {
    const now = new Date();
    const dayStart = madridDayStart(now).toISOString();
    const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
      const r = await q;
      if (r.error) throw new ExamError('No se pudo leer tu repaso.', 503);
      return r.count ?? 0;
    };
    const [due, reviewed, lessons] = await Promise.all([
      count(db.from('dream_cards').select('id', { count: 'exact', head: true }).eq('student_id', owner).eq('suspended', false).lte('due', now.toISOString())),
      count(db.from('dream_card_reviews').select('review_id', { count: 'exact', head: true }).eq('student_id', owner).gte('reviewed_at', dayStart)),
      count(db.from('dream_unit_progress').select('unit_id', { count: 'exact', head: true }).eq('student_id', owner).gte('reading_done_at', dayStart)),
    ]);
    return { due, minutes: Math.max(1, Math.round((due * 20) / 60)), reviewed_today: reviewed, lessons_today: lessons, goal: { lessons: 1, cards: 10 } };
  }
  // Simulacro (Bloque 5): diagnóstico, de bloque y final.
  if (MOCK_ACTIONS.has(action)) return mockAction(db, owner, b, ai, signal, quota);

  // ── La lección: se genera la primera vez que se abre y se guarda ──
  if (action === 'unit_content_get') {
    const unit = await ownedUnit(db, owner, b.exam_id, b.unit_id);
    const difficulty = DIFFICULTIES.includes(String(b.difficulty)) ? String(b.difficulty) : 'medio';
    const row = checked(await db.from('dream_unit_content').select('status,reading,locked_until,difficulty').eq('unit_id', unit.id).eq('student_id', owner).maybeSingle()) as
      { status: string; reading: unknown; locked_until: string | null } | null;
    if (row?.status === 'ready') {
      const progress = checked(await db.from('dream_unit_progress').select('reading_section,reading_done_at,quiz_best_pct,mastered_at').eq('unit_id', unit.id).eq('student_id', owner).maybeSingle());
      return { status: 'ready', reading: publicReading(row.reading as never), progress: progress ?? null };
    }
    if (row?.status === 'generating' && row.locked_until && Date.parse(row.locked_until) > Date.now())
      return { status: 'generating' };
    const q = await quota('lesson');
    if (!q.ok) return { status: 'limit', used: q.used, cap: q.cap };
    const lock = new Date(Date.now() + LOCK_MS).toISOString();
    if (row) {
      // Fallida o candado caducado: se vuelve a intentar (lo fallido nunca se cobró).
      checked(await db.from('dream_unit_content').update({ status: 'generating', difficulty, locked_until: lock, updated_at: new Date().toISOString() }).eq('unit_id', unit.id).eq('student_id', owner));
    } else {
      const ins = await db.from('dream_unit_content').insert({ unit_id: unit.id, exam_id: unit.exam_id, student_id: owner, status: 'generating', difficulty, locked_until: lock });
      // Otra pestaña acaba de empezar la misma: se espera a esa.
      if (ins.error) return { status: 'generating' };
    }
    // Solo para la lectura privada: la asignatura del examen y los apuntes de esa unidad.
    const exam = checked(await db.from('dream_exams').select('subject').eq('id', unit.exam_id).eq('owner_id', owner).maybeSingle()) as { subject: string } | null;
    const links = checked(await db.from('dream_exam_materials').select('attachment_id').eq('exam_id', unit.exam_id).eq('owner_id', owner)) ?? [];
    const files = links.length ? checked(await db.from('dream_attachments').select('file_name,extracted_text').in('id', (links as { attachment_id: string }[]).map((m) => m.attachment_id)).eq('owner_id', owner)) ?? [] : [];
    const system = lessonSystem();
    const context = lessonContext({ topic: unit.topic || unit.title, subject: exam?.subject ?? '', course: ctx.course ?? null, summary: unit.summary, difficulty,
      notes: unitNotes(files as { file_name: string; extracted_text: string }[], unit).map((n: { name: string; text: string }) => ({ name: n.name, text: n.text })) });
    let lesson: ReturnType<typeof validateLesson> = { ok: false, reason: 'not_run' } as never;
    for (let attempt = 0; attempt < 2 && !lesson.ok; attempt++) {
      try {
        lesson = validateLesson(await ai(system, context, 'test_generate', signal));
      } catch (error) {
        // Los límites de Dream y de los proveedores se respetan: se para y se avisa.
        if (error instanceof Error && ['AdmissionError', 'GroqProviderError', 'CloudflareProviderError'].includes(error.name)) {
          await db.from('dream_unit_content').update({ status: 'failed', locked_until: null }).eq('unit_id', unit.id).eq('student_id', owner);
          throw error;
        }
        lesson = { ok: false, reason: 'ai_error' } as never;
      }
      if (!lesson.ok) console.error(JSON.stringify({ event: 'lesson_invalid', attempt, reason: (lesson as { reason: string }).reason }));
    }
    if (!lesson.ok) {
      checked(await db.from('dream_unit_content').update({ status: 'failed', locked_until: null, updated_at: new Date().toISOString() }).eq('unit_id', unit.id).eq('student_id', owner));
      return { status: 'failed', message: 'No hemos podido preparar esta lección. Reintentar' };
    }
    const value = (lesson as unknown as { value: LessonValue }).value;
    const tIn = tokens(system + context);
    const tOut = Math.min(LESSON_MAX_TOKENS, tokens(JSON.stringify(value)));
    checked(await db.from('dream_unit_content').update({ status: 'ready', reading: value.reading, quiz: value.quiz, locked_until: null,
      model: 'groq:normal', tokens_in: tIn, tokens_out: tOut, updated_at: new Date().toISOString() }).eq('unit_id', unit.id).eq('student_id', owner));
    // Las tarjetas de la lección pasan al repaso espaciado (si cabe en el tope, se guardan).
    await db.from('dream_cards').insert(value.cards.map((c) => ({ student_id: owner, exam_id: unit.exam_id, unit_id: unit.id, front: c.front, back: c.back, origin: 'ai' })));
    console.log(JSON.stringify({ event: 'lesson_ready', sections: value.reading.sections.length, quiz: value.quiz.length, cards: value.cards.length, tokens_in: tIn, tokens_out: tOut }));
    return { status: 'ready', reading: publicReading(value.reading), progress: null };
  }

  // ── Progreso de la lección y mini-preguntas V/F (la corrección es del servidor) ──
  if (action === 'unit_progress_save') {
    const unit = await ownedUnit(db, owner, b.exam_id, b.unit_id);
    const content = checked(await db.from('dream_unit_content').select('reading').eq('unit_id', unit.id).eq('student_id', owner).eq('status', 'ready').maybeSingle()) as { reading: { sections: { check: { is_true: boolean; explanation: string } }[] } } | null;
    if (!content) throw new ExamError('Esta lección aún no está preparada.', 409);
    const sections = content.reading.sections.length;
    const section = Number.isInteger(b.reading_section) ? Math.max(0, Math.min(Number(b.reading_section), sections)) : undefined;
    const felt = ['facil', 'bien', 'dificil'].includes(String(b.felt_difficulty)) ? String(b.felt_difficulty) : undefined;
    const patch: Record<string, unknown> = { unit_id: unit.id, student_id: owner, exam_id: unit.exam_id, updated_at: new Date().toISOString() };
    if (section !== undefined) patch.reading_section = section;
    if (section === sections) patch.reading_done_at = new Date().toISOString();
    if (felt) patch.felt_difficulty = felt;
    checked(await db.from('dream_unit_progress').upsert(patch, { onConflict: 'unit_id,student_id' }));
    // «Cómo lo noto» (Bloque 6.5): si le ha costado, sus tarjetas vuelven mañana como muy tarde.
    if (felt === 'dificil') {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      await db.from('dream_cards').update({ due: tomorrow }).eq('unit_id', unit.id).eq('student_id', owner).gt('due', tomorrow);
    }
    let check = null;
    if (b.check && typeof b.check === 'object') {
      const c = b.check as { section?: unknown; answer?: unknown };
      const i = Number(c.section);
      if (!Number.isInteger(i) || i < 0 || i >= sections || typeof c.answer !== 'boolean') throw new ExamError('Respuesta no válida.');
      const right = content.reading.sections[i].check;
      // La corrección llega después de que el alumno conteste.
      check = { correct: c.answer === right.is_true, is_true: right.is_true, explanation: right.explanation };
    }
    return { ok: true, check };
  }

  // ── Test de la lección (Bloque 3): del banco ya generado, corregido aquí, sin IA ──
  if (action === 'unit_quiz_get' || action === 'unit_quiz_answer' || action === 'unit_quiz_finish') {
    const unit = await ownedUnit(db, owner, b.exam_id, b.unit_id);
    const content = checked(await db.from('dream_unit_content').select('quiz').eq('unit_id', unit.id).eq('student_id', owner).eq('status', 'ready').maybeSingle()) as { quiz: Parameters<typeof gradeQuestion>[0][] } | null;
    if (!content) throw new ExamError('Esta lección aún no está preparada.', 409);
    const bank = content.quiz;
    const question = (i: unknown) => {
      const n = Number(i);
      if (!Number.isInteger(n) || n < 0 || n >= bank.length) throw new ExamError('Pregunta no válida.');
      return bank[n];
    };
    if (action === 'unit_quiz_get') {
      // Repetir: primero las preguntas que no salieron la otra vez.
      const first = pickLessonTest(bank, 7);
      // Pretest opcional (Bloque 2): 2-3 rápidas del banco que no salen en el test, sin puntuar.
      if (b.pretest === true) {
        const rest = [...bank.keys()].filter((i) => !first.includes(i) && bank[i].type !== 'written').slice(0, 3);
        return { questions: rest.length >= 2 ? rest.map((i) => publicQuestion(bank[i], i)) : [] };
      }
      const round = Math.max(0, Math.min(10, Number(b.round) || 0));
      const order = round ? [...bank.keys()].filter((i) => !first.includes(i)).concat(first) : first;
      const chosen = (round ? order.slice(0, Math.min(8, Math.max(6, order.length))) : first).sort((x, y) => x - y);
      return { questions: chosen.map((i) => publicQuestion(bank[i], i)) };
    }
    if (action === 'unit_quiz_answer') {
      const q = question(b.index);
      const graded = gradeQuestion(q, b.answer);
      // La corrección llega solo después de contestar.
      return { ...graded, explanation: q.explanation ?? '' };
    }
    const answers = b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers) ? b.answers as Record<string, unknown> : null;
    const keys = answers ? Object.keys(answers) : [];
    if (!answers || keys.length < 1 || keys.length > 12) throw new ExamError('Respuestas no válidas.');
    const results = keys.map((k) => ({ q: question(k), ok: gradeQuestion(question(k), answers[k]).correct }));
    const right = results.filter((r) => r.ok).length;
    const pct = Math.round((100 * right) / results.length);
    const mastered = pct >= MASTERY_THRESHOLD;
    const prev = checked(await db.from('dream_unit_progress').select('quiz_best_pct,mastered_at,reading_done_at').eq('unit_id', unit.id).eq('student_id', owner).maybeSingle()) as { quiz_best_pct: number | null; mastered_at: string | null; reading_done_at: string | null } | null;
    const now = new Date().toISOString();
    checked(await db.from('dream_unit_progress').upsert({ unit_id: unit.id, student_id: owner, exam_id: unit.exam_id, updated_at: now,
      quiz_best_pct: Math.max(pct, prev?.quiz_best_pct ?? 0), ...(mastered && !prev?.mastered_at ? { mastered_at: now } : {}) }, { onConflict: 'unit_id,student_id' }));
    // Cada fallo, una tarjeta para el repaso (si cabe en el tope).
    const misses = results.filter((r) => !r.ok).map((r) => ({ student_id: owner, exam_id: unit.exam_id, unit_id: unit.id, origin: 'mistake', ...mistakeCard(r.q) }));
    if (misses.length) await db.from('dream_cards').insert(misses);
    // «Ya me sé este tema» (Bloque 6.8): si supera el test sin leer, la lección cuenta.
    if (b.known === true && mastered && !prev?.reading_done_at) {
      checked(await db.from('dream_unit_progress').update({ reading_done_at: now }).eq('unit_id', unit.id).eq('student_id', owner));
      if (prev) prev.reading_done_at = now;
    }
    const readingDone = prev?.reading_done_at ?? (b.known === true && mastered ? now : null);
    // La lección cuenta como hecha al terminar Leer + Test (Bloque 1).
    let completed = false;
    if (readingDone && unit.status !== 'completed') {
      checked(await db.from('dream_exam_units').update({ status: 'completed', completed_at: now }).eq('id', unit.id).eq('owner_id', owner));
      completed = true;
    }
    console.log(JSON.stringify({ event: 'lesson_quiz_done', total: results.length, right, mastered, mistakes: misses.length }));
    return { right, total: results.length, pct, mastered, completed: completed || unit.status === 'completed', mistake_cards: misses.length };
  }

  // ── Tarjetas ──
  if (action === 'cards_due') {
    const limit = Math.max(1, Math.min(DUE_MAX, Number(b.limit) || 30));
    const cards = checked(await db.from('dream_cards').select('id,exam_id,unit_id,front,back,due,stability,difficulty,reps,lapses,state,last_review')
      .eq('student_id', owner).eq('suspended', false).lte('due', new Date().toISOString()).order('due').limit(limit)) ?? [];
    // Primero las del examen más cercano; dentro, intercaladas por unidad.
    const exams = checked(await db.from('dream_exams').select('id,exam_date').eq('owner_id', owner)) ?? [];
    const when = new Map((exams as { id: string; exam_date: string }[]).map((e) => [e.id, e.exam_date]));
    const sorted = [...(cards as { exam_id: string; unit_id: string | null }[])].sort((x, y) => String(when.get(x.exam_id)).localeCompare(String(when.get(y.exam_id))));
    return { cards: sorted, total: sorted.length };
  }
  if (action === 'cards_list') {
    // Las tarjetas de un examen, para gestionarlas y exportarlas (Bloque 4).
    const cards = checked(await db.from('dream_cards').select('id,unit_id,front,back,origin,due,suspended')
      .eq('student_id', owner).eq('exam_id', id(b.exam_id)).order('created_at').limit(500)) ?? [];
    return { cards };
  }
  if (action === 'card_review') {
    const rating = Number(b.rating);
    if (![1, 2, 3, 4].includes(rating)) throw new ExamError('Puntuación no válida.');
    const reviewId = id(b.review_id);
    // Repasos sin conexión: el mismo review_id dos veces no cuenta dos veces.
    const done = checked(await db.from('dream_card_reviews').select('review_id').eq('review_id', reviewId).eq('student_id', owner).maybeSingle());
    const card = checked(await db.from('dream_cards').select('id,stability,difficulty,reps,lapses,state,last_review,due').eq('id', id(b.card_id)).eq('student_id', owner).maybeSingle()) as never;
    if (!card) throw new ExamError('Tarjeta no encontrada.', 404);
    if (done) return { card, duplicate: true };
    const at = typeof b.reviewed_at === 'string' && Date.parse(b.reviewed_at) && Date.parse(b.reviewed_at) <= Date.now() + 60_000 ? new Date(b.reviewed_at) : new Date();
    const next = schedule(card, rating as 1, at);
    const ins = await db.from('dream_card_reviews').insert({ review_id: reviewId, card_id: (card as { id: string }).id, student_id: owner, rating, reviewed_at: at.toISOString(), elapsed_days: next.elapsed_days });
    if (ins.error) return { card, duplicate: true };
    const { elapsed_days: _e, ...state } = next;
    const saved = checked(await db.from('dream_cards').update(state).eq('id', (card as { id: string }).id).eq('student_id', owner).select('id,due,stability,difficulty,reps,lapses,state,last_review').single());
    return { card: saved, duplicate: false };
  }
  if (action === 'card_create' || action === 'cards_import') {
    const exam = checked(await db.from('dream_exams').select('id').eq('id', id(b.exam_id)).eq('owner_id', owner).maybeSingle());
    if (!exam) throw new ExamError('Examen no encontrado.', 404);
    const rows = action === 'card_create' ? [{ front: b.front, back: b.back }] : Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) throw new ExamError('No hay tarjetas que importar.');
    if (rows.length > IMPORT_MAX) throw new ExamError(`Como mucho ${IMPORT_MAX} tarjetas por importación.`);
    const clean = rows.map((r: { front?: unknown; back?: unknown }) => ({ student_id: owner, exam_id: (exam as { id: string }).id, front: cardSide(r?.front), back: cardSide(r?.back), origin: action === 'card_create' ? 'own' : 'import' }));
    const ins = await db.from('dream_cards').insert(clean).select('id');
    if (ins.error) throw new ExamError(/cards_per/.test(String(ins.error.message)) ? 'Has llegado al máximo de tarjetas de este examen.' : 'No se pudieron guardar las tarjetas.', /cards_per/.test(String(ins.error.message)) ? 409 : 503);
    return { created: ins.data?.length ?? 0 };
  }
  if (action === 'card_update') {
    const saved = checked(await db.from('dream_cards').update({ front: cardSide(b.front), back: cardSide(b.back) }).eq('id', id(b.card_id)).eq('student_id', owner).select('id,front,back').maybeSingle());
    if (!saved) throw new ExamError('Tarjeta no encontrada.', 404);
    return { card: saved };
  }
  if (action === 'card_delete') {
    checked(await db.from('dream_cards').delete().eq('id', id(b.card_id)).eq('student_id', owner));
    return { ok: true };
  }
  if (action === 'card_report') {
    // «No estoy de acuerdo» en una tarjeta: se oculta del repaso y queda marcada.
    checked(await db.from('dream_cards').update({ reported_at: new Date().toISOString(), suspended: true }).eq('id', id(b.card_id)).eq('student_id', owner));
    return { ok: true };
  }
  if (action === 'error_bank_list') {
    const items = checked(await db.from('dream_error_bank').select('id,unit_id,session_id,question_ref,cause,cause_confirmed_by_student,created_at')
      .eq('student_id', owner).eq('exam_id', id(b.exam_id)).order('created_at', { ascending: false }).limit(200));
    return { items: items ?? [] };
  }
  throw new ExamError('Acción no disponible.', 404);
}
