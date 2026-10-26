// Cinco conversaciones de prueba (sintéticas, sin datos reales) montadas como
// las monta dream-api, separadas por partes, para medir de qué se compone cada
// mensaje y cuánto carga al límite del alumno. Lo usa medir-tokens.py.
import { chatSystemMessages } from '../../supabase/functions/dream-api/prompts.mjs';
import { compactHistory } from '../../supabase/functions/dream-api/capacity.mjs';
import { MODES } from '../../supabase/functions/dream-api/models.mjs';
import { studentInputTokens } from '../../supabase/functions/dream-api/usage-window.mjs';

const personal = '- Cuando te dirijas al alumno por su nombre, escribe exactamente {{APODO}} (Dream lo cambia por el nombre que eligió). No lo uses en cada frase.';
const turn = (q, a) => [{ role: 'user', content: q }, { role: 'assistant', content: a }];
const answer = 'Vale. Fíjate en el primer paso: si derivas x², bajas el exponente y le restas uno, así que te queda 2x. Ahora haz lo mismo con x³: ¿qué te sale? Piensa primero qué número baja delante y qué exponente queda arriba, y luego compruébalo con un valor concreto, por ejemplo x = 2.';
const notes = ('Tema 4. La Guerra Civil española (1936-1939). Causas internas: la polarización política, la reforma agraria, la cuestión religiosa y militar. Causas internacionales: el contexto de los fascismos y la política de no intervención. ').repeat(36);
const make = (name, history, prompt, extra = {}) => {
  const mode = MODES.normal;
  const prior = compactHistory(history.slice(-mode.history.maxMessages), mode.history);
  const system = chatSystemMessages('normal', { personal, search: true, ...extra });
  const body = { messages: [...system, ...prior, { role: 'user', content: prompt }], max_tokens: mode.maxOutputTokens };
  const material = system.filter((m) => m.content.startsWith('Contexto de archivos adjuntos')).map((m) => m.content).join('\n');
  const fixed = system.filter((m) => !m.content.startsWith('Contexto de archivos adjuntos')).map((m) => m.content).join('\n');
  return { name, system: fixed, material, history: prior.map((m) => m.content).join('\n'), prompt, student_input_estimate: studentInputTokens(body) };
};
let long = [];
for (let i = 0; i < 7; i++) long = long.concat(turn(`vale y ahora el ejercicio ${i + 3}, la derivada de x^${i + 3}`, answer));
export const CONVERSATIONS = [
  make('1. Saludo, chat nuevo', [], 'hola'),
  make('2. Duda de mates, 3 turnos', [...turn('no entiendo las derivadas', answer), ...turn('3x²', answer)], 'y la de x^4?'),
  make('3. Chat largo (14 mensajes)', long, 'vale, ¿y si es una raíz?'),
  make('4. Con apuntes adjuntos (≈8.000 caracteres)', turn('te paso mis apuntes', answer), 'explícame las causas internacionales', { attachmentFiles: [{ file_name: 'tema4.pdf', extracted_text: notes }] }),
  make('5. Pregunta corta tras 2 turnos', turn('qué es un sujeto', answer), 'ok'),
];
console.log(JSON.stringify(CONVERSATIONS));
