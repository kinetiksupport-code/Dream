#!/usr/bin/env node
// Bloque 0 de los esquemas (docs/ESQUEMAS.md): banco de pruebas OBLIGATORIO
// antes de construir la interfaz. Genera el JSON de 10 temas (a) desde
// apuntes de ejemplo y (b) solo con el tema y búsqueda, con el MISMO prompt,
// esquema y validador que usará dream-api. No toca producción.
//
//   GROQ_API_KEY=… [TAVILY_API_KEY_1=…] node scripts/esquemas/banco.mjs \
//     [--model qwen/qwen3.8-27b] [--modes apuntes,busqueda] [--topics al-andalus,celula]
//     [--example con|sin|ambos] [--reasoning none|low|default] [--strict] [--temperature 0.25]
//
// Salida: evals/esquemas/resultados/<fecha>/ con un JSON por esquema y
// resumen.json. Las capturas salen después con scripts/esquemas/capturas.mjs.
// Nunca imprime claves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEME_JSON_SCHEMA, generateScheme } from '../../supabase/functions/dream-api/schemes.mjs';
import { schemeMessages } from '../../supabase/functions/dream-api/prompts.mjs';
import { createTavilyManager } from '../../supabase/functions/dream-api/tavily.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'supabase/functions/dream-api/scheme-example.json'), 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));

export const TOPICS = [
  { slug: 'al-andalus', request: 'Hazme un esquema de la evolución de al-Ándalus tras el final del califato', level: '2.º Bachillerato', query: 'evolución de al-Ándalus tras el califato taifas almorávides almohades nazarí' },
  { slug: 'revolucion-francesa', request: 'Esquema de la Revolución Francesa', level: '4.º ESO', query: 'Revolución Francesa etapas fechas causas consecuencias' },
  { slug: 'oraciones', request: 'Esquema de los tipos de oraciones compuestas', level: '4.º ESO', query: 'tipos de oraciones compuestas coordinadas subordinadas ejemplos' },
  { slug: 'fotosintesis', request: 'Esquema de la fotosíntesis', level: '3.º ESO', query: 'fotosíntesis fase luminosa fase oscura ciclo de Calvin ecuación' },
  { slug: 'ecuaciones-2-grado', request: 'Esquema de las ecuaciones de segundo grado', level: '3.º ESO', query: 'ecuaciones de segundo grado fórmula discriminante incompletas' },
  { slug: 'celula', request: 'Esquema de la célula', level: '1.º Bachillerato', query: 'célula procariota eucariota orgánulos funciones' },
  { slug: 'guerra-civil', request: 'Esquema de la Guerra Civil española', level: '2.º Bachillerato', query: 'Guerra Civil española 1936 1939 fases batallas consecuencias' },
  { slug: 'enlaces-quimicos', request: 'Esquema de los enlaces químicos', level: '1.º Bachillerato', query: 'enlace iónico covalente metálico propiedades' },
  { slug: 'kant', request: 'Esquema de la filosofía de Kant', level: '2.º Bachillerato', query: 'Kant filosofía crítica razón pura imperativo categórico' },
  { slug: 'ciclo-agua', request: 'Esquema del ciclo del agua', level: '1.º ESO', query: 'ciclo del agua evaporación condensación precipitación' },
];

const model = String(args.model ?? 'qwen/qwen3.8-27b');
const modes = String(args.modes ?? 'apuntes,busqueda').split(',');
const only = args.topics ? String(args.topics).split(',') : null;
const exampleModes = args.example === 'con' ? [true] : args.example === 'sin' ? [false] : [true, false];
const temperature = args.temperature ? Number(args.temperature) : 0.25;
const reasoning = args.reasoning && args.reasoning !== true ? String(args.reasoning) : 'none';
const key = process.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY_1;
// Modo remoto: una función temporal de Supabase que usa las claves del
// proyecto sin exponerlas (BANCO_URL y BANCO_TOKEN). Mismo modelo y formato.
const remote = process.env.BANCO_URL && process.env.BANCO_TOKEN ? { url: process.env.BANCO_URL, token: process.env.BANCO_TOKEN } : null;
async function viaRemote(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(remote.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-banco-token': remote.token }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { await new Promise((r) => setTimeout(r, 30000)); continue; }
    if (!res.ok) throw new Error(`remoto ${res.status}: ${data.error ?? ''} ${String(data.message ?? '').slice(0, 200)}`);
    return data;
  }
  throw new Error('remoto: Groq sin cupo tras 4 intentos');
}
const tavily = createTavilyManager({ getEnv: (n) => process.env[n], logger: { log() {} } });

// Palabras que siempre llevan tilde (su forma sin tilde no existe en
// español): si aparece sin ella, cuenta como falta. No incluye pares válidos
// como esta/está, practica/práctica o periodo/período.
const ACCENTED = ['también', 'después', 'según', 'además', 'célula', 'fórmula', 'ecuación', 'revolución', 'época', 'química', 'energía', 'razón', 'función', 'oración', 'teoría', 'política', 'económica', 'filosofía', 'fotosíntesis', 'histórico'];
const strip = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Solo los textos del esquema, nunca los nombres de los campos (p. ej. «formula»).
const valuesOf = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(valuesOf) : v && typeof v === 'object' ? Object.values(v).flatMap(valuesOf) : []);
export function accentErrors(value) {
  const text = typeof value === 'string' ? value : valuesOf(value).join(' ');
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const wrong = new Set(ACCENTED.map(strip).filter((w, i) => w !== ACCENTED[i]));
  return words.filter((w) => wrong.has(w)).length;
}

async function groq(messages, usage) {
  if (remote) {
    const data = await viaRemote({ action: 'groq', messages });
    usage.input += data.usage?.prompt_tokens ?? 0;
    usage.output += data.usage?.completion_tokens ?? 0;
    usage.ms += data.ms ?? 0;
    usage.remaining = data.remaining;
    // Respeta el límite por minuto de la clave (~8.000 tokens/min).
    await new Promise((r) => setTimeout(r, Number(process.env.BANCO_PAUSE_MS ?? 20000)));
    return JSON.parse(data.content);
  }
  const started = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, messages, temperature, stream: false, max_completion_tokens: 3000,
        ...(/^qwen\//.test(model) ? { reasoning_format: 'hidden', reasoning_effort: reasoning === 'none' ? 'none' : 'default' } : {}),
        ...(/^openai\/gpt-oss-/.test(model) ? { reasoning_effort: reasoning === 'none' ? 'low' : reasoning, include_reasoning: false } : {}),
        response_format: { type: 'json_schema', json_schema: { name: 'esquema', strict: Boolean(args.strict), schema: SCHEME_JSON_SCHEMA } },
      }),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, Math.min(60, Number(res.headers.get('retry-after')) || 10) * 1000)); continue; }
    const data = await res.json();
    if (!res.ok) throw new Error(`groq ${res.status}: ${String(data?.error?.message ?? '').slice(0, 200)}`);
    usage.input += data.usage?.prompt_tokens ?? 0;
    usage.output += data.usage?.completion_tokens ?? 0;
    usage.ms += Date.now() - started;
    return JSON.parse(data.choices?.[0]?.message?.content ?? '');
  }
  throw new Error('groq: cupo agotado tras 4 intentos');
}

async function sourcesFor(topic, mode) {
  if (mode === 'apuntes') {
    const file = path.join(root, 'evals/esquemas/apuntes', `${topic.slug}.md`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }
  let results;
  // Búsqueda en español, para estudiantes, con resultados más completos.
  if (remote) results = (await viaRemote({ action: 'search', query: `${topic.query} apuntes ${topic.level}`, max_results: 5, depth: 'advanced' })).results;
  else if (!tavily.configured()) return '';
  else results = JSON.parse(await tavily.search(topic.query));
  // Groq limita la entrada a ~7.000 tokens por minuto con esta clave: la
  // fuente no pasa de ~10.000 caracteres (repartidos entre los resultados).
  const per = Math.floor(10000 / Math.max(1, results.length));
  return results.map((r) => `[${r.title}] (${r.url})\n${String(r.content).slice(0, per)}`).join('\n\n');
}

async function main() {
  if (!key && !remote) { console.error('Falta GROQ_API_KEY (o GROQ_API_KEY_1). El banco necesita las claves reales.'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(root, 'evals/esquemas/resultados', stamp);
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const topic of TOPICS.filter((t) => !only || only.includes(t.slug))) {
    for (const mode of modes) {
      const sources = await sourcesFor(topic, mode);
      if (!sources) { rows.push({ topic: topic.slug, mode, skipped: mode === 'busqueda' ? 'sin TAVILY_API_KEY' : 'sin apuntes' }); continue; }
      for (const withExample of exampleModes) {
        const usage = { input: 0, output: 0, ms: 0 };
        const messages = schemeMessages({ request: topic.request, level: topic.level, sources, example: withExample ? example : null });
        let result;
        try { result = await generateScheme({ call: (m) => groq(m, usage), messages, sources }); }
        catch (error) { result = { ok: false, attempts: 0, errors: [String(error.message).slice(0, 200)] }; }
        const name = `${topic.slug}-${mode}-${withExample ? 'con' : 'sin'}-ejemplo`;
        if (result.scheme) fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(result.scheme, null, 2));
        fs.writeFileSync(path.join(out, `${name}.fuente.txt`), sources);
        const row = {
          name, topic: topic.slug, mode, example: withExample, ok: result.ok, firstTry: result.ok && result.attempts === 1,
          attempts: result.attempts, errors: result.ok ? [] : result.errors, dropped: result.dropped ?? 0, droppedTexts: result.droppedTexts ?? [],
          facts: result.checkedFacts ?? 0, factsWithQuote: result.foundFacts ?? 0,
          accentErrors: result.scheme ? accentErrors(result.scheme) : null,
          firstErrors: result.firstErrors ?? [], groqRemaining: usage.remaining ?? null,
          tokens: usage.input + usage.output, inputTokens: usage.input, outputTokens: usage.output, ms: usage.ms,
          // Se rellena a mano tras revisar cada esquema contra su fuente.
          manualWrongFacts: null,
        };
        rows.push(row);
        console.log(`${row.ok ? 'OK ' : 'MAL'} ${name}: intentos ${row.attempts}, quitados ${row.dropped}, citas ${row.factsWithQuote}/${row.facts}, tildes ${row.accentErrors}, ${row.tokens} tokens, ${row.ms} ms`);
      }
    }
  }
  const done = rows.filter((r) => !r.skipped);
  const summary = {
    model, temperature, reasoning, strict: Boolean(args.strict), date: stamp,
    runs: done.length,
    validFirstTry: done.filter((r) => r.firstTry).length,
    valid: done.filter((r) => r.ok).length,
    quotesFoundPct: Math.round(100 * done.reduce((s, r) => s + r.factsWithQuote, 0) / Math.max(1, done.reduce((s, r) => s + r.facts + r.dropped, 0))),
    accentErrors: done.reduce((s, r) => s + (r.accentErrors ?? 0), 0),
    avgTokens: Math.round(done.reduce((s, r) => s + r.tokens, 0) / Math.max(1, done.length)),
    rows,
  };
  fs.writeFileSync(path.join(out, 'resumen.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.valid}/${summary.runs} válidos (${summary.validFirstTry} a la primera), citas encontradas ${summary.quotesFoundPct} %, ${summary.avgTokens} tokens de media.\nResultados en ${path.relative(root, out)}. Ahora: node scripts/esquemas/capturas.mjs ${path.relative(root, out)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
