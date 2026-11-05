#!/usr/bin/env node
// Bloque 0 de «Apuntes» (docs/APUNTES-LIMPIOS.md): banco de pruebas OBLIGATORIO
// antes de la interfaz. Pasa a limpio los 10 apuntes de evals/esquemas/apuntes
// y las fotos de apuntes a mano de evals/apuntes-limpios/fotos con el MISMO
// prompt, formato y validador que dream-api. No toca producción.
//
//   GROQ_API_KEY=… node scripts/apuntes/banco.mjs [--example con|sin|ambos] [--topics al-andalus,energias]
//   (o BANCO_URL=… BANCO_TOKEN=… con la función temporal de docs/apuntes-limpios/funcion-banco.ts.txt)
//
// Mide por apunte: JSON válido a la primera, intentos, viñetas quitadas por no
// tener cita, datos que no están en los apuntes (comprobación automática; la
// revisión a mano va en manualAddedFacts), cifras y nombres de los apuntes que
// se han perdido, faltas de tildes, tokens y tiempo. En las fotos, además,
// cuánto texto ha leído el OCR. Nunca imprime claves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTES_EXAMPLE, NOTES_JSON_SCHEMA, NOTES_MAX_TOKENS, factsIn, generateNotesPage, lostSentences, notesMessages, notesPages, notesTextFrom, numbersIn } from '../../supabase/functions/dream-api/clean-notes.mjs';
import { normalizeForQuote } from '../../supabase/functions/dream-api/schemes.mjs';
import { accentErrors } from '../esquemas/banco.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));
const exampleModes = args.example === 'con' ? [true] : args.example === 'ambos' ? [true, false] : [false];
const only = args.topics ? String(args.topics).split(',') : null;
const key = process.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY_1;
const remote = process.env.BANCO_URL && process.env.BANCO_TOKEN ? { url: process.env.BANCO_URL, token: process.env.BANCO_TOKEN } : null;
const pause = Number(process.env.BANCO_PAUSE_MS ?? 15000);
const ocrPrompt = fs.readFileSync(path.join(root, 'supabase/functions/dream-api/attachments.mjs'), 'utf8').match(/text: '(Analiza esta imagen[^']+)'/)[1];

async function viaRemote(body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(remote.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-banco-token': remote.token }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { await new Promise((r) => setTimeout(r, 30000)); continue; }
    if (!res.ok) throw new Error(`remoto ${res.status}: ${data.error ?? ''} ${String(data.message ?? '').slice(0, 200)}`);
    return data;
  }
  throw new Error('remoto: Groq sin cupo tras 5 intentos');
}

async function direct(payload) {
  const started = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(payload),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, Math.min(60, Number(res.headers.get('retry-after')) || 10) * 1000)); continue; }
    const data = await res.json();
    if (!res.ok) throw new Error(`groq ${res.status}: ${String(data?.error?.message ?? '').slice(0, 200)}`);
    return { content: data.choices?.[0]?.message?.content ?? '', usage: data.usage, ms: Date.now() - started };
  }
  throw new Error('groq: cupo agotado tras 4 intentos');
}

async function groq(messages, usage) {
  const data = remote
    ? await viaRemote({ action: 'groq', messages })
    : await direct({ model: 'qwen/qwen3.8-27b', messages, temperature: 0.2, stream: false, max_completion_tokens: NOTES_MAX_TOKENS, reasoning_format: 'hidden', reasoning_effort: 'none',
      response_format: { type: 'json_schema', json_schema: { name: 'apuntes', strict: false, schema: NOTES_JSON_SCHEMA } } });
  usage.input += data.usage?.prompt_tokens ?? 0;
  usage.output += data.usage?.completion_tokens ?? 0;
  usage.ms += data.ms ?? 0;
  usage.calls++;
  if (remote) await new Promise((r) => setTimeout(r, pause)); // ~8.000 tokens/min por clave
  return JSON.parse(data.content);
}

async function ocr(file, usage) {
  const image = fs.readFileSync(file).toString('base64');
  const data = remote
    ? await viaRemote({ action: 'vision', image })
    : await direct({ model: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b', stream: false, temperature: 0.2, max_completion_tokens: 1400,
      messages: [{ role: 'user', content: [{ type: 'text', text: ocrPrompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] }] });
  usage.ocrInput = data.usage?.prompt_tokens ?? 0;
  usage.ocrOutput = data.usage?.completion_tokens ?? 0;
  if (remote) await new Promise((r) => setTimeout(r, pause));
  return `Análisis visual y OCR\n${String(data.content).trim()}`;
}

/** Palabras de la transcripción real que ha leído el OCR (sin tildes). */
function ocrRecall(truth, read) {
  const words = normalizeForQuote(truth).split(' ').filter((w) => w.length >= 3);
  const got = new Set(normalizeForQuote(read).split(' '));
  return words.length ? Math.round((100 * words.filter((w) => got.has(w)).length) / words.length) : 100;
}

// Cada trozo como frase aparte: así la primera palabra no parece un nombre propio.
const textOf = (page) => page ? [
  ...page.sections.flatMap((s) => [s.heading, s.period, ...s.bullets.flatMap((b) => [b.term, b.text])]),
  ...page.flow.flatMap((f) => [f.label, f.period]), page.key_idea.text,
].filter(Boolean).join('. ') : '';

async function main() {
  if (!key && !remote) { console.error('Falta GROQ_API_KEY (o BANCO_URL y BANCO_TOKEN). El banco necesita las claves reales.'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(root, 'evals/apuntes-limpios/resultados', stamp);
  fs.mkdirSync(out, { recursive: true });
  const notesDir = path.join(root, 'evals/esquemas/apuntes');
  const photoDir = path.join(root, 'evals/apuntes-limpios/fotos');
  const cases = [
    ...fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')).map((f) => ({ slug: f.replace(/\.md$/, ''), kind: 'texto', file: path.join(notesDir, f) })),
    ...fs.readdirSync(photoDir).filter((f) => f.endsWith('.jpg')).map((f) => ({ slug: f.replace(/\.jpg$/, ''), kind: 'foto', file: path.join(photoDir, f), truth: path.join(photoDir, f.replace(/\.jpg$/, '.txt')) })),
  ].filter((c) => !only || only.includes(c.slug));
  const rows = [];
  for (const c of cases) {
    for (const withExample of exampleModes) {
      const usage = { input: 0, output: 0, ms: 0, calls: 0 };
      const name = `${c.slug}-${withExample ? 'con' : 'sin'}-ejemplo`;
      const row = { name, slug: c.slug, kind: c.kind, example: withExample };
      try {
        const raw = c.kind === 'foto' ? await ocr(c.file, usage) : fs.readFileSync(c.file, 'utf8');
        if (c.kind === 'foto') { row.ocrRecall = ocrRecall(fs.readFileSync(c.truth, 'utf8'), raw); fs.writeFileSync(path.join(out, `${name}.ocr.txt`), raw); }
        const source = notesTextFrom(raw);
        const { pages } = notesPages(source);
        const results = [];
        for (const [i, text] of pages.entries()) {
          results.push(await generateNotesPage({ call: (m) => groq(m, usage), messages: notesMessages({ text, page: i + 1, pages: pages.length, example: withExample ? NOTES_EXAMPLE : null }), source: text, first: i === 0 }));
        }
        const ok = results.every((r) => r.ok);
        const output = [results[0]?.title ?? '', ...results.map((r) => textOf(r.page))].join('. ');
        const sourceNorm = normalizeForQuote(source);
        const sourceFacts = new Set([...numbersIn(source), ...factsIn(source)]);
        // Datos de la salida que no están en los apuntes (debería ser 0: el validador los quita).
        const added = factsIn(output).filter((f) => !sourceFacts.has(f) && !` ${sourceNorm} `.includes(` ${f} `));
        // Cifras de los apuntes (de 2+ dígitos) que no salen: contenido perdido.
        const lost = [...new Set(numbersIn(source.replace(/^\s*\d+[.)]\s/gm, ' ')))].filter((n) => !numbersIn(output).includes(n));
        const lostIdeas = lostSentences(source, output);
        const namesLost = factsIn(source).filter((f) => !/^\d/.test(f) && !` ${normalizeForQuote(output)} `.includes(` ${f.split(' ')[0]}`));
        Object.assign(row, {
          ok, firstTry: ok && results.every((r) => r.attempts === 1), pages: pages.length, attempts: results.reduce((s, r) => s + r.attempts, 0),
          repaired: results.filter((r) => r.repaired).length, dropped: results.reduce((s, r) => s + (r.dropped ?? 0), 0),
          droppedWhy: results.flatMap((r) => r.droppedWhy ?? []), firstErrors: results.flatMap((r) => r.firstErrors ?? []).slice(0, 6),
          addedFactsAuto: added, lostNumbers: lost, lostIdeas, lostNames: namesLost.slice(0, 10), namesKeptPct: Math.round(100 * (1 - namesLost.length / Math.max(1, factsIn(source).filter((f) => !/^\d/.test(f)).length))),
          accentErrors: accentErrors(output), flow: results[0]?.page?.flow?.length ?? 0, keyIdea: Boolean(results[0]?.page?.key_idea?.text),
          doubts: results.reduce((s, r) => s + (r.page?.doubts?.length ?? 0), 0), unreadable: results.reduce((s, r) => s + (r.page?.unreadable?.length ?? 0), 0),
          tokens: usage.input + usage.output, tokensPerPage: Math.round((usage.input + usage.output) / Math.max(1, pages.length)), inputTokens: usage.input, outputTokens: usage.output,
          ocrTokens: (usage.ocrInput ?? 0) + (usage.ocrOutput ?? 0), calls: usage.calls, ms: usage.ms,
          manualAddedFacts: null, manualLostIdeas: null,
        });
        fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ title: results[0]?.title, pages: results.map((r) => r.page) }, null, 2));
      } catch (error) {
        Object.assign(row, { ok: false, error: String(error?.message ?? error).slice(0, 200) });
      }
      rows.push(row);
      console.log(`${row.ok ? 'OK ' : 'MAL'} ${name}: intentos ${row.attempts ?? '-'}, quitadas ${row.dropped ?? '-'}, añadidos ${row.addedFactsAuto?.length ?? '-'}, perdidos ${row.lostNumbers?.join(',') || 0}, ideas perdidas ${row.lostIdeas?.length ?? '-'}, nombres ${row.namesKeptPct ?? '-'} %, cajas ${row.flow ?? '-'}, ${row.tokensPerPage ?? '-'} tok/pág${row.ocrRecall != null ? `, OCR ${row.ocrRecall} %` : ''}${row.error ? ` · ${row.error}` : ''}`);
    }
  }
  const summary = {
    date: stamp, runs: rows.length, valid: rows.filter((r) => r.ok).length, validFirstTry: rows.filter((r) => r.firstTry).length,
    withAddedFactsAuto: rows.filter((r) => r.addedFactsAuto?.length).length, withLostNumbers: rows.filter((r) => r.lostNumbers?.length).length, withLostIdeas: rows.filter((r) => r.lostIdeas?.length).length,
    avgTokensPerPage: Math.round(rows.reduce((s, r) => s + (r.tokensPerPage ?? 0), 0) / Math.max(1, rows.length)),
    accentErrors: rows.reduce((s, r) => s + (r.accentErrors ?? 0), 0), rows,
  };
  fs.writeFileSync(path.join(out, 'resumen.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.valid}/${summary.runs} válidos (${summary.validFirstTry} a la primera); con datos añadidos (auto): ${summary.withAddedFactsAuto}; con cifras perdidas: ${summary.withLostNumbers}; ${summary.avgTokensPerPage} tokens/página.\nResultados en ${path.relative(root, out)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
