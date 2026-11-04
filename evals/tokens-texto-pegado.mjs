// Eval de ahorro de tokens (prompt «ahorrar tokens», punto 9).
// Un texto pegado de ~10.000 caracteres y 3 turnos de preguntas. Mide los
// tokens de CONTEXTO por turno (todo menos el prompt de sistema fijo: material,
// historial y mensaje) antes y después, con la misma estimación que
// groq-budget.mjs (3,5 caracteres por token). Comprueba también:
// - que la pregunta sobre el FINAL del texto lleva el final en el material;
// - que un archivo de 30 páginas (lo máximo que se extrae: 24.000 caracteres)
//   cabe en el límite de Groq por petición con el prompt de Normal (sin 413).
//
//   node evals/tokens-texto-pegado.mjs
import { compactHistory } from "../supabase/functions/dream-api/capacity.mjs";
import { condenseText, TURN_MATERIAL_CHARS } from "../supabase/functions/dream-api/long-text.mjs";
import { chatSystemMessages } from "../supabase/functions/dream-api/prompts.mjs";
import { GROQ_SAFE_LIMIT, estimateTokens, fitGroqBudget } from "../supabase/functions/dream-api/groq-budget.mjs";
import { MODES } from "../supabase/functions/dream-api/models.mjs";

const tok = (s) => Math.ceil(String(s).length / 3.5);
// compactHistory de antes (cortaba a lo bruto: el final del texto se perdía).
function oldCompact(messages, { recentFull = 4, olderChars = 400, totalChars = 9000, recentChars = 4000 } = {}) {
  const out = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const recent = messages.length - 1 - i < recentFull;
    const text = String(messages[i].content || "");
    const limit = recent ? recentChars : olderChars;
    const content = text.length > limit ? `${text.slice(0, limit)}…` : text;
    if (used + content.length > totalChars && out.length >= 2) break;
    used += content.length;
    out.unshift({ role: messages[i].role, content });
  }
  return out;
}

const SECTIONS = [
  ["La crisis de 1700", "Carlos II murió en 1700 sin descendencia y dejó el trono a Felipe de Anjou, nieto de Luis XIV de Francia. Las potencias europeas temían que Francia y España se unieran bajo una misma familia y que el equilibrio de Europa se rompiera."],
  ["Los dos candidatos", "Felipe de Anjou era el candidato de los Borbones y contaba con el apoyo de Castilla. El archiduque Carlos de Austria era el candidato de los Habsburgo y tenía el apoyo de Inglaterra, Holanda y, más tarde, de la Corona de Aragón."],
  ["Una guerra europea", "La guerra empezó en 1701 como un conflicto internacional. Se luchó en Flandes, en Italia y en el Rin, y la flota anglo-holandesa tomó Gibraltar en 1704, una plaza que ya nunca volvería a España."],
  ["Una guerra civil", "Dentro de la península la guerra fue también civil. Castilla apoyó a Felipe V, mientras que Valencia, Aragón y Cataluña apoyaron al archiduque porque temían perder sus fueros y sus instituciones propias."],
  ["Almansa", "En 1707 las tropas borbónicas ganaron la batalla de Almansa. Tras la victoria, Felipe V abolió los fueros de Aragón y de Valencia con los primeros Decretos de Nueva Planta."],
  ["El giro de 1711", "En 1711 murió el emperador José I y el archiduque Carlos heredó el trono del Imperio. Inglaterra ya no quería que un mismo rey gobernara España y Austria, así que empezó a negociar la paz."],
  ["El final: la Paz de Utrecht", "La guerra terminó con la Paz de Utrecht en 1713 y el Tratado de Rastatt en 1714. Felipe V fue reconocido rey a cambio de renunciar al trono de Francia; España perdió sus territorios europeos y entregó Gibraltar y Menorca a Gran Bretaña. Barcelona resistió hasta el 11 de septiembre de 1714."],
];
// ~10.000 caracteres: cada apartado con su desarrollo.
const pasted = SECTIONS.map(([title, body], i) =>
  `## ${title}\n\n${body}\n\n${Array.from({ length: 6 }, (_, k) => `Detalle ${k + 1} del apartado ${i + 1}: ${body.split(". ")[k % 2] ?? body}. Los historiadores lo explican con documentos de la época y cartas de los embajadores.`).join("\n\n")}`,
).join("\n\n");

const questions = [
  "¿Por qué empezó la guerra?",
  "¿Qué pasó en Almansa?",
  "¿Cómo termina el texto? ¿Qué tratado se firma al final?",
];
const answers = [
  "La guerra empezó porque Carlos II murió sin hijos en **1700** y había dos candidatos al trono. ¿Quién apoyaba a cada uno?",
  "En **1707** ganaron los Borbones y Felipe V abolió los fueros de Aragón y Valencia. ¿Sabes cómo se llamaron esos decretos?",
];

function contextTokens(material, history, prompt) {
  return tok(material) + history.reduce((n, m) => n + tok(m.content) + 4, 0) + tok(prompt);
}

const history = MODES.normal.history;
const report = [];
let endOk = false;
for (let t = 0; t < 3; t++) {
  const prompt = questions[t];
  const past = [];
  for (let k = 0; k < t; k++) past.push({ role: "user", content: k === 0 ? `${pasted}\n\n${questions[0]}` : questions[k] }, { role: "assistant", content: answers[k] });
  // ANTES (texto pegado dentro del mensaje, hasta 12.000 caracteres): el primer
  // turno lo manda entero y los siguientes lo cortan a 3.000 en el historial.
  const beforeInline = t === 0 ? contextTokens("", [], `${pasted}\n\n${prompt}`) : contextTokens("", oldCompact(past, history), prompt);
  // ANTES (como archivo, tope de 32.000): el texto entero en cada turno.
  const pastFile = past.map((m, i) => (i === 0 ? { ...m, content: questions[0] } : m));
  const beforeFile = contextTokens(pasted.slice(0, 32000), oldCompact(pastFile, history), prompt);
  // DESPUÉS: archivo .md, índice + resumen + trozos que encajan (≤ 6.000).
  const material = condenseText(pasted, prompt, TURN_MATERIAL_CHARS);
  const after = contextTokens(material, compactHistory(pastFile, { ...history, prompt }), prompt);
  if (t === 2) endOk = /Utrecht/.test(material) && /Rastatt/.test(material);
  // Antes, con el texto en el mensaje, ¿le llegaba a la IA el final del texto en este turno?
  const inlineSeen = t === 0 ? `${pasted}` : oldCompact(past, history).map((m) => m.content).join("\n");
  report.push({ turno: t + 1, antes_en_mensaje: beforeInline, final_visible_antes: /Rastatt/.test(inlineSeen) ? "sí" : "no", antes_archivo: beforeFile, despues: after, final_visible_despues: t === 2 ? (endOk ? "sí" : "no") : "—" });
}

// 30 páginas: lo máximo que se extrae de un archivo (MAX_EXTRACTED_CHARS = 24.000).
const big = Array.from({ length: 30 }, (_, i) => `## Página ${i + 1}\n\n${"Texto de apuntes con fechas, nombres y conceptos de la página. ".repeat(13)}`).join("\n\n").slice(0, 24000);
// Lo que hace dream-api antes de llamar a Groq: fitGroqBudget recorta historial,
// material y salida para no pasar del límite por petición (si no cabe, 413).
const request = (chars) => {
  const system = chatSystemMessages("normal", { attachmentFiles: [{ file_name: "apuntes.pdf", extracted_text: chars === null ? big : condenseText(big, "explícame la página 12", chars) }], attachmentChars: chars ?? 32000 });
  const sent = estimateTokens([...system, { role: "user", content: "explícame la página 12" }]) + MODES.normal.chatOutputTokens;
  const fitted = fitGroqBudget({ system, history: [], tail: [{ role: "user", content: "explícame la página 12" }], maxTokens: MODES.normal.chatOutputTokens });
  return { sent, fits: fitted.fits, cut: fitted.trimmed.materialChars };
};
const before30 = request(null);
const after30 = request(TURN_MATERIAL_CHARS);

console.log(`Texto pegado: ${pasted.length.toLocaleString("es-ES")} caracteres\n`);
console.log("Tokens de contexto por turno (sin el prompt de sistema):");
console.table(report);
const avg = (k) => Math.round(report.reduce((n, r) => n + r[k], 0) / report.length);
console.log(`Media: antes ${avg("antes_archivo")} (archivo) / ${avg("antes_en_mensaje")} (en el mensaje) → después ${avg("despues")}`);
console.log(`Objetivo < 3.000 por turno: ${report.every((r) => r.despues < 3000) ? "sí" : "NO"}`);
console.log(`Pregunta sobre el final del texto: el material lleva el final (Utrecht y Rastatt): ${endOk ? "sí" : "NO"}`);
console.log(`Archivo de 30 páginas (24.000 caracteres), petición a Groq con el prompt de Normal (límite seguro ${GROQ_SAFE_LIMIT}):`);
console.log(`  antes: ${before30.sent} tokens; había que recortar ${before30.cut.toLocaleString("es-ES")} caracteres de apuntes a ciegas (por el final)${before30.fits ? "" : " y aun así no cabía → 413"}`);
console.log(`  después: ${after30.sent} tokens; recorte ${after30.cut.toLocaleString("es-ES")} caracteres; ${after30.fits ? "cabe, sin 413" : "NO cabe"}`);
process.exitCode = report.every((r) => r.despues < 3000) && endOk && after30.fits ? 0 : 1;
