// Banco del router con IA (docs/MEMORIA-CHAT.md, Bloque 3): solo los casos en
// los que las reglas no bastan. Usa routerMessages/normalizeRoute reales y Groq
// a través de la misma función temporal que banco.mjs.
//
//   BANCO_URL=… BANCO_TOKEN=… npx tsx scripts/memoria/router.mjs [salida.md]
import { writeFileSync } from 'node:fs';
import {
  ROUTER_SCHEMA, asksToReupload, conversationFiles, emptyBoard, fileIndex, normalizeRoute, routeByRules, routerMessages, updateBoard,
} from '../../supabase/functions/dream-api/conversation-memory.mjs';
import { CELULA, SINTAGMAS } from './conversaciones.mjs';

const URL_ = process.env.BANCO_URL;
const TOKEN = process.env.BANCO_TOKEN;
if (!URL_ || !TOKEN) { console.error('Faltan BANCO_URL y BANCO_TOKEN.'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const files = (list) => conversationFiles(list.map((f, i) => ({ id: `f${i}`, file_name: f.name, extracted_text: f.text, created_at: `2026-10-27T10:0${i}:00Z` })));
const delivered = (type, title) => updateBoard(emptyBoard(), { prompt: 'x', delivered: { type, title } });

const CASES = [
  { id: 'R1', prompt: 'sí, hazlo con eso', files: [SINTAGMAS],
    recent: [{ role: 'user', content: '¿me puedes resumir esto en algo visual?' }, { role: 'assistant', content: 'Claro. ¿Te preparo un esquema visual de los tipos de sintagma?' }],
    expect: (r) => r.intent === 'dreams_scheme' },
  { id: 'R2', prompt: 'lo mismo pero para practicar', files: [SINTAGMAS], board: delivered('esquema', 'Los sintagmas'),
    recent: [{ role: 'user', content: 'hazme un esquema' }, { role: 'assistant', content: 'He preparado tu esquema de **Los sintagmas**.' }],
    expect: (r) => r.intent === 'dreams_game' || r.intent === 'test' },
  { id: 'R3', prompt: 'hazlo otra vez con el otro archivo', files: [SINTAGMAS, CELULA], board: delivered('juego', 'Tipos de sintagma'),
    recent: [{ role: 'user', content: 'hazme un juego de los sintagmas' }, { role: 'assistant', content: 'He preparado un juego para practicar **Tipos de sintagma**.' }],
    expect: (r) => r.intent === 'dreams_game' },
  { id: 'R4', prompt: 'explícame eso mejor', files: [CELULA],
    recent: [{ role: 'user', content: '¿qué hacen las mitocondrias?' }, { role: 'assistant', content: 'Producen la energía de la célula mediante la respiración celular.' }],
    expect: (r) => r.intent === 'chat' && !r.ask },
  { id: 'R5', prompt: 'eso', files: [], recent: [],
    expect: (r) => r.intent === 'chat' },
  { id: 'R6', prompt: 'hazme eso', files: [CELULA],
    recent: [{ role: 'user', content: 'ya me lo he leído' }, { role: 'assistant', content: '¡Bien! ¿Quieres que te haga un test de 5 preguntas para comprobarlo?' }],
    expect: (r) => r.intent === 'test' },
  { id: 'R7', prompt: 'dale', files: [CELULA],
    recent: [{ role: 'user', content: 'me cuesta acordarme de los orgánulos' }, { role: 'assistant', content: '¿Te preparo un juego de emparejar cada orgánulo con lo que hace?' }],
    expect: (r) => r.intent === 'dreams_game' && r.kind === 'match' },
  { id: 'R8', prompt: '¿y de la célula?', files: [SINTAGMAS, CELULA], board: delivered('esquema', 'Los sintagmas'),
    recent: [{ role: 'user', content: 'hazme un esquema de los sintagmas' }, { role: 'assistant', content: 'He preparado tu esquema de **Los sintagmas**.' }],
    expect: (r) => r.intent === 'dreams_scheme' },
  { id: 'R9', prompt: 'ok', files: [CELULA],
    recent: [{ role: 'user', content: 'gracias por la explicación' }, { role: 'assistant', content: 'De nada. Cuando quieras seguimos.' }],
    expect: (r) => r.intent === 'chat' && !r.ask },
  { id: 'R10', prompt: 'hazlo con los apuntes de antes', files: [SINTAGMAS],
    recent: [{ role: 'user', content: 'quiero practicar los sintagmas clasificándolos' }, { role: 'assistant', content: 'Perfecto, ¿lo hacemos con tus apuntes?' }],
    expect: (r) => r.intent === 'dreams_game' && r.kind === 'classify' },
];

const out = ['# Banco del router con IA', '', '| Caso | Petición | Reglas | Router con IA | Resultado |', '|---|---|---|---|---|'];
let good = 0;
for (const c of CASES) {
  const list = files(c.files);
  const board = c.board ?? emptyBoard();
  const rules = routeByRules({ prompt: c.prompt, board, hasFiles: list.length > 0 });
  let route = rules;
  let tokens = 0;
  if (!rules.confident) {
    const messages = routerMessages({ prompt: c.prompt, recent: c.recent, board, index: fileIndex(list) });
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-banco-token': TOKEN },
        body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, max_tokens: 200, reasoning_effort: 'none', schema: ROUTER_SCHEMA.schema }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { await sleep(Math.max(8, Number(data.retry_after) || 0) * 1000); continue; }
      let raw = {};
      try { raw = JSON.parse(data.content || '{}'); } catch { raw = {}; }
      tokens = data.usage?.prompt_tokens ?? 0;
      route = normalizeRoute(raw, { hasFiles: list.length > 0, prompt: c.prompt });
      break;
    }
  }
  const pass = !rules.confident && c.expect(route) && !(route.ask && list.length && asksToReupload(route.ask));
  if (pass) good++;
  const shown = `${route.intent}${route.kind ? ` (${route.kind})` : ''}${route.ask ? ` · pregunta: «${route.ask}»` : ''}`;
  out.push(`| ${c.id} | «${c.prompt}» | ${rules.confident ? `seguras: ${rules.intent}` : 'no bastan'} | ${shown} (${tokens} tok) | ${pass ? 'bien' : 'mal'} |`);
  process.stderr.write(`${c.id} ${pass ? 'bien' : 'MAL'} ${shown}\n`);
}
out.splice(2, 0, `**${good} de ${CASES.length} bien.**`, '');
writeFileSync(process.argv[2] || 'router.md', out.join('\n'));
console.log(out.join('\n'));
