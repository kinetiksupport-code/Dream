// Banco de pruebas de la memoria del chat (docs/MEMORIA-CHAT.md, Bloque 5).
//
// Reproduce turno a turno lo que hace dream-api con los MÓDULOS REALES
// (chatSystemMessages, compactHistory, router, pizarra, índice de archivos) y
// llama a Groq con las claves del proyecto a través de una función temporal
// (BANCO_URL + BANCO_TOKEN; no se guardan en el repo). Corre cada conversación
// «antes» (comportamiento anterior) y «después», y escribe las transcripciones.
//
//   BANCO_URL=… BANCO_TOKEN=… npx tsx scripts/memoria/banco.mjs [salida.md] [antes|despues|todo]
import { writeFileSync } from 'node:fs';
import { chatSystemMessages } from '../../supabase/functions/dream-api/prompts.mjs';
import { compactHistory } from '../../supabase/functions/dream-api/capacity.mjs';
import { olderSummary } from '../../supabase/functions/dream-api/chat-helpers.mjs';
import { educationalSkillPrompt, selectEducationalSkills } from '../../supabase/functions/dream-api/educational-skills.mjs';
import { MODES, outputTokensFor } from '../../supabase/functions/dream-api/models.mjs';
import {
  REUPLOAD_NOTE, ROUTER_SCHEMA, asksToReupload, boardText, conversationFiles, emptyBoard, fileIndex, needsMaterial,
  normalizeRoute, pickFiles, routeByRules, routeCandidate, routerMessages, updateBoard,
} from '../../supabase/functions/dream-api/conversation-memory.mjs';
import { wantsGame, gameKindFor } from '../../lib/dream-games.ts';
import { wantsScheme } from '../../lib/esquema.ts';
import { CONVERSATIONS } from './conversaciones.mjs';

const URL_ = process.env.BANCO_URL;
const TOKEN = process.env.BANCO_TOKEN;
if (!URL_ || !TOKEN) { console.error('Faltan BANCO_URL y BANCO_TOKEN.'); process.exit(1); }
const OUT = process.argv[2] || 'banco-memoria.md';
const WHICH = process.argv[3] || 'todo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = (text) => Math.ceil(String(text ?? '').length / 3.5);
const tokOf = (messages) => messages.reduce((n, m) => n + tok(m.content), 0);

async function groq(payload) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-banco-token': TOKEN }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const wait = Math.max(8, Number(data.retry_after) || 0, 10 * (attempt + 1));
    process.stderr.write(`  · ${data.error ?? res.status}, espero ${wait}s\n`);
    await sleep(wait * 1000);
  }
  throw new Error('groq_sin_respuesta');
}

/** Una conversación entera con el comportamiento «antes» o «después». */
async function run(conv, version) {
  const state = { files: [], stored: [], board: emptyBoard(), transcript: [], metrics: [] };
  let clock = Date.parse('2026-10-27T10:00:00Z');
  const say = (role, content, extra = '') => state.transcript.push({ role, content, extra });
  for (const turn of conv.turns) {
    clock += 60_000;
    const mode = MODES[turn.mode ?? conv.mode ?? 'normal'];
    const attached = (turn.files ?? []).map((f, i) => {
      const row = { id: `${conv.id}-f${state.files.length + i + 1}`, file_name: f.name, extracted_text: f.text, created_at: new Date(clock).toISOString() };
      return row;
    });
    state.files.push(...attached);
    const convFiles = conversationFiles(state.files);
    say('user', turn.text, attached.length ? `adjunta: ${attached.map((a) => a.file_name).join(', ')}` : '');
    const metric = { turn: state.transcript.filter((t) => t.role === 'user').length, router: 'no', material: 0, index: 0, board: 0, system: 0, history: 0, retry: false };

    // ---- decidir qué hacer con el mensaje
    let route = null;
    if (version === 'despues' && routeCandidate(turn.text)) {
      route = routeByRules({ prompt: turn.text, board: state.board, hasFiles: convFiles.length > 0, attached: attached.length });
      metric.router = 'reglas';
      if (!route.confident) {
        const messages = routerMessages({ prompt: turn.text, recent: state.stored.slice(-3), board: state.board, index: fileIndex(convFiles) });
        const data = await groq({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, max_tokens: 200, reasoning_effort: 'none', schema: ROUTER_SCHEMA.schema });
        let raw = {};
        try { raw = JSON.parse(data.content || '{}'); } catch { raw = {}; }
        route = normalizeRoute(raw, { hasFiles: convFiles.length > 0, attached: attached.length, prompt: turn.text });
        metric.router = `IA (${tokOf(messages)} tok)`;
      }
      state.board = updateBoard(state.board, { prompt: turn.text, files: convFiles, route });
    }
    const card = (type, title, files) => {
      const text = `[Tarjeta Dreams · ${type}: «${title}»] (archivos: ${files.map((f) => f.file_name).join(', ') || 'ninguno'})`;
      state.stored.push({ role: 'user', content: turn.text }, { role: 'assistant', content: text });
      say('assistant', text);
      if (version === 'despues') state.board = updateBoard(state.board, { prompt: turn.text, delivered: { type, title } });
    };
    const pick = (r) => (attached.length ? attached : pickFiles(convFiles, `${turn.text} ${r?.topic ?? ''}`));
    if (version === 'despues' && route?.ask) {
      state.stored.push({ role: 'user', content: turn.text }, { role: 'assistant', content: route.ask });
      say('assistant', route.ask, 'pregunta del router');
    } else if (version === 'despues' && route?.intent === 'dreams_game') {
      const files = pick(route); card(route.kind === 'classify' ? 'juego (clasificar)' : 'juego (emparejar)', route.topic || 'tus apuntes', files);
    } else if (version === 'despues' && route?.intent === 'dreams_scheme') {
      card('esquema', route.topic || 'tus apuntes', pick(route));
    } else if (version === 'despues' && route?.intent === 'test') {
      card('test', route.topic || 'tus apuntes', pick(route));
    } else if (version === 'antes' && attached.length && wantsGame(turn.text)) {
      card(gameKindFor(turn.text) === 'classify' ? 'juego (clasificar)' : 'juego (emparejar)', 'tus apuntes', attached);
    } else if (version === 'antes' && attached.length && wantsScheme(turn.text)) {
      card('esquema', 'tus apuntes', attached);
    } else if (version === 'antes' && (wantsGame(turn.text) || wantsScheme(turn.text))) {
      const text = 'Para prepararte un juego fiable necesito tus apuntes: adjunta una foto de la página, el PDF o el documento con el botón del clip y vuelve a pedírmelo.';
      say('assistant', text, 'mensaje local del navegador (no se guarda)');
    } else {
      // ---- chat normal, como index.ts
      const material = version === 'antes' ? attached
        : attached.length ? attached : convFiles.length && needsMaterial(turn.text) ? pickFiles(convFiles, turn.text) : [];
      const filesIndex = version === 'despues' ? fileIndex(convFiles) : '';
      const board = version === 'despues' ? boardText(state.board) : '';
      const stored = state.stored.slice(-(mode.history.maxMessages + 8));
      const recent = stored.slice(-mode.history.maxMessages);
      const prior = compactHistory(recent, mode.history);
      const earlier = olderSummary(stored.slice(0, -mode.history.maxMessages));
      const system = chatSystemMessages(mode.id, {
        skillPrompt: educationalSkillPrompt(selectEducationalSkills(turn.text, prior, true), 'ESO'),
        attachmentFiles: material, attachmentChars: mode.attachmentChars, filesIndex, board,
      });
      if (earlier) system.push({ role: 'system', content: earlier });
      const messages = [...system, ...prior, { role: 'user', content: turn.text }];
      const params = { model: mode.model, temperature: mode.temperature, max_tokens: outputTokensFor(mode, turn.text), reasoning_effort: mode.reasoningEffort ?? undefined };
      let answer = (await groq({ ...params, messages })).content || '';
      metric.material = material.length; metric.index = tok(filesIndex); metric.board = tok(board);
      metric.system = tokOf(system); metric.history = tokOf(prior);
      if (version === 'despues' && convFiles.length && asksToReupload(answer)) {
        metric.retry = true;
        const retryFiles = material.length ? material : pickFiles(convFiles, turn.text);
        const retrySystem = chatSystemMessages(mode.id, { attachmentFiles: retryFiles, attachmentChars: mode.attachmentChars, filesIndex, board });
        const retry = (await groq({ ...params, messages: [...retrySystem, ...prior, { role: 'user', content: turn.text }, { role: 'assistant', content: answer }, { role: 'system', content: REUPLOAD_NOTE }] })).content || '';
        answer = retry.trim() && !asksToReupload(retry) ? retry : 'Tengo tus archivos de esta conversación. Dime qué parte quieres que miremos y seguimos con ella.';
      }
      state.stored.push({ role: 'user', content: turn.text }, { role: 'assistant', content: answer });
      say('assistant', answer, metric.retry ? 'rehecha: pedía volver a subir el archivo' : '');
      if (version === 'despues') state.board = updateBoard(state.board, { prompt: turn.text, files: convFiles });
    }
    state.metrics.push(metric);
  }
  const assistant = state.transcript.filter((t) => t.role === 'assistant');
  const reupload = convHasFiles(state) && assistant.some((t, i) => {
    const filesBefore = filesUpTo(conv, i);
    return filesBefore && (asksToReupload(t.content) || /necesito tus apuntes/.test(t.content));
  });
  const check = conv.check({ transcript: state.transcript, assistant, board: state.board });
  return { ok: check.ok && !reupload, why: reupload ? 'pide volver a subir un archivo que ya estaba' : check.why, transcript: state.transcript, metrics: state.metrics };
}
const convHasFiles = (state) => state.files.length > 0;
/** ¿Había archivos subidos al llegar la respuesta número i? (una respuesta por turno) */
const filesUpTo = (conv, answerIndex) => conv.turns.slice(0, answerIndex + 1).some((t) => t.files?.length);

const lines = [`# Banco de la memoria del chat — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, ''];
const summary = [];
for (const conv of CONVERSATIONS) {
  for (const version of WHICH === 'todo' ? ['antes', 'despues'] : [WHICH]) {
    if (version === 'antes' && !conv.before) continue;
    process.stderr.write(`${conv.id} (${version})…\n`);
    const r = await run(conv, version);
    summary.push({ id: conv.id, title: conv.title, version, ok: r.ok, why: r.why });
    lines.push(`## ${conv.id} · ${conv.title} — ${version} — ${r.ok ? 'BIEN' : `MAL (${r.why})`}`, '');
    for (const t of r.transcript) {
      const body = String(t.content).replace(/\n{3,}/g, '\n\n').trim();
      lines.push(`**${t.role === 'user' ? 'Alumno' : 'Dream'}**${t.extra ? ` _(${t.extra})_` : ''}:`, '', body.split('\n').map((l) => `> ${l}`).join('\n'), '');
    }
    lines.push('| Turno | Router | Archivos como material | Índice (tok) | Pizarra (tok) | Sistema (tok) | Historial (tok) | Rehecha |', '|---|---|---|---|---|---|---|---|');
    for (const m of r.metrics) lines.push(`| ${m.turn} | ${m.router} | ${m.material} | ${m.index} | ${m.board} | ${m.system} | ${m.history} | ${m.retry ? 'sí' : 'no'} |`);
    lines.push('');
  }
}
const after = summary.filter((s) => s.version === 'despues');
const head = [
  `**Después: ${after.filter((s) => s.ok).length} de ${after.length} conversaciones bien.** Antes: ${summary.filter((s) => s.version === 'antes' && s.ok).length} de ${summary.filter((s) => s.version === 'antes').length}.`, '',
  '| Conversación | Versión | Resultado |', '|---|---|---|',
  ...summary.map((s) => `| ${s.id} · ${s.title} | ${s.version} | ${s.ok ? 'bien' : `mal: ${s.why}`} |`), '',
];
lines.splice(2, 0, ...head);
writeFileSync(OUT, lines.join('\n'));
console.log(head.join('\n'));
