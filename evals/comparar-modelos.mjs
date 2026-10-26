#!/usr/bin/env node
// Banco de pruebas (Bloque 9): ejecuta los mismos casos contra uno o varios
// modelos con el MISMO prompt que usa dream-api y aplica las comprobaciones
// automáticas de checks.mjs. No cambia nada en producción.
//
//   GROQ_API_KEY=… [TAVILY_API_KEY_1=…] node evals/comparar-modelos.mjs \
//     --models qwen/qwen3.8-27b,openai/gpt-oss-120b --files tono,tutor,no-inventar \
//     [--reasoning none|low|medium] [--no-forced-search] [--temperature 0.5] [--compact] [--out evals/resultados/x.json]
//
// Proveedores: groq (GROQ_API_KEY), cloudflare (CLOUDFLARE_ACCOUNT_ID +
// CLOUDFLAREAI_API_KEY, modelos «@cf/…»), openrouter (OPENROUTER_API_KEY,
// modelos «…:free»). Sin TAVILY_API_KEY_* la búsqueda «falla» y se mide cómo
// responde Dream cuando no puede comprobar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DREAM_SYSTEM_PROMPT, chatSystemMessages, searchAnswerMessages, searchPlannerMessages } from '../supabase/functions/dream-api/prompts.mjs';
import { DREAM_SYSTEM_PROMPT_COMPACT } from '../supabase/functions/dream-api/prompt-compact.mjs';
import { needsVerification, sanitizeSearchQuery, copiesStatement } from '../supabase/functions/dream-api/fact-check.mjs';
import { wantsWebSearch, webSearchTool, validateToolCall } from '../supabase/functions/dream-api/tools.mjs';
import { createTavilyManager } from '../supabase/functions/dream-api/tavily.mjs';
import { SEARCH_UNAVAILABLE_PROMPT } from '../supabase/functions/dream-api/limit-messages.mjs';
import { checkCase, expectationsFor, nicknameRate, wordCount } from './checks.mjs';
import { MEMORY_JSON_SCHEMA, extractionMessages, validateExtraction } from '../supabase/functions/dream-api/memory.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));
const models = String(args.models ?? 'qwen/qwen3.8-27b').split(',');
const files = String(args.files ?? 'tono,tutor,no-inventar').split(',');
const forced = !args['no-forced-search'];
const reasoning = args.reasoning && args.reasoning !== true ? String(args.reasoning) : null;
const temperature = args.temperature ? Number(args.temperature) : 0.5;
// --compact: el prompt compacto (prompt-compact.mjs) en lugar de DREAM_SYSTEM_PROMPT.
const compact = Boolean(args.compact);
// Perfil de prueba: el apodo nunca llega al modelo (va como {{APODO}}).
const PROFILE = { terms_version: 'x', nickname: 'Lucía', display_name: 'Lucía Pérez', interests: ['fútbol', 'música'] };
const personal = '- Cuando te dirijas al alumno por su nombre, escribe exactamente {{APODO}} (Dream lo cambia por el nombre que eligió). No lo uses en cada frase.';

function endpoint(model) {
  if (model.startsWith('@cf/')) return {
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`, key: process.env.CLOUDFLAREAI_API_KEY, tools: false };
  if (model.endsWith(':free')) return { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, tools: true };
  return { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY_1, tools: true };
}

function reasoningFor(model) {
  if (/^openai\/gpt-oss-/.test(model)) return { ...(reasoning ? { reasoning_effort: reasoning === 'none' ? 'low' : reasoning } : {}), include_reasoning: false };
  if (/^qwen\//.test(model)) return { reasoning_format: 'hidden', ...(reasoning ? { reasoning_effort: reasoning === 'none' ? 'none' : 'default' } : {}) };
  return {};
}

async function call(model, body) {
  const { url, key } = endpoint(model);
  if (!key) throw new Error(`falta la clave para ${model}`);
  const started = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature, max_tokens: 1200, ...reasoningFor(model), ...body }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') ?? 10))); continue; }
    const data = await res.json();
    if (!res.ok) throw new Error(`${model}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    return { message: data.choices?.[0]?.message ?? {}, usage: data.usage ?? {}, ms: Date.now() - started };
  }
  throw new Error(`${model}: límite de peticiones`);
}

const tavily = createTavilyManager({ getEnv: (n) => process.env[n], logger: { log() {} } });

/** Mismo camino que dream-api (index.ts): ¿busca?, planificador, consulta limpia, respuesta. */
async function runCase(model, testCase) {
  const history = testCase.messages.slice(0, -1);
  const prompt = testCase.messages.at(-1).content;
  const { tools } = endpoint(model);
  const asked = wantsWebSearch(prompt);
  const verify = forced && !asked && needsVerification(prompt);
  const planSearch = tools && (asked || verify);
  const usage = [];
  let searched = false, query = '', queryPasted = false, answer = '';
  if (planSearch) {
    const plan = await call(model, { messages: [...searchPlannerMessages(), ...history, { role: 'user', content: prompt }], tools: [webSearchTool], tool_choice: 'required', max_tokens: 600 });
    usage.push(plan.usage);
    const toolCall = plan.message.tool_calls?.[0];
    let result = SEARCH_UNAVAILABLE_PROMPT;
    if (toolCall) {
      const validated = validateToolCall(toolCall);
      queryPasted = copiesStatement(validated.query, prompt);
      query = sanitizeSearchQuery(validated.query, { prompt, profile: PROFILE });
      if (query && tavily.configured()) { try { result = await tavily.search(query); searched = true; } catch { /* sin búsqueda */ } }
    }
    const answerCall = await call(model, { messages: [...searchAnswerMessages({ personal }), ...history, { role: 'user', content: prompt },
      { role: 'assistant', content: null, tool_calls: [toolCall ?? { id: 'x', type: 'function', function: { name: 'web_search', arguments: '{"query":""}' } }] },
      { role: 'tool', tool_call_id: toolCall?.id ?? 'x', content: result }], max_tokens: 1000 });
    usage.push(answerCall.usage);
    answer = answerCall.message.content ?? '';
    searched = searched || Boolean(toolCall);
  } else {
    const system = chatSystemMessages('normal', { personal });
    if (compact) system[0] = { ...system[0], content: system[0].content.replace(DREAM_SYSTEM_PROMPT, DREAM_SYSTEM_PROMPT_COMPACT) };
    if (verify && !tools) system.push({ role: 'system', content: SEARCH_UNAVAILABLE_PROMPT });
    const res = await call(model, { messages: [...system, ...history, { role: 'user', content: prompt }] });
    usage.push(res.usage);
    answer = res.message.content ?? '';
  }
  return { answer: answer.replaceAll('{{APODO}}', PROFILE.nickname), searched, query, queryPasted, usage };
}

const missing = models.filter((m) => !endpoint(m).key);
if (missing.length) {
  console.error(`Faltan claves para: ${missing.join(', ')}. Ver evals/README.md.`);
  process.exit(2);
}

const report = { date: new Date().toISOString(), options: { forced, reasoning, temperature, compact }, models: {} };
for (const model of models) {
  const perCriterion = {};
  const failures = [];
  const answers = [];
  let tokens = 0, words = 0, n = 0;
  for (const name of files) {
    const file = JSON.parse(fs.readFileSync(path.join(here, `${name}.json`), 'utf8'));
    if (file.type === 'memory') {
      // Memoria: extractor real + filtro del servidor; se mira qué recuerdos quedan.
      for (const testCase of file.cases) {
        const messages = testCase.messages.flatMap((content) => [{ role: 'user', content }, { role: 'assistant', content: 'Vale.' }]);
        let out;
        try {
          const res = await call(model, { messages: extractionMessages(messages, []), response_format: { type: 'json_schema', json_schema: MEMORY_JSON_SCHEMA }, max_tokens: 1500 });
          out = validateExtraction(JSON.parse(res.message.content ?? '{}'));
        } catch (error) { failures.push({ id: `${name}/${testCase.id}`, error: String(error.message) }); continue; }
        const text = [out.summary, ...out.memories.map((m) => m.content)].join('\n');
        const result = {
          expected: testCase.expected.every((p) => out.memories.some((m) => new RegExp(p, 'i').test(m.content))),
          forbidden: !testCase.forbidden.some((p) => new RegExp(p, 'i').test(text)),
        };
        for (const [k, ok] of Object.entries(result)) { perCriterion[k] ??= { ok: 0, total: 0 }; perCriterion[k].total++; if (ok) perCriterion[k].ok++; }
        if (!result.expected || !result.forbidden) failures.push({ id: `${name}/${testCase.id}`, failed: Object.keys(result).filter((k) => !result[k]), memories: out.memories.map((m) => m.content) });
        n++;
      }
      continue;
    }
    for (const testCase of file.cases) {
      let run;
      try { run = await runCase(model, testCase); }
      catch (error) { failures.push({ id: `${name}/${testCase.id}`, error: String(error.message) }); continue; }
      const result = checkCase(expectationsFor(file, testCase), run, { unsure: file.unsure });
      for (const [k, ok] of Object.entries(result)) {
        perCriterion[k] ??= { ok: 0, total: 0 };
        perCriterion[k].total++; if (ok) perCriterion[k].ok++;
      }
      const failed = Object.entries(result).filter(([, ok]) => !ok).map(([k]) => k);
      if (failed.length) failures.push({ id: `${name}/${testCase.id}`, failed, answer: run.answer.slice(0, 600), query: run.query });
      answers.push(run.answer);
      tokens += run.usage.reduce((s, u) => s + (u.total_tokens ?? 0), 0);
      words += wordCount(run.answer); n++;
    }
  }
  const pct = Object.fromEntries(Object.entries(perCriterion).map(([k, v]) => [k, `${Math.round(100 * v.ok / v.total)} % (${v.ok}/${v.total})`]));
  report.models[model] = { cases: n, criteria: pct, nickname_rate: nicknameRate(answers, PROFILE.nickname), mean_words: n ? Math.round(words / n) : 0, mean_tokens: n ? Math.round(tokens / n) : 0, failures };
  console.log(`\n== ${model} ==`); console.table(pct);
  console.log(`palabras medias ${report.models[model].mean_words} · tokens por caso ${report.models[model].mean_tokens} · fallos ${failures.length}`);
}
const out = args.out && args.out !== true ? String(args.out) : path.join(here, 'resultados', `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nInforme: ${out}`);
