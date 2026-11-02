// Prueba de humo y evals de las lecciones (prompt de la ruta, Bloque 9) con la
// IA REAL. No se ejecuta en CI: hace falta una clave de Groq.
//
//   GROQ_API_KEY=… node scripts/ia/leccion-humo.mjs [--temas 10]
//
// Para cada tema de ESO y Bachillerato genera una lección con la misma
// instrucción y los mismos límites que dream-api, y mide:
// - % de lecciones válidas a la primera (validateLesson);
// - % de preguntas tipo test y V/F cuya respuesta aparece en la lectura
//   (aproximación de «se contestan con la lectura»);
// - % de tarjetas que NO resuelven un ejercicio;
// - tokens de entrada y salida reales (usage de Groq) frente al Bloque 7
//   (≤ 4.000 de entrada y ≤ 3.500 de salida).
// Nunca envía datos de alumnos: los temas son de ejemplo y sin apuntes.
import { DEFAULT_GROQ_MODEL } from "../../supabase/functions/dream-api/admission.mjs";
import { LESSON_MAX_TOKENS, cardResolvesExercise, lessonContext, lessonSystem, validateLesson } from "../../supabase/functions/dream-api/lesson.mjs";

const TOPICS = [
  ["La fotosíntesis", "Biología", "2.º ESO"],
  ["Ecuaciones de primer grado", "Matemáticas", "2.º ESO"],
  ["El Imperio bizantino", "Historia", "2.º ESO"],
  ["El sintagma nominal", "Lengua", "3.º ESO"],
  ["Las leyes de Newton", "Física y Química", "4.º ESO"],
  ["La Revolución francesa", "Historia", "4.º ESO"],
  ["Derivadas: definición e interpretación", "Matemáticas", "1.º Bachillerato"],
  ["El enlace químico", "Química", "1.º Bachillerato"],
  ["El Romanticismo en España", "Lengua y Literatura", "1.º Bachillerato"],
  ["La Guerra Civil española", "Historia de España", "2.º Bachillerato"],
];
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("Falta GROQ_API_KEY. Este script usa la IA real; no se ejecuta sin clave.");
  process.exit(2);
}
const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
const n = Number(process.argv[process.argv.indexOf("--temas") + 1]) || TOPICS.length;
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const out = [];
for (const [topic, subject, course] of TOPICS.slice(0, n)) {
  const system = lessonSystem();
  const context = lessonContext({ topic, subject, course, summary: `Entender ${topic.toLowerCase()}`, difficulty: "medio" });
  const started = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.25, max_tokens: LESSON_MAX_TOKENS, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: context }] }),
  });
  const data = await res.json().catch(() => null);
  const ms = Date.now() - started;
  let raw = null;
  try {
    raw = JSON.parse(data?.choices?.[0]?.message?.content ?? "");
  } catch {}
  const v = validateLesson(raw);
  const row = { topic, ok: v.ok, reason: v.ok ? "" : v.reason, ms, tokens_in: data?.usage?.prompt_tokens ?? null, tokens_out: data?.usage?.completion_tokens ?? null };
  if (v.ok) {
    const text = fold(v.value.reading.sections.map((s) => `${s.title} ${s.body_markdown}`).join(" "));
    const closed = v.value.quiz.filter((q) => q.type === "mcq");
    row.answerable = closed.length ? closed.filter((q) => text.includes(fold(q.answer))).length / closed.length : null;
    const rawCards = Array.isArray(raw.cards) ? raw.cards.length : 0;
    row.cards_clean = rawCards ? rawCards - (raw.cards.filter((c) => cardResolvesExercise(c?.back) || cardResolvesExercise(c?.front)).length) : 0;
    row.cards_total = rawCards;
  }
  out.push(row);
  console.log(JSON.stringify(row));
}
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "—");
const ok = out.filter((r) => r.ok);
const ans = ok.filter((r) => r.answerable !== null);
console.log("\nResumen");
console.log(`Válidas a la primera: ${pct(ok.length, out.length)} (${ok.length}/${out.length})`);
console.log(`Tipo test con la respuesta en la lectura: ${pct(ans.reduce((a, r) => a + r.answerable, 0), ans.length)}`);
console.log(`Tarjetas que no resuelven ejercicios: ${pct(ok.reduce((a, r) => a + r.cards_clean, 0), ok.reduce((a, r) => a + r.cards_total, 0))}`);
const avg = (k) => Math.round(out.reduce((a, r) => a + (r[k] ?? 0), 0) / Math.max(1, out.filter((r) => r[k] !== null).length));
console.log(`Tokens medios: entrada ${avg("tokens_in")} (≤ 4.000), salida ${avg("tokens_out")} (≤ 3.500). Tiempo medio ${avg("ms")} ms.`);
