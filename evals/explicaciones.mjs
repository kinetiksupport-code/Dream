// Evals de las explicaciones (prompt «explicar bien», Parte A, punto 4).
// Sin clave: comprueba las explicaciones de referencia de explicaciones.json.
// Con GROQ_API_KEY: pide a la IA cada explicación con las mismas reglas que
// dream-api (explanation-style.mjs) y el perfil de prueba, y la comprueba.
//
//   node evals/explicaciones.mjs                # referencias
//   GROQ_API_KEY=… node evals/explicaciones.mjs # IA de verdad
import { readFileSync } from "node:fs";
import { EXPLANATION_STYLE, WHY_WRONG_RULE, WRITTEN_FEEDBACK_RULE, explanationProblems, interestsLine } from "../supabase/functions/dream-api/explanation-style.mjs";

const data = JSON.parse(readFileSync(new URL("./explicaciones.json", import.meta.url), "utf8"));
const interests = data.profile.interests;

/** Fallos de un caso: formato, why_wrong de la opción elegida y la afición en el ejemplo. */
export function caseProblems(c, out) {
  if (c.type === "written") {
    const fb = String(out.feedback ?? "");
    const p = [];
    if (!/\*\*[^*]+\*\*/.test(fb)) p.push("sin_negrita");
    if (/¿\s*(te\s+)?queda\s+claro/i.test(fb)) p.push("te_queda_claro");
    if (!/(quedar[ií]a|por ejemplo|as[ií]:)/i.test(fb)) p.push("sin_ejemplo_de_como_quedaria");
    return p;
  }
  const p = explanationProblems(out.explanation, { correct: true, interests, math: !!c.math });
  const wrong = c.student_answer;
  if ((c.type === "mcq" || c.type === "tf") && wrong !== c.answer) {
    const w = out.why_wrong?.[wrong];
    if (!w) p.push("sin_why_wrong");
    else if (!/^no\s+es\s+es[ae]\b/i.test(w)) p.push("why_wrong_no_empieza_no_es_esa");
  }
  return p;
}

async function ask(c) {
  const system = [
    "Eres el profesor de Dream. El alumno ya ha contestado esta pregunta y ya sabe la respuesta correcta. Explícasela.",
    c.type === "written"
      ? `Devuelve SOLO JSON {"feedback":"…"}. ${WRITTEN_FEEDBACK_RULE}`
      : 'Devuelve SOLO JSON {"explanation":"Es correcta porque …","why_wrong":{"opción incorrecta":"No es esa: …"}}',
    EXPLANATION_STYLE,
    WHY_WRONG_RULE,
  ].join("\n");
  const user = JSON.stringify({ asignatura: c.subject, curso: data.profile.course, pregunta: c.prompt, opciones: c.options, respuesta_correcta: c.answer, rubrica: c.rubric, respuesta_del_alumno: c.student_answer }) + "\n" + interestsLine({ interests });
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", temperature: 0.25, max_tokens: 900, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

async function main() {
  const live = !!process.env.GROQ_API_KEY;
  let ok = 0;
  for (const c of data.cases) {
    const out = live ? await ask(c) : c.reference;
    const p = caseProblems(c, out);
    if (!p.length) ok++;
    console.log(`${p.length ? "✗" : "✓"} ${c.id}${p.length ? `: ${p.join(", ")}` : ""}`);
    if (p.length && live) console.log(`   ${JSON.stringify(out).slice(0, 400)}`);
  }
  console.log(`\n${ok}/${data.cases.length} casos bien (${live ? "IA de verdad" : "referencias"})`);
  process.exitCode = ok === data.cases.length ? 0 : 1;
}

if (process.argv[1]?.endsWith("explicaciones.mjs")) main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
