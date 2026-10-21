// Evalúa la moderación de contenido (B4) con evals/moderacion.json.
//   node scripts/eval-moderacion.mjs
// 1) Filtro barato: se ejecuta siempre, sin red. Mide cuántos casos claros marca
//    y cuántos mensajes legítimos mandaría al clasificador (el filtro nunca sanciona).
// 2) Clasificador: solo si hay GROQ_API_KEY en el entorno. Mide el resultado final
//    (categoría con confianza suficiente que además estaba marcada por el filtro).
import { readFileSync } from "node:fs";
import { CONTENT_THRESHOLDS, cheapFilter, classifierMessages, parseClassification } from "../supabase/functions/dream-api/content-moderation.mjs";
import { estimateTokens } from "../supabase/functions/dream-api/admission.mjs";

const { casos } = JSON.parse(readFileSync(new URL("../evals/moderacion.json", import.meta.url), "utf8"));
const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10} %` : "—");
const by = (kind) => casos.filter((c) => c.kind === kind);

// ── 1. Filtro barato ─────────────────────────────────────────────────────────
const claros = by("claro");
const missed = claros.filter((c) => !cheapFilter(c.text).flags.includes(c.expect));
const clean = by("no_marcar");
const routed = clean.filter((c) => cheapFilter(c.text).flagged);
const limite = by("limite");
const limiteRouted = limite.filter((c) => cheapFilter(c.text).flagged);
console.log("FILTRO BARATO (sin red)");
console.log(`  casos claros marcados con su categoría: ${claros.length - missed.length}/${claros.length} (${pct(claros.length - missed.length, claros.length)})`);
for (const c of missed) console.log(`    no marcado #${c.id} (${c.expect})`);
console.log(`  mensajes legítimos que llegarían al clasificador: ${routed.length}/${clean.length} (${pct(routed.length, clean.length)})`);
for (const c of routed) console.log(`    #${c.id} marcado como ${cheapFilter(c.text).flags.join(",")}`);
console.log(`  casos límite que llegan al clasificador: ${limiteRouted.length}/${limite.length}`);
console.log("  sanciones decididas solo por el filtro: 0 (por diseño: el filtro no sanciona)");

const sample = classifierMessages(clean[0]?.text ?? "hola");
const longest = classifierMessages("x".repeat(CONTENT_THRESHOLDS.maxChars));
console.log(`TOKENS (estimación): llamada típica ≈ ${estimateTokens(JSON.stringify(sample))}, máxima ≈ ${estimateTokens(JSON.stringify(longest))} de entrada + ${CONTENT_THRESHOLDS.maxOutputTokens} de salida`);

// ── 2. Clasificador ──────────────────────────────────────────────────────────
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.log("CLASIFICADOR: no ejecutado (falta GROQ_API_KEY). Sin medir.");
  process.exit(0);
}
const model = process.env.GROQ_MODEL || "qwen/qwen3-32b";
let hits = 0;
let falsePositives = 0;
let failures = 0;
const toTest = casos.filter((c) => cheapFilter(c.text).flagged);
for (const c of toTest) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: CONTENT_THRESHOLDS.maxOutputTokens, response_format: { type: "json_object" }, messages: classifierMessages(c.text) }),
    });
    const data = await res.json();
    const verdict = parseClassification(data?.choices?.[0]?.message?.content);
    const acted = verdict && verdict.categoria !== "ninguna" && cheapFilter(c.text).flags.includes(verdict.categoria) && verdict.confianza >= (verdict.categoria === "autolesion" ? CONTENT_THRESHOLDS.selfHarmConfidence : CONTENT_THRESHOLDS.minConfidence);
    const result = acted ? verdict.categoria : "ninguna";
    if (result === c.expect) hits++;
    else if (c.expect === "ninguna" && result !== "ninguna") falsePositives++;
    if (!verdict) failures++;
  } catch {
    failures++;
  }
}
console.log(`CLASIFICADOR (${model}): aciertos ${hits}/${toTest.length} (${pct(hits, toTest.length)}), falsos positivos ${falsePositives}, sin veredicto ${failures}`);
