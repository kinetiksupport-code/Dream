// Conjunto de pruebas de la actividad de sintagmas (prompt «sintagmas» §2b).
// Mide cuántas de las frases de evals/sintagmas.json analiza la IA igual que
// el análisis hecho a mano. No es infalible: las frases «doubtful» las revisa
// Carlos o un profesor, y una frase con "confidence":"baja" cuenta como no
// mostrada (la actividad no la enseñaría).
//
// Uso: GROQ_API_KEY=… node scripts/eval-sintagmas.mjs [--model id] [--limit n]
// La clave se lee del entorno y nunca se imprime.
import { readFileSync } from 'node:fs';
import { acceptSentence, flatten } from '../supabase/functions/dream-api/sintagmas.mjs';
import { syntaxAnalyzeMessages } from '../supabase/functions/dream-api/prompts.mjs';
import { GROQ_NORMAL_MODEL } from '../supabase/functions/dream-api/models.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const key = process.env.GROQ_API_KEY;
if (!key) { console.error('Falta GROQ_API_KEY en el entorno.'); process.exit(2); }
const model = option('--model', process.env.GROQ_MODEL || GROQ_NORMAL_MODEL);
const limit = Number(option('--limit', 1000));
const pause = Number(option('--pause-ms', 8000)); // ~8.000 tokens por minuto
const { sentences } = JSON.parse(readFileSync(new URL('../evals/sintagmas.json', import.meta.url), 'utf8'));

const key4 = (nodes) => flatten(nodes).map((n) => `${n.label}:${n.start}-${n.end}`).sort().join('|');
const results = { same: 0, different: 0, hidden: 0, invalid: 0, error: 0 };
const misses = [];
for (const item of sentences.slice(0, limit)) {
  const official = acceptSentence({ text: item.text, analysis: item.analysis });
  let outcome;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 1200, response_format: { type: 'json_object' }, messages: syntaxAnalyzeMessages(item.text) }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const raw = JSON.parse(data.choices[0].message.content);
    if (raw.confidence && raw.confidence !== 'alta') outcome = 'hidden';
    else {
      const got = acceptSentence({ text: item.text, analysis: raw.analysis });
      outcome = !got ? 'invalid' : key4(got.analysis) === key4(official.analysis) ? 'same' : 'different';
    }
  } catch (error) {
    outcome = 'error';
    console.error(`#${item.id}: ${error instanceof Error ? error.message : 'error'}`);
  }
  results[outcome]++;
  if (outcome !== 'same') misses.push({ id: item.id, text: item.text, outcome, doubtful: Boolean(item.doubtful) });
  process.stdout.write(outcome === 'same' ? '.' : outcome[0]);
  await new Promise((r) => setTimeout(r, pause));
}
const total = Object.values(results).reduce((a, b) => a + b, 0);
const shown = results.same + results.different;
console.log(`\nModelo: ${model}`);
console.log(`Iguales al análisis a mano: ${results.same}/${total} (${Math.round((results.same / Math.max(1, total)) * 100)} %)`);
console.log(`De las que mostraría: ${results.same}/${shown} (${Math.round((results.same / Math.max(1, shown)) * 100)} %)`);
console.log(`Distintas: ${results.different} · Rechazadas por las reglas: ${results.invalid} · No seguras (ocultas): ${results.hidden} · Errores: ${results.error}`);
for (const miss of misses) console.log(`- #${miss.id} ${miss.outcome}${miss.doubtful ? ' (dudosa)' : ''}: ${miss.text}`);
