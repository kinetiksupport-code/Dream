import { validateEvaluations } from './grading.mjs';
import { captureEdgeFailure } from './monitoring.ts';
import { AdmissionError, consumingActions, createAdmission, readBoundedBody } from './admission.mjs';
import { tavilyProvider, TavilyError } from './tavily.mjs';
import { examAction, examContext, ExamError } from './exams.ts';
import { createClient, type User, type SupabaseClient } from 'npm:@supabase/supabase-js@2.95.0';
import { resolveDreamMode, emailDomain, isAutoClassified } from './mode.mjs';
import { DREAM_SYSTEM_PROMPT, dynamicContextFor } from './prompts.mjs';
import { selectEducationalSkills, educationalSkillPrompt } from './educational-skills.mjs';
import { groqProvider, groqModel, groqConfigured, GroqProviderError } from './groq.mjs';
import { webSearchTool, collectToolCalls, validateToolCall, searchWeb, wantsWebSearch } from './tools.mjs';
import {
  MAX_ATTACHMENT_CONTEXT_CHARS, isSupportedExtension, maxBytesFor,
  extractAttachment, base64ByteLength,
} from './attachments.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-dream-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Vary': 'Origin'
};
const json = (data: unknown, status = 200, extra: Record<string,string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROMPT = 12000;
const MAX_HISTORY = 20;
const MAX_BODY_CHARS = 12_000_000;
function safeFailure(error: unknown): Response {
  if (error instanceof AdmissionError || error instanceof GroqProviderError || error instanceof TavilyError) {
    const status = error.status === 429 ? 429 : error instanceof AdmissionError ? error.status : 503;
    const code = error.code;
    const message = status === 429 ? code === 'provider_rate_limit' ? 'El proveedor ha limitado las solicitudes. Respeta la espera indicada.' : 'Has alcanzado un límite de Dream. Espera antes de volver a intentarlo.' : status === 409 ? 'Esta solicitud ya está en curso o fue procesada. Abre los datos guardados.' : status === 413 ? 'El archivo o contexto excede el presupuesto permitido por solicitud.' : 'La IA no está disponible ahora. Puedes consultar tus datos guardados.';
    return json({ error: message, code, retry_after: error.retryAfter || 0 }, status, error.retryAfter ? {'Retry-After':String(error.retryAfter)} : {});
  }
  return json({error:'No se pudo completar la operación. Tus datos guardados se conservan.'},503);
}

async function groqJson(system: string, user: string, operation: string, signal?: AbortSignal, admission?: ReturnType<typeof createAdmission>) {
  const response = await groqProvider.request({ operation, signal, beforeAttempt: admission?.beforeAttempt, pause: admission?.pause, body: {
    model: groqModel(), stream: false, temperature: 0.25, max_tokens: 3500,
    response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  }});
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('empty');
  return JSON.parse(content);
}

const normalizeAnswer = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('es');
function objectiveAnswerIsCorrect(type: string, answer: unknown, expected: unknown) {
  if (answer == null || typeof answer === 'string' && !answer.trim()) return false;
  if (type === 'multiple_select') {
    if (!Array.isArray(answer) || !Array.isArray(expected)) return false;
    return answer.map(normalizeAnswer).sort().join('|') === expected.map(normalizeAnswer).sort().join('|');
  }
  if (type === 'matching') {
    if (!answer || !expected || typeof answer !== 'object' || typeof expected !== 'object') return false;
    const left = Object.entries(expected as Record<string,string>);
    return left.every(([key, value]) => normalizeAnswer((answer as Record<string,unknown>)[key]) === normalizeAnswer(value));
  }
  if (type === 'numeric') {
    const actual = Number(String(answer).replace(',', '.')); const correct = Number(String(expected).replace(',', '.'));
    return Number.isFinite(actual) && Number.isFinite(correct) && Math.abs(actual - correct) <= Math.max(1e-9, Math.abs(correct) * 1e-6);
  }
  return normalizeAnswer(answer) === normalizeAnswer(expected);
}

async function handle(req: Request, examInternal = false, inherited?: ReturnType<typeof createAdmission>, verified?: {user:User;admin:SupabaseClient;profile:Record<string,unknown>}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const bearer = req.headers.get('Authorization') || '';
  if (!bearer.startsWith('Bearer ')) return json({ error: 'Inicia sesión para continuar.' }, 401);

  let user = verified?.user ?? null;
  if (!user) {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth:{persistSession:false,autoRefreshToken:false},
      global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.any([req.signal,AbortSignal.timeout(10000)])})}
    });
    const authenticated = await userClient.auth.getUser(bearer.slice(7));
    const authError=authenticated.error;
    if(authError && (authError.name==='AuthRetryableFetchError' || (authError.status??0)>=500)) return json({error:'No se pudo comprobar tu sesión ahora. No se ha cerrado tu cuenta.'},503,{'Retry-After':'30'});
    user=authenticated.data.user;
    if(authError || !user) return json({error:'La sesión ha caducado. Vuelve a entrar.'},401);
  }

  let body: any;
  try {
    const raw = await readBoundedBody(req, MAX_BODY_CHARS);
    if (raw.length > MAX_BODY_CHARS) return json({ error: 'Solicitud demasiado grande.' }, 413);
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof AdmissionError) return safeFailure(error);
    return json({ error: 'Solicitud no válida.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Solicitud no válida.' }, 400);

  const admin = verified?.admin ?? createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const requestId = req.headers.get('x-dream-request-id') || body.request_id;
  const admission = inherited ?? createAdmission(admin, user.id, uuid.test(requestId || '') ? requestId! : crypto.randomUUID());
  let streamOwnsLease = false;
  let admitted = false;
  const consuming = !examInternal && consumingActions.has(String(body.action));
  try {
    if (consuming) { await admission.admit(String(body.action)); admitted = true; }
  const jsonAI = (system: string, context: string, operation: string, signal?: AbortSignal) => groqJson(system, context, operation, signal, admission);
  const email = String(user.email || '').trim().toLowerCase();
  const domain = emailDomain(email);

  let { data: profile } = verified ? {data:verified.profile} : await admin.from('dream_profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    const insert = await admin.from('dream_profiles').upsert({
      id: user.id,
      email,
      email_domain: domain,
      role: 'student',
      education_mode: true,
      onboarding_completed: true
    }, {onConflict:'id',ignoreDuplicates:true});
    const loaded = await admin.from('dream_profiles').select('*').eq('id',user.id).single();
    if (insert.error || loaded.error) return json({ error: 'No se pudo preparar tu perfil.' }, 503);
    profile = loaded.data;
  }

  const mode = resolveDreamMode(user, profile);
  const publicProfile = {
    email,
    role: mode.role,
    education_mode: mode.educationMode,
    age_band: mode.ageBand,
    guardian_required: mode.guardianRequired,
    onboarding_completed: mode.onboardingCompleted,
    needs_role_question: false,
    display_name: profile.display_name ?? user.user_metadata?.full_name ?? null,
    academic_level: profile.academic_level ?? null,
    pref_step_by_step: profile.pref_step_by_step !== false,
    pref_practice_suggestions: profile.pref_practice_suggestions !== false,
    pref_calm_tone: profile.pref_calm_tone !== false
  };

  if (body.action === 'exams' || String(body.action).startsWith('exam_')) {
    try {
      const result = await examAction(admin, user.id, body, jsonAI, payload => handle(new Request(req.url, {
        method: 'POST', headers: req.headers, body: JSON.stringify(payload), signal: req.signal
      }), true, admission, {user,admin,profile}), req.signal);
      return json(result);
    } catch (error) {
      if (error instanceof AdmissionError || error instanceof GroqProviderError || error instanceof TavilyError) return safeFailure(error);
      return json({ error: error instanceof ExamError ? error.message : 'No se pudo completar la operación. Tus datos guardados se conservan.' }, error instanceof ExamError ? error.status : 503);
    }
  }

  if (body.action === 'profile') {
    return json({ profile: publicProfile, service_ready: groqConfigured() });
  }

  if (body.action === 'onboarding') {
    if (isAutoClassified(domain)) {
      return json({ profile: publicProfile, ignored: true });
    }
    const role = body.role;
    if (!['student', 'teacher', 'general'].includes(role)) return json({ error: 'Elige un tipo de uso.' }, 400);

    const patch: Record<string, unknown> = {
      role,
      education_mode: role === 'student',
      updated_at: new Date().toISOString()
    };

    if (role === 'student') {
      const birthDate = typeof body.birth_date === 'string' ? body.birth_date : '';
      const parsedBirth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate + 'T00:00:00Z') : null;
      if (!parsedBirth || Number.isNaN(parsedBirth.valueOf()) || parsedBirth > new Date()) return json({ error: 'Indica una fecha de nacimiento válida.' }, 400);
      const today = new Date(); let age = today.getUTCFullYear() - parsedBirth.getUTCFullYear();
      if (today.getUTCMonth() < parsedBirth.getUTCMonth() || (today.getUTCMonth() === parsedBirth.getUTCMonth() && today.getUTCDate() < parsedBirth.getUTCDate())) age--;
      const ageBand = age < 14 ? 'under_14' : age < 18 ? '14_17' : '18_plus';
      patch.display_name = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 80) : null;
      patch.birth_date = birthDate;
      patch.academic_level = typeof body.academic_level === 'string' ? body.academic_level.trim().slice(0, 80) : null;
      if (!patch.display_name || !patch.academic_level) return json({ error: 'Completa tu nombre y nivel educativo.' }, 400);
      patch.age_band = ageBand;
      patch.guardian_required = ageBand === 'under_14';
      patch.guardian_confirmed_at = null;
      patch.onboarding_completed = true;
    } else {
      patch.age_band = null;
      patch.guardian_required = false;
      patch.guardian_confirmed_at = null;
      patch.onboarding_completed = true;
    }

    const { data: updated, error } = await admin
      .from('dream_profiles').update(patch).eq('id', user.id).select('*').single();
    if (error) return json({ error: 'No se pudo guardar tu respuesta.' }, 503);

    const next = resolveDreamMode(user, updated);
    return json({
      profile: {
        email,
        role: next.role,
        education_mode: next.educationMode,
        age_band: next.ageBand,
        guardian_required: next.guardianRequired,
        onboarding_completed: next.onboardingCompleted,
        needs_role_question: false,
        display_name: updated.display_name ?? user.user_metadata?.full_name ?? null,
        academic_level: updated.academic_level ?? null,
        pref_step_by_step: updated.pref_step_by_step !== false,
        pref_practice_suggestions: updated.pref_practice_suggestions !== false,
        pref_calm_tone: updated.pref_calm_tone !== false
      }
    });
  }

  // --- preferencias (reales: se guardan y se usan de verdad en el prompt) --
  if (body.action === 'preferences_update') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.pref_step_by_step === 'boolean') patch.pref_step_by_step = body.pref_step_by_step;
    if (typeof body.pref_practice_suggestions === 'boolean') patch.pref_practice_suggestions = body.pref_practice_suggestions;
    if (typeof body.pref_calm_tone === 'boolean') patch.pref_calm_tone = body.pref_calm_tone;

    const { data: updated, error } = await admin
      .from('dream_profiles').update(patch).eq('id', user.id).select('*').single();
    if (error) return json({ error: 'No se pudieron guardar las preferencias.' }, 503);

    return json({
      profile: {
        ...publicProfile,
        pref_step_by_step: updated.pref_step_by_step !== false,
        pref_practice_suggestions: updated.pref_practice_suggestions !== false,
        pref_calm_tone: updated.pref_calm_tone !== false
      }
    });
  }

  if (body.action === 'conversations') {
    const { data, error } = await admin
      .from('dream_conversations').select('id,title,updated_at')
      .eq('owner_id', user.id).order('updated_at', { ascending: false }).limit(100);
    return error ? json({ error: 'No se pudieron cargar las conversaciones.' }, 503) : json({ items: data });
  }

  if (body.action === 'conversation_create') {
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120) : 'Nueva conversación';
    const { data, error } = await admin
      .from('dream_conversations').insert({ owner_id: user.id, title }).select('id,title,updated_at').single();
    return error ? json({ error: 'No se pudo crear la conversación.' }, 503) : json({ conversation: data });
  }

  if (body.action === 'conversation_rename') {
    if (!uuid.test(body.conversation_id || '')) return json({ error: 'Conversación no válida.' }, 400);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    if (!title) return json({ error: 'Escribe un nombre.' }, 400);
    const { error } = await admin.from('dream_conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', body.conversation_id).eq('owner_id', user.id);
    return error ? json({ error: 'No se pudo renombrar.' }, 503) : json({ ok: true });
  }

  if (body.action === 'conversation_delete') {
    if (!uuid.test(body.conversation_id || '')) return json({ error: 'Conversación no válida.' }, 400);
    const { error } = await admin.from('dream_conversations')
      .delete().eq('id', body.conversation_id).eq('owner_id', user.id);
    return error ? json({ error: 'No se pudo eliminar.' }, 503) : json({ ok: true });
  }

  // Eliminar TODAS las conversaciones del usuario — acción real de gestión
  // de datos (sustituye a los toggles simulados de "privacidad" del mock).
  if (body.action === 'conversations_delete_all') {
    const { error } = await admin.from('dream_conversations').delete().eq('owner_id', user.id);
    return error ? json({ error: 'No se pudieron eliminar las conversaciones.' }, 503) : json({ ok: true });
  }

  if (body.action === 'messages') {
    if (!uuid.test(body.conversation_id || '')) return json({ error: 'Conversación no válida.' }, 400);
    const offset = Number(body.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return json({error:'Página no válida.'},400);
    const { data, error } = await admin.from('dream_messages').select('id,role,content,created_at')
      .eq('conversation_id', body.conversation_id).eq('owner_id', user.id)
      .order('created_at', { ascending: false }).order('id',{ascending:false}).range(offset,offset+49);
    return error ? json({error:'No se pudieron cargar los mensajes.'},503) : json({items:data?.reverse(),next_offset:data?.length===50?offset+50:null});
  }

  if (body.action === 'attachment_upload') {
    if (!uuid.test(body.conversation_id || '')) return json({ error: 'Conversación no válida.' }, 400);
    const fileName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 255) : '';
    const base64 = typeof body.content_base64 === 'string' ? body.content_base64 : '';
    if (!fileName || !base64) return json({ error: 'Falta el archivo.' }, 400);

    const owns = await admin.from('dream_conversations')
      .select('id').eq('id', body.conversation_id).eq('owner_id', user.id).maybeSingle();
    if (!owns.data) return json({ error: 'Conversación no encontrada.' }, 404);

    if (!isSupportedExtension(fileName)) {
      return json({ error: 'Formato no compatible. Usa imágenes, PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), texto, Markdown, código, CSV o JSON.' }, 415);
    }

    let sizeBytes: number;
    try {sizeBytes=base64ByteLength(base64);}catch{return json({error:'El archivo contiene datos no válidos.'},400);}
    if (sizeBytes > maxBytesFor(fileName)) {
      return json({ error: 'El archivo supera el límite permitido para este formato.' }, 413);
    }

    let extractedText: string;
    try {
      extractedText = await extractAttachment({
        fileName,
        mimeType: typeof body.mime_type === 'string' ? body.mime_type.slice(0, 100) : '',
        base64,
        signal: req.signal, admission,
      });
    } catch (error) {
      if (error instanceof AdmissionError || error instanceof GroqProviderError) return safeFailure(error);
      const code = error instanceof Error ? error.message : '';
      if (code === 'too_many_pages') return json({ error: 'El PDF supera el máximo de 80 páginas.' }, 413);
      if (code === 'empty_pdf') return json({ error: 'El PDF no contiene texto extraíble. Prueba a adjuntar sus páginas como imágenes.' }, 422);
      if (code.startsWith('vision_')) return json({ error: 'No se pudo analizar la imagen. Inténtalo de nuevo.' }, 502);
      return json({ error: 'No se pudo procesar el archivo. Comprueba que no esté dañado o protegido.' }, 422);
    }

    const insert = await admin.from('dream_attachments').insert({
      conversation_id: body.conversation_id,
      owner_id: user.id,
      file_name: fileName,
      mime_type: typeof body.mime_type === 'string' ? body.mime_type.slice(0, 100) : null,
      size_bytes: sizeBytes,
      status: 'processed',
      extracted_text: extractedText
    }).select('id, file_name, status').single();

    if (insert.error) return json({ error: 'No se pudo guardar el archivo.' }, 503);
    return json({ attachment: insert.data });
  }

  if (body.action === 'teacher_invite_create') {
    if (mode.role !== 'teacher') return json({ error: 'Esta acción es solo para profesores.' }, 403);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let code = '';
    for (const value of bytes) code += alphabet[value % alphabet.length];
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const created = await admin.from('dream_teacher_invites').insert({
      teacher_id: user.id, code, expires_at: expiresAt
    }).select('id,code,expires_at,max_uses,uses').single();
    return created.error ? json({ error: 'No se pudo crear el código.' }, 503) : json({ invite: created.data });
  }

  if (body.action === 'teacher_invites') {
    if (mode.role !== 'teacher') return json({ error: 'Esta acción es solo para profesores.' }, 403);
    const invites = await admin.from('dream_teacher_invites')
      .select('id,code,expires_at,max_uses,uses,revoked_at,created_at')
      .eq('teacher_id', user.id).order('created_at', { ascending: false }).limit(20);
    return invites.error ? json({ error: 'No se pudieron cargar los códigos.' }, 503) : json({ items: invites.data || [] });
  }

  if (body.action === 'teacher_invite_join') {
    if (mode.role !== 'student') return json({ error: 'Esta acción es para alumnos.' }, 403);
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z2-9]{8}$/.test(code)) return json({ error: 'Código no válido.' }, 400);
    const invite = await admin.from('dream_teacher_invites').select('*').eq('code', code).maybeSingle();
    const row = invite.data;
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now() || row.uses >= row.max_uses) {
      return json({ error: 'Código no válido o caducado.' }, 404);
    }
    const linked = await admin.from('dream_teacher_student_links').upsert({
      teacher_id: row.teacher_id, student_id: user.id, status: 'active', shared_at: new Date().toISOString()
    }, { onConflict: 'teacher_id,student_id' });
    if (linked.error) return json({ error: 'No se pudo vincular la cuenta.' }, 503);
    await admin.from('dream_teacher_invites').update({ uses: row.uses + 1 }).eq('id', row.id);
    return json({ ok: true });
  }

  if (body.action === 'teacher_link_revoke') {
    if (mode.role !== 'teacher') return json({ error: 'Esta acción es solo para profesores.' }, 403);
    if (!uuid.test(body.student_id || '')) return json({ error: 'Alumno no válido.' }, 400);
    const changed = await admin.from('dream_teacher_student_links')
      .update({ status: 'revoked' }).eq('teacher_id', user.id).eq('student_id', body.student_id);
    return changed.error ? json({ error: 'No se pudo revocar el acceso.' }, 503) : json({ ok: true });
  }

  if (body.action === 'teacher_dashboard') {
    if (mode.role !== 'teacher') return json({ error: 'Esta vista es solo para profesores.' }, 403);
    const links = await admin.from('dream_teacher_student_links').select('student_id').eq('teacher_id', user.id).eq('status', 'active');
    const ids = (links.data || []).map((row: any) => row.student_id);
    if (!ids.length) return json({ students: [], summary: { students: 0, tests: 0, topics: 0, needs_review: 0 } });
    const [profilesResult, topicsResult, attemptsResult] = await Promise.all([
      admin.from('dream_profiles').select('id,display_name,email,academic_level').in('id', ids),
      admin.from('dream_learning_topics').select('student_id,concept,status').in('student_id', ids),
      admin.from('dream_test_attempts').select('student_id').in('student_id', ids).eq('status', 'completed')
    ]);
    const topics = topicsResult.data || [];
    const students = (profilesResult.data || []).map((p: any) => {
      const own = topics.filter((t: any) => t.student_id === p.id);
      return { id: p.id, name: p.display_name || String(p.email || '').split('@')[0], level: p.academic_level,
        practicing: own.filter((t: any) => t.status === 'practicing').length,
        improving: own.filter((t: any) => ['improving','almost_mastered'].includes(t.status)).length,
        mastered: own.filter((t: any) => t.status === 'mastered').length,
        review: own.filter((t: any) => ['new','practicing'].includes(t.status)).slice(0, 3).map((t: any) => t.concept) };
    });
    return json({ students, summary: { students: students.length, tests: (attemptsResult.data || []).length, topics: topics.length,
      needs_review: new Set(topics.filter((t: any) => ['new','practicing'].includes(t.status)).map((t: any) => t.student_id)).size } });
  }

  if (body.action === 'test_generate') {
    if (mode.role !== 'student') return json({ error: 'Los tests de progreso están disponibles en el perfil de alumno.' }, 403);
    const context = typeof body.context === 'string' ? body.context.trim().slice(0, examInternal ? 30000 : 10000) : '';
    if (!context) return json({ error: 'Necesito un tema para crear el test.' }, 400);
    const count = Math.max(3, Math.min(10, Number(body.question_count) || 5));
    const testMode = body.mode === 'exam' ? 'exam' : 'practice';
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty.trim().slice(0, 40) || 'intermedio' : 'intermedio';
    let ownedConversationId: string | null = null;
    if (uuid.test(body.conversation_id || '')) {
      const owns = await admin.from('dream_conversations').select('id').eq('id', body.conversation_id).eq('owner_id', user.id).maybeSingle();
      ownedConversationId = owns.data?.id || null;
    }
    const testAttachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter((id: unknown) => typeof id === 'string' && uuid.test(id)).slice(0, 4) : [];
    let testAttachmentRows: any[] = [];
    if (ownedConversationId && testAttachmentIds.length) {
      const found = await admin.from('dream_attachments').select('id,file_name,extracted_text').in('id', testAttachmentIds)
        .eq('conversation_id', ownedConversationId).eq('owner_id', user.id).eq('status', 'processed').is('message_id', null);
      testAttachmentRows = found.data || [];
    }
    let recentEducationalContext = '';
    if (ownedConversationId) {
      const recent = await admin.from('dream_messages').select('role,content').eq('conversation_id', ownedConversationId).eq('owner_id', user.id)
        .order('created_at', { ascending: false }).limit(8);
      recentEducationalContext = (recent.data || []).reverse().map((message: any) => `${message.role === 'user' ? 'Estudiante' : 'Dream'}: ${String(message.content || '').replace(/<!--DREAM_WIDGET:[^]*?-->/g, '').slice(0, 2500)}`).join('\n');
    }
    const attachmentMaterial = testAttachmentRows.length ? `\n\nMaterial adjunto del estudiante:\n${testAttachmentRows.map((file: any) => `Archivo: ${file.file_name}\n${file.extracted_text || ''}`).join('\n\n---\n\n').slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)}` : '';
    let examTestContext = '';
    if (body.exam_id) {
      try { examTestContext = await examContext(admin, user.id, body.exam_id, body.unit_id, body.conversation_id); }
      catch (error) { return json({ error: error instanceof ExamError ? error.message : 'No se pudo abrir el contexto del examen.' }, error instanceof ExamError ? error.status : 503); }
    }
    const generationContext = `${recentEducationalContext ? `Conversación reciente:\n${recentEducationalContext}\n\n` : ''}Solicitud actual: ${context}${attachmentMaterial}\n${examTestContext}`;
    if (!groqConfigured()) return json({ error: 'El servicio de IA no está configurado.' }, 503);
    let generated: any;
    try {
      generated = await jsonAI(
        `Eres el motor privado de tests de Dream. Devuelve SOLO JSON válido. Crea un test ${testMode === 'exam' ? 'de examen' : 'de práctica'} con ${count} preguntas variadas y dificultad ${difficulty}. Esquema exacto: {"title":"...","subject":"...","topic":"...","questions":[{"type":"multiple_choice|multiple_select|true_false|short_answer|numeric|fill_blank|matching|math","prompt":"...","options":["..."],"matchingPairs":[{"left":"...","right":"..."}],"correctAnswer":"...","rubric":"...","expectedConcepts":["..."],"explanation":"..."}]}. Alterna tipos que encajen con la materia; no fuerces todos. multiple_choice lleva 4 opciones y una respuesta exacta; multiple_select lleva 4-6 opciones y correctAnswer es un array; true_false lleva ["Verdadero","Falso"]; numeric usa respuesta numérica; fill_blank una cadena; matching lleva 3-5 matchingPairs y correctAnswer puede omitirse; math y short_answer llevan rúbrica. Usa LaTeX delimitado en prompts matemáticos. No reveles claves fuera de correctAnswer o matchingPairs.`, generationContext, 'test_generate', req.signal);
    } catch (error) { if (error instanceof AdmissionError || error instanceof GroqProviderError) return safeFailure(error); return json({ error: 'No se pudo generar el test. Inténtalo de nuevo.' }, 502); }
    if (!Array.isArray(generated.questions) || generated.questions.length < 1) return json({ error: 'El test generado no era válido.' }, 502);
    const testInsert = await admin.from('dream_tests').insert({ owner_id: user.id,
      conversation_id: ownedConversationId,
      title: String(generated.title || 'Test de práctica').slice(0, 160), subject: String(generated.subject || 'General').slice(0, 100),
      topic: String(generated.topic || 'Práctica').slice(0, 160), status: 'ready', mode: testMode, difficulty }).select('id,title,subject,topic,status,mode,difficulty').single();
    if (testInsert.error) return json({ error: 'No se pudo guardar el test.' }, 503);
    const supported = ['multiple_choice','multiple_select','true_false','short_answer','numeric','fill_blank','matching','math'];
    const rows = generated.questions.slice(0, count).map((q: any, position: number) => {
      const type = supported.includes(q.type) ? q.type : 'multiple_choice';
      const pairs = type === 'matching' && Array.isArray(q.matchingPairs) ? q.matchingPairs.slice(0, 6).filter((p: any) => p?.left && p?.right) : [];
      const matchingAnswer = Object.fromEntries(pairs.map((p: any) => [String(p.left), String(p.right)]));
      return { test_id: testInsert.data.id, position, type, prompt: String(q.prompt || '').slice(0, 2000),
        options: Array.isArray(q.options) ? q.options.map(String).slice(0, 6) : [], correct_answer: type === 'matching' ? matchingAnswer : q.correctAnswer,
        metadata: type === 'matching' ? { left: pairs.map((p: any) => String(p.left)), right: pairs.map((p: any) => String(p.right)).map((value: string) => ({ value, order: crypto.getRandomValues(new Uint32Array(1))[0] })).sort((a: {order: number}, b: {order: number}) => a.order-b.order).map((item: {value: string}) => item.value) } : {},
        rubric: String(q.rubric || '').slice(0, 2000), expected_concepts: Array.isArray(q.expectedConcepts) ? q.expectedConcepts.map(String).slice(0, 8) : [],
        explanation: String(q.explanation || '').slice(0, 3000) };
    });
    const questionsInsert = await admin.from('dream_test_questions').insert(rows);
    if (questionsInsert.error) { await admin.from('dream_tests').delete().eq('id', testInsert.data.id); return json({ error: 'No se pudo completar el test.' }, 503); }
    const widget = { type: 'quiz', testId: testInsert.data.id, title: testInsert.data.title, subject: testInsert.data.subject,
      topic: testInsert.data.topic, questionCount: rows.length, difficulty, mode: testMode };
    const assistantMessage = `He preparado un ${testMode === 'exam' ? 'examen' : 'test de práctica'} sobre ${testInsert.data.topic}.\n\n<!--DREAM_WIDGET:${JSON.stringify(widget)}-->`;
    if (ownedConversationId) {
      let userMessageId: string | null = null;
      if (body.persist_user_message === true) {
        const saved = await admin.from('dream_messages').insert({ conversation_id: ownedConversationId, owner_id: user.id, role: 'user', content: context }).select('id').single();
        userMessageId = saved.data?.id || null;
      }
      if (userMessageId && testAttachmentRows.length) await admin.from('dream_attachments').update({ message_id: userMessageId }).in('id', testAttachmentRows.map((file: any) => file.id));
      await admin.from('dream_messages').insert({ conversation_id: ownedConversationId, owner_id: user.id, role: 'assistant', content: assistantMessage });
      await admin.from('dream_conversations').update({ updated_at: new Date().toISOString() }).eq('id', ownedConversationId);
    }
    return json({ test: testInsert.data, assistant_message: assistantMessage, widget });
  }

  if (body.action === 'test_get') {
    if (!uuid.test(body.test_id || '')) return json({ error: 'Test no válido.' }, 400);
    const testResult = await admin.from('dream_tests').select('id,title,subject,topic,status,mode,difficulty').eq('id', body.test_id).eq('owner_id', user.id).maybeSingle();
    if (!testResult.data) return json({ error: 'Test no encontrado.' }, 404);
    const questionsResult = await admin.from('dream_test_questions').select('id,position,type,prompt,options,metadata').eq('test_id', body.test_id).order('position');
    return questionsResult.error ? json({ error: 'No se pudieron cargar las preguntas.' }, 503) : json({ test: { ...testResult.data, questions: questionsResult.data } });
  }

  if (body.action === 'test_check_answer') {
    if (!uuid.test(body.test_id || '') || !uuid.test(body.question_id || '')) return json({ error: 'Pregunta no válida.' }, 400);
    const testResult = await admin.from('dream_tests').select('id,mode').eq('id', body.test_id).eq('owner_id', user.id).maybeSingle();
    if (!testResult.data) return json({ error: 'Test no encontrado.' }, 404);
    if (testResult.data.mode !== 'practice') return json({ error: 'En modo examen las respuestas se corrigen al final.' }, 409);
    const questionResult = await admin.from('dream_test_questions').select('*').eq('id', body.question_id).eq('test_id', body.test_id).maybeSingle();
    const question = questionResult.data;
    if (!question) return json({ error: 'Pregunta no encontrada.' }, 404);
    let isCorrect = false; let feedback = '';
    if (['short_answer','math'].includes(question.type)) {
      if (!groqConfigured()) return json({ error: 'El servicio de corrección no está configurado.' }, 503);
      try {
        const evaluation = await jsonAI(
          'Evalúa una respuesta de estudiante con la rúbrica. Devuelve SOLO JSON {"is_correct":true|false,"feedback":"explicación breve, específica y educativa"}. No infieras capacidad ni personalidad.',
          JSON.stringify({ prompt: question.prompt, answer: body.answer, rubric: question.rubric, expectedConcepts: question.expected_concepts, reference: question.correct_answer }), 'test_check_answer', req.signal);
        isCorrect = evaluation.is_correct === true; feedback = String(evaluation.feedback || 'Compara tu razonamiento con la explicación.').slice(0, 1200);
      } catch (error) { if (error instanceof AdmissionError || error instanceof GroqProviderError) return safeFailure(error); return json({ error: 'No se pudo corregir esta respuesta.' }, 502); }
    } else {
      isCorrect = objectiveAnswerIsCorrect(question.type, body.answer, question.correct_answer);
      feedback = isCorrect ? 'Correcto. Has aplicado bien el concepto.' : String(question.explanation || 'Revisa el concepto y vuelve a intentarlo.').slice(0, 1200);
    }
    return json({ evaluation: { is_correct: isCorrect, feedback, correct_answer: question.correct_answer } });
  }

  if (body.action === 'test_submit') {
    if (!examInternal) {
      const linked = await admin.from('dream_exam_sessions').select('id').eq('test_id', body.test_id).eq('owner_id', user.id).maybeSingle();
      if (linked.error) return json({ error: 'No se pudo consultar la entrega.' }, 503);
      if (linked.data) return json({ error: 'Entrega el simulacro desde tu examen para conservar su progreso.' }, 409);
    }
    if (!uuid.test(body.test_id || '') || !Array.isArray(body.answers)) return json({ error: 'Entrega no válida.' }, 400);
    const testResult = await admin.from('dream_tests').select('*').eq('id', body.test_id).eq('owner_id', user.id).maybeSingle();
    if (!testResult.data) return json({ error: 'Test no encontrado.' }, 404);
    if (body.answers.length > 10 || JSON.stringify(body.answers).length > 100000) return json({error:'Entrega demasiado grande.'},413);
    const previous = await admin.from('dream_test_attempts').select('id,score,total').eq('test_id',body.test_id).eq('student_id',user.id).eq('status','completed').order('completed_at',{ascending:false}).limit(1).maybeSingle();
    if (previous.error) return json({error:'No se pudo consultar la entrega.'},503);
    if (previous.data) return json({error:'Este test ya fue entregado. Consulta el resultado guardado en tu examen o genera una práctica nueva.',code:'already_submitted'},409);
    const questionsResult = await admin.from('dream_test_questions').select('*').eq('test_id', body.test_id).order('position');
    const questions = questionsResult.data || []; const submitted = new Map(body.answers.map((a: any) => [a.question_id, a.answer]));
    if (!questions.length || questions.some((q: any) => !submitted.has(q.id))) return json({ error: 'Responde todas las preguntas antes de entregar.' }, 400);
    const short = questions.filter((q: any) => ['short_answer','math'].includes(q.type)); let evaluations: any[] = [];
    if (short.length) {
      if (!groqConfigured()) return json({ error: 'El servicio de corrección no está configurado.' }, 503);
      try { const evaluation = await jsonAI(
        'Evalúa respuestas breves con la rúbrica. Devuelve SOLO JSON {"evaluations":[{"question_id":"uuid","is_correct":true|false,"feedback":"feedback académico breve"}]}. No infieras capacidad ni personalidad.',
        JSON.stringify(short.map((q: any) => ({ question_id: q.id, prompt: q.prompt, answer: submitted.get(q.id), rubric: q.rubric, expectedConcepts: q.expected_concepts, reference: q.correct_answer }))), 'test_submit', req.signal);
        evaluations = validateEvaluations(evaluation.evaluations, short.map((q: any) => q.id));
      } catch (error) { if (error instanceof AdmissionError || error instanceof GroqProviderError) return safeFailure(error); return json({ error: 'No se pudieron evaluar las respuestas breves.' }, 502); }
    }
    const items = questions.map((q: any) => { const answer = submitted.get(q.id); const ev = evaluations.find((x: any) => x.question_id === q.id);
      const isCorrect = ['short_answer','math'].includes(q.type) ? ev?.is_correct === true : objectiveAnswerIsCorrect(q.type, answer, q.correct_answer);
      return { question_id: q.id, prompt: q.prompt, answer, is_correct: isCorrect,
        correct_answer: q.correct_answer,
        feedback: ['short_answer','math'].includes(q.type) ? String(ev?.feedback || 'Revisa tu explicación con la rúbrica.') : isCorrect ? 'Correcto. Has aplicado bien el concepto.' : String(q.explanation || 'Revisa el concepto antes de intentarlo de nuevo.'),
        concepts: q.expected_concepts || [] }; });
    const score = items.filter((x: any) => x.is_correct).length;
    const committed = await admin.rpc('dream_test_commit', {p_owner:user.id,p_test:body.test_id,p_items:items});
    if (committed.error) return json({error:'No se pudo guardar la corrección completa. Tus datos anteriores se conservan.'},503);
    const attemptId = committed.data;
    const allConcepts = [...new Set(items.flatMap((x: any) => x.concepts))]; const mastered = allConcepts.filter(c => items.filter((x: any) => x.concepts.includes(c)).every((x: any) => x.is_correct));
    const practice = allConcepts.filter(c => !mastered.includes(c));
    return json({ result: { attempt_id: attemptId, score, total: items.length, percentage: Math.round(score / Math.max(1, items.length) * 100), mastered, practice,
      items: items.map(({ concepts, ...item }: any) => item) } });
  }

  if (body.action !== 'chat') return json({ error: 'Acción no válida.' }, 400);

  if (!mode.onboardingCompleted) {
    return json({ error: 'Completa la configuración inicial para empezar.', code: 'onboarding_required' }, 409);
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const searchRequested = wantsWebSearch(prompt);
  if (searchRequested && !tavilyProvider.configured()) return json({error:'La búsqueda web no está configurada. No puedo verificar información actual ahora.'},503);
  if (prompt.length < 1 || prompt.length > MAX_PROMPT) {
    return json({ error: 'Escribe entre 1 y 12.000 caracteres.' }, 400);
  }
  if (!uuid.test(body.conversation_id || '')) return json({ error: 'Conversación no válida.' }, 400);

  const conversation = await admin.from('dream_conversations')
    .select('id,title').eq('id', body.conversation_id).eq('owner_id', user.id).maybeSingle();
  if (conversation.error || !conversation.data) return json({ error: 'Conversación no encontrada.' }, 404);

  if (!groqConfigured()) {
    return json({ error: 'El servicio de IA todavía no está configurado en el servidor.', code: 'service_unconfigured' }, 503);
  }

  const attachmentIds = Array.isArray(body.attachment_ids)
    ? body.attachment_ids.filter((id: unknown) => typeof id === 'string' && uuid.test(id)).slice(0, 4)
    : [];

  let examStudyContext = '';
  if (body.exam_id || body.unit_id) {
    try { examStudyContext = await examContext(admin, user.id, body.exam_id, body.unit_id, body.conversation_id); }
    catch (error) { return json({ error: error instanceof ExamError ? error.message : 'No se pudo abrir el material de estudio.' }, error instanceof ExamError ? error.status : 503); }
  }
  let attachmentContext = '';
  let attachmentRows: { id: string }[] = [];
  if (attachmentIds.length) {
    const found = await admin.from('dream_attachments')
      .select('id, file_name, extracted_text')
      .in('id', attachmentIds)
      .eq('conversation_id', conversation.data.id)
      .eq('owner_id', user.id)
      .eq('status', 'processed')
      .is('message_id', null);
    attachmentRows = found.data || [];
    if (attachmentRows.length) {
      const parts = attachmentRows.map((a: any) => `Archivo: ${a.file_name}\n${a.extracted_text || ''}`);
      attachmentContext = parts.join('\n\n---\n\n').slice(0, MAX_ATTACHMENT_CONTEXT_CHARS);
    }
  }

  const history = await admin.from('dream_messages')
    .select('role,content').eq('conversation_id', conversation.data.id).eq('owner_id', user.id)
    .order('created_at', { ascending: false }).limit(MAX_HISTORY);
  const priorMessages = (history.data || []).reverse().map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0,4000) }));
  const educationalSelection = selectEducationalSkills(prompt, priorMessages, mode.educationMode);
  const model = groqModel();
  console.log(JSON.stringify({
    event: 'dream_mode_resolved',
    model,
    groq_key_slots: groqProvider.configuredKeyCount(),
    attachments: attachmentRows.length,
  }));

  let academicMemory: any[] = [];
  if (mode.role === 'student') {
    const memoryResult = await admin.from('dream_learning_topics').select('subject,topic,concept,status,evidence_count,correct_count')
      .eq('student_id', user.id).order('last_evidence_at', { ascending: false }).limit(50);
    const promptWords = new Set(prompt.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word: string) => word.length > 3));
    academicMemory = (memoryResult.data || []).filter((row: any) =>
      [row.subject,row.topic,row.concept].some((value: string) => String(value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).some(word => promptWords.has(word)))
    ).slice(0, 5);
  }
  const systemMessages = [
    { role: 'system', content: DREAM_SYSTEM_PROMPT },
    { role: 'system', content: `Política de conversación actual: responde proporcionalmente y con prosa natural. Para mensajes breves o ambiguos, responde brevemente o pregunta solo lo imprescindible; nunca inventes contexto ausente. No actives una lección por defecto para tareas generales. En un tema nuevo educativo, explica solo una idea, como máximo un ejemplo y, si aporta valor, una comprobación breve; espera el siguiente turno. Si el usuario ya domina una parte, comienza en la duda concreta. Una solicitud explícita de apuntes o resumen completo sí requiere respuesta completa. Para trabajo evaluable, ofrece el siguiente paso o pista y revisa el intento sin dar directamente el resultado. Un test para imprimir se entrega como texto; un test interactivo usa el flujo de test del producto. No inventes fechas ni datos recientes; cuando consultes la web, utiliza solamente los resultados obtenidos y distingue fechas y fuentes.` },
    ...(tavilyProvider.configured() ? [{ role: 'system', content: 'Tienes la herramienta web_search y puedes buscar en internet. Si el usuario pide buscar o investigar, úsala. Si no sabes un dato, o el dato es actual y puedes estar desfasado, búscala antes de responder. No digas que no puedes buscar. No inventes lo que no sepas: busca y responde solo con lo encontrado, citando la fuente.' }] : []),
    { role: 'system', content: dynamicContextFor(mode, {
      pref_step_by_step: profile.pref_step_by_step !== false,
      pref_practice_suggestions: profile.pref_practice_suggestions !== false,
      pref_calm_tone: profile.pref_calm_tone !== false
    }, academicMemory) },
    { role: 'system', content: educationalSkillPrompt(educationalSelection, profile.academic_level) },
  ];
  if (examStudyContext) systemMessages.push({ role: 'system', content: examStudyContext });
  if (attachmentContext) {
    systemMessages.push({ role: 'system', content: `Contexto de archivos adjuntos por el usuario:\n\n${attachmentContext}` });
  }

  const initialMessages = [...systemMessages, ...priorMessages, {role:'user',content:prompt}];
  await admission.beforeAttempt('groq', {messages:initialMessages,max_tokens:4096});
  let initialReservation = true;
  const streamAdmission = async (provider: string, providerBody: Record<string,unknown>) => {
    if (provider === 'groq' && initialReservation) { initialReservation = false; return; }
    await admission.beforeAttempt(provider, providerBody);
  };
  const userSave = await admin.from('dream_messages').insert({
    conversation_id: body.conversation_id, owner_id: user.id, role: 'user', content: prompt
  }).select('id').single();
  if (userSave.error) return json({ error: 'No se pudo guardar tu mensaje.' }, 503);

  if (attachmentRows.length) {
    await admin.from('dream_attachments')
      .update({ message_id: userSave.data.id })
      .in('id', attachmentRows.map((a) => a.id));
  }

  const encoder = new TextEncoder();
  const generationId = crypto.randomUUID();
  const generationAbort = new AbortController();
  const generationSignal = AbortSignal.any([req.signal, generationAbort.signal]);
  streamOwnsLease = true;
  const stream = new ReadableStream({
    async start(controller) {
      let answer = '';
      let closed = false;
      const streamStartedAt = Date.now();
      let firstChunkAt = 0;
      let chunkCount = 0;
      let chunkCharacters = 0;
      let largestChunk = 0;
      const send = (event: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); }
        catch { closed = true; generationAbort.abort('client_disconnected'); }
      };
      try {
        const messages: any[] = [...systemMessages, ...priorMessages, { role: 'user', content: prompt }];
        const searchAvailable = tavilyProvider.configured();
        const searchKey = searchAvailable;
        const toolDeltas: any[] = [];
        let provisional = '';
        const baseBody = { model, stream: true, max_tokens: 2048, temperature: mode.educationMode ? 0.5 : 0.7, stream_options: { include_usage: true } };
        // Buffer the first pass when tools are available so a search can run
        // before any speculative text reaches the student.
        for await (const chunk of groqProvider.stream({ generationId, signal: generationSignal, beforeAttempt: streamAdmission, pause: admission.pause,
          body: { ...baseBody, messages, ...(searchAvailable ? { tools: [webSearchTool], tool_choice: searchRequested ? 'required' : 'auto' } : {}) } })) {
          if (chunk?.choices?.[0]?.delta?.tool_calls?.length) toolDeltas.push(chunk);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            if (searchKey) provisional += delta;
            else {
              answer += delta;
              if (!firstChunkAt) firstChunkAt = Date.now();
              chunkCount++; chunkCharacters += delta.length;
              largestChunk = Math.max(largestChunk, delta.length);
              send({ type: 'delta', text: delta });
            }
          }
          if (answer.length > 32000 || provisional.length > 32000) break;
        }
        if (toolDeltas.length) {
          const calls = collectToolCalls(toolDeltas);
          if (calls.length !== 1) throw new Error('invalid_tool_call');
          // Validate before running anything; one bounded tool round prevents loops.
          const validated = validateToolCall(calls[0]);
          send({ type: 'activity', activity: 'searching' });
          let result: string;
          try { result = await searchWeb(validated.query, { signal: generationSignal, beforeAttempt: admission.beforeAttempt, pause: admission.pause }); }
          catch (error) { if (error instanceof AdmissionError || error instanceof TavilyError) throw error; throw new Error('web_search_failed'); }
          messages.push({ role: 'assistant', content: provisional || null, tool_calls: calls });
          messages.push({ role: 'tool', tool_call_id: validated.id, content: result });
          for await (const chunk of groqProvider.stream({ generationId, signal: generationSignal, beforeAttempt: admission.beforeAttempt, pause: admission.pause,
            body: { ...baseBody, messages } })) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta !== 'string' || !delta) continue;
            answer += delta;
            if (!firstChunkAt) firstChunkAt = Date.now();
            chunkCount++; chunkCharacters += delta.length;
            largestChunk = Math.max(largestChunk, delta.length);
            send({ type: 'delta', text: delta });
            if (answer.length > 32000) break;
          }
        } else if (searchKey && provisional) {
          answer = provisional;
          send({ type: 'delta', text: provisional });
        }
        if (answer.trim()) {
          await admin.from('dream_messages').insert({
            conversation_id: body.conversation_id, owner_id: user.id, role: 'assistant', content: answer.slice(0, 32000)
          });
          await admin.from('dream_conversations')
            .update({ updated_at: new Date().toISOString() }).eq('id', body.conversation_id);
          send({ type: 'complete' });
        } else {
          send({ type: 'error', message: 'El servicio respondió sin texto. Tu mensaje se conserva.' });
        }
      } catch (error) {
        if (!generationSignal.aborted) captureEdgeFailure('chat',error instanceof AdmissionError ? error.code : 'stream_failed');
        if (answer.trim()) {
          await admin.from('dream_messages').insert({
            conversation_id: body.conversation_id, owner_id: user.id, role: 'assistant', content: answer.slice(0, 32000)
          });
        }
        if (!(error instanceof GroqProviderError && error.code === 'aborted')) {
          send({ type: 'error', code: error instanceof AdmissionError || error instanceof GroqProviderError || error instanceof TavilyError ? error.code : 'stream_failed', retry_after: error instanceof AdmissionError || error instanceof GroqProviderError || error instanceof TavilyError ? error.retryAfter : 0, message: error instanceof AdmissionError || error instanceof TavilyError || error instanceof GroqProviderError && error.status === 429 ? (error.status === 429 ? 'Se ha alcanzado un límite de solicitudes. Espera antes de reintentar.' : 'No se pudo consultar el servicio ahora. Tus datos se conservan.') : !answer.trim() && error instanceof Error && error.message === 'web_search_failed'
            ? 'No se pudo consultar la web ahora mismo. Prueba de nuevo.' : answer.trim()
            ? 'La respuesta se interrumpió. Lo escrito hasta ahora se conserva.'
            : 'Dream está teniendo problemas para responder ahora mismo. Tu mensaje se ha conservado. Puedes intentarlo de nuevo.' });
        }
      } finally {
        if (admitted) await admission.release().catch(() => console.error(JSON.stringify({event:'admission_release_failed'})));
        if (chunkCount) console.log(JSON.stringify({
          event: 'dream_stream_metrics', generation_id: generationId,
          chunks: chunkCount, characters: chunkCharacters,
          average_chunk_characters: Math.round(chunkCharacters / chunkCount * 10) / 10,
          largest_chunk_characters: largestChunk,
          first_chunk_ms: firstChunkAt - streamStartedAt,
          total_ms: Date.now() - streamStartedAt
        }));
        closed = true;
        try { controller.close(); } catch { /* ya cerrado */ }
      }
    },
    cancel() { generationAbort.abort('client_cancelled'); }
  });

  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
  } catch (error) { captureEdgeFailure(String(body.action), error instanceof AdmissionError ? error.code : 'edge_failure'); return safeFailure(error); }
  finally { if (admitted && !streamOwnsLease) await admission.release().catch(() => console.error(JSON.stringify({event:'admission_release_failed'}))); }
}
Deno.serve(async (req: Request) => {
  const origin=req.headers.get('origin');
  const allowed=(Deno.env.get('DREAM_ALLOWED_ORIGINS')??'').split(',').map(o=>o.trim()).filter(Boolean);
  if(origin && !allowed.includes(origin)) return new Response(JSON.stringify({error:'Origen no permitido.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const response=await handle(new Request(req,{signal:AbortSignal.any([req.signal,AbortSignal.timeout(150000)])}));
  if(origin) response.headers.set('Access-Control-Allow-Origin',origin);
  return response;
});

