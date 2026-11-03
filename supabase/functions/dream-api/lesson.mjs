// La lección de la ruta (prompt de la ruta, Bloques 1, 2, 3 y 7): una sola
// llamada a la IA genera la lectura, el banco de preguntas y las tarjetas, en
// JSON estricto. Aquí están la instrucción, los datos que recibe la IA y la
// validación (como validateAiRoute). Funciones puras, con pruebas.
//
// La IA recibe solo: tema, asignatura, curso, el resumen de la unidad, la
// dificultad y, si los hay, fragmentos de los apuntes del alumno de esa
// unidad. Nunca nombre, correo ni conversaciones.
import { MATERIAL_GUARD, wrapStudentMaterial } from "./file-guard.mjs";

export const DIFFICULTIES = Object.freeze(["facil", "medio", "dificil"]);
export const LIMITS = Object.freeze({
  sections: [3, 6],
  sectionWords: 65, // pedimos ≤ 50 (tarjeta «Qué saber», 0.11); margen para no tirar una lección por poco
  quiz: [8, 12],
  cards: [8, 12],
  cardChars: 300,
  materialChars: 6000, // ≈ 1.500 tokens de apuntes como mucho (Bloque 7: ≤ 4.000 de entrada)
  writtenChars: 1500,
});
/** Tope de salida de la llamada (Bloque 7: ≤ 3.500 tokens). */
export const LESSON_MAX_TOKENS = 3500;

const LEVEL = {
  facil: "Fácil: lo básico, con ejemplos muy cercanos y frases cortas.",
  medio: "Medio: como en clase; relaciona causas, consecuencias y conceptos.",
  dificil: "Difícil: como en el examen; matices, comparaciones y aplicación.",
};

export function lessonSystem() {
  return [
    "Eres el profesor de Dream. Preparas UNA lección privada para un alumno de España, en español de España, con tildes y signos de apertura.",
    "Devuelve SOLO JSON con esta forma exacta:",
    '{"reading":{"sections":[{"title":"…","body_markdown":"…","why_it_matters":"…","check":{"statement":"…","is_true":true,"explanation":"…"}}],"sources":["…"]},',
    '"quiz":[{"type":"mcq|tf|written|numeric","prompt":"…","options":["…"],"answer":"…","unit":"…","explanation":"…","rubric":["…"],"section_index":0,"difficulty":"facil|medio|dificil"}],',
    '"cards":[{"front":"…","back":"…","section_index":0}]}',
    "Reglas:",
    "- reading.sections: de 3 a 6 tarjetas «Qué saber» muy cortas (≤ 50 palabras cada una, 3-4 líneas), una idea por tarjeta, conceptos clave en **negrita**, fórmulas en KaTeX ($…$). check: una afirmación de verdadero/falso sobre esa tarjeta.",
    "- quiz: de 8 a 12 preguntas que se contestan con la lectura, mezclando todas las tarjetas: definición, relación, escenario y, si el tema tiene fechas o etapas, ordenar la cronología (mcq con 4 opciones del tipo «A → B → C»). mcq: 4 opciones (3 si no hay más) y answer igual a una de ellas. tf: answer «true» o «false». written: rubric con 2 a 4 ideas clave. explanation en 1-2 frases.",
    // Pautas sacadas de cómo preguntan las apps de estudio y de la investigación
    // sobre práctica de recuperación (docs/diseno/ruta/PREGUNTAS.md).
    "- Cómo preguntar (varía los formatos en cada lección): ordena de más fácil a más difícil; las opciones incorrectas son errores típicos de alumnos, creíbles y de longitud parecida a la correcta; nunca «todas las anteriores» ni «ninguna de las anteriores»; como mucho UNA pregunta en negativo («¿Cuál de estas NO…?», con el NO en mayúsculas) y nunca dobles negaciones; incluye al menos una pregunta de aplicar la idea a un caso nuevo, no solo de recordar.",
    "- Matemáticas, física, química y todo lo que se calcula: la lectura enseña UN ejemplo resuelto paso a paso; en el quiz, preguntas de completar el paso que falta de un ejercicio parecido (mcq con el paso siguiente) y preguntas numeric: answer es SOLO el número (con punto decimal), unit la unidad si la hay, y el enunciado dice cuántos decimales. explanation dice el paso clave, no solo el resultado.",
    "- cards: de 8 a 12 tarjetas de concepto (pregunta corta / respuesta corta, ≤ 300 caracteres). Ninguna tarjeta resuelve un ejercicio: pregunta por ideas, definiciones o relaciones.",
    "- sources: «De tus apuntes» si usas los apuntes; si no, el tema y la asignatura. No inventes datos, fechas ni citas: si no estás seguro, no lo pongas.",
    "- Nunca des la solución de un ejercicio del alumno.",
    MATERIAL_GUARD,
  ].join("\n");
}

/**
 * @param {{topic:string, subject:string, course?:string|null, summary?:string, difficulty?:string, notes?:{name:string,text:string}[]}} input
 */
export function lessonContext({ topic, subject, course, summary, difficulty = "medio", notes = [] }) {
  const level = LEVEL[DIFFICULTIES.includes(difficulty) ? difficulty : "medio"];
  const parts = [
    `Tema: ${String(topic).slice(0, 160)}`,
    `Asignatura: ${String(subject).slice(0, 80)}`,
    course ? `Curso: ${String(course).slice(0, 60)}` : "",
    summary ? `Objetivo de la unidad: ${String(summary).slice(0, 400)}` : "",
    `Dificultad: ${level}`,
  ].filter(Boolean);
  const material = notes.length
    ? wrapStudentMaterial(notes.map((n) => ({ file_name: n.name, extracted_text: n.text })), LIMITS.materialChars)
    : "";
  return material ? `${parts.join("\n")}\n\nApuntes del alumno de esta unidad:\n${material}` : parts.join("\n");
}

// Frases que delatan que una tarjeta da la solución de un ejercicio.
const CARD_SOLUTION = [
  /la\s+respuesta\s+(correcta\s+)?es/i,
  /soluci[oó]n\s*(es\b|:)/i,
  /\bresultado\s*(es\b|:|=)/i,
  /\bda\s+como\s+resultado\b/i,
];
export const cardResolvesExercise = (text) => CARD_SOLUTION.some((re) => re.test(String(text)));

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const words = (s) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/**
 * @typedef {{title:string, body_markdown:string, why_it_matters?:string, check:{statement:string, is_true:boolean, explanation:string}}} LessonSection
 * @typedef {{type:"mcq"|"tf"|"written", prompt:string, options?:string[], answer:string|boolean, rubric?:string[], explanation:string, section_index:number, difficulty:string}} LessonQuestion
 * @typedef {{reading:{sections:LessonSection[], sources:string[]}, quiz:LessonQuestion[], cards:{front:string, back:string, section_index:number}[]}} LessonValue
 */
/**
 * Valida y limpia la lección de la IA. Devuelve { ok, value } o { ok:false, reason }.
 * Las tarjetas que resuelven ejercicios se quitan (si quedan menos de 8, falla).
 * @param {any} raw
 * @returns {{ok: false, reason: string} | {ok: true, value: LessonValue}}
 */
export function validateLesson(raw) {
  /** @param {string} reason @returns {{ok: false, reason: string}} */
  const fail = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== "object") return fail("not_object");
  const sections = Array.isArray(raw.reading?.sections) ? raw.reading.sections : null;
  if (!sections || sections.length < LIMITS.sections[0] || sections.length > LIMITS.sections[1]) return fail("sections_count");
  const cleanSections = [];
  for (const s of sections) {
    const title = str(s?.title, 120);
    const body = str(s?.body_markdown, 1600);
    const statement = str(s?.check?.statement, 300);
    if (!title || !body || !statement || typeof s?.check?.is_true !== "boolean") return fail("section_shape");
    if (words(body) > LIMITS.sectionWords) return fail("section_too_long");
    cleanSections.push({
      title,
      body_markdown: body,
      ...(str(s.why_it_matters, 400) ? { why_it_matters: str(s.why_it_matters, 400) } : {}),
      check: { statement, is_true: s.check.is_true, explanation: str(s.check.explanation, 400) },
    });
  }
  const quizRaw = Array.isArray(raw.quiz) ? raw.quiz : null;
  if (!quizRaw || quizRaw.length < LIMITS.quiz[0] || quizRaw.length > LIMITS.quiz[1]) return fail("quiz_count");
  const quiz = [];
  for (const q of quizRaw) {
    const type = q?.type;
    const prompt = str(q?.prompt, 600);
    const explanation = str(q?.explanation, 500);
    const index = Number.isInteger(q?.section_index) ? q.section_index : -1;
    const difficulty = DIFFICULTIES.includes(q?.difficulty) ? q.difficulty : "medio";
    if (!prompt || index < 0 || index >= cleanSections.length) return fail("quiz_shape");
    if (type === "mcq") {
      const options = Array.isArray(q.options) ? q.options.map((o) => str(o, 200)).filter(Boolean) : [];
      const answer = str(q.answer, 200);
      if (options.length < 3 || options.length > 4 || new Set(options).size !== options.length || !options.includes(answer)) return fail("mcq_answer");
      quiz.push({ type, prompt, options, answer, explanation, section_index: index, difficulty });
    } else if (type === "tf") {
      const answer = q.answer === true || q.answer === "true" ? true : q.answer === false || q.answer === "false" ? false : null;
      if (answer === null) return fail("tf_answer");
      quiz.push({ type, prompt, answer, explanation, section_index: index, difficulty });
    } else if (type === "written") {
      const rubric = Array.isArray(q.rubric) ? q.rubric.map((r) => str(r, 200)).filter(Boolean) : [];
      if (rubric.length < 2 || rubric.length > 4) return fail("written_rubric");
      quiz.push({ type, prompt, answer: str(q.answer, LIMITS.writtenChars), rubric, explanation, section_index: index, difficulty });
    } else if (type === "numeric") {
      const answer = Number(typeof q.answer === "string" ? q.answer.replace(",", ".") : q.answer);
      if (!Number.isFinite(answer)) return fail("numeric_answer");
      quiz.push({ type, prompt, answer, unit: str(q.unit, 20), explanation, section_index: index, difficulty });
    } else return fail("quiz_type");
  }
  const cardsRaw = Array.isArray(raw.cards) ? raw.cards : [];
  const cards = cardsRaw
    .map((c) => ({ front: str(c?.front, LIMITS.cardChars), back: str(c?.back, LIMITS.cardChars), section_index: Number.isInteger(c?.section_index) ? c.section_index : 0 }))
    .filter((c) => c.front && c.back && !cardResolvesExercise(c.back) && !cardResolvesExercise(c.front));
  if (cards.length < LIMITS.cards[0]) return fail("cards_count");
  const sources = Array.isArray(raw.reading?.sources) ? raw.reading.sources.map((s) => str(s, 160)).filter(Boolean).slice(0, 5) : [];
  return {
    ok: /** @type {const} */ (true),
    value: {
      reading: { sections: cleanSections, sources: sources.length ? sources : ["De tus apuntes"] },
      quiz,
      cards: cards.slice(0, LIMITS.cards[1]),
    },
  };
}

/**
 * El test de la lección (6-8 preguntas, Bloque 3): mezcla de tipos, una por
 * sección como mínimo y sin repetir; el resto queda en el banco.
 */
export function pickLessonTest(quiz, count = 7) {
  const n = Math.max(6, Math.min(8, count));
  const bySection = new Map();
  quiz.forEach((q, i) => {
    if (!bySection.has(q.section_index)) bySection.set(q.section_index, []);
    bySection.get(q.section_index).push(i);
  });
  const chosen = [];
  for (const idxs of bySection.values()) if (chosen.length < n) chosen.push(idxs[0]);
  for (let i = 0; i < quiz.length && chosen.length < n; i++) if (!chosen.includes(i)) chosen.push(i);
  return chosen.sort((a, b) => a - b);
}

/** Umbral del 80 % (Bloque 3): «Dominado» o «Repasa tus fallos». */
export const MASTERY_THRESHOLD = 80;
export const isMastered = (pct) => Number(pct) >= MASTERY_THRESHOLD;

const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["de", "la", "el", "los", "las", "y", "en", "del", "un", "una", "que", "por", "con", "para", "al", "a", "o", "se", "su", "sus"]);

/**
 * Los párrafos de los apuntes que hablan de la unidad (sin IA): puntúa cada
 * párrafo por las palabras del tema y del título y se queda con los mejores
 * hasta el tope. Sin coincidencias, el principio de cada archivo.
 * @param {{file_name:string, extracted_text:string}[]} materials
 * @param {{title:string, topic:string}} unit
 */
export function unitNotes(materials, unit, maxChars = LIMITS.materialChars) {
  const keys = [...new Set(fold(`${unit.topic} ${unit.title}`).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)))];
  const out = [];
  for (const m of materials || []) {
    const paragraphs = String(m.extracted_text || "").split(/\n\s*\n|(?<=\.)\n/).map((p) => p.trim()).filter((p) => p.length > 30);
    const scored = paragraphs
      .map((p, i) => ({ p, i, score: keys.reduce((n, k) => n + (fold(p).includes(k) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const picked = (scored.length ? scored : paragraphs.slice(0, 2).map((p, i) => ({ p, i, score: 0 }))).slice(0, 6).sort((a, b) => a.i - b.i);
    if (picked.length) out.push({ name: String(m.file_name || "apuntes").slice(0, 80), text: picked.map((x) => x.p).join("\n\n") });
  }
  // El reparto entre archivos y el tope total los hace wrapStudentMaterial.
  return out.map((n) => ({ ...n, text: n.text.slice(0, maxChars) }));
}

/**
 * Corrige una pregunta del banco en código, sin IA (Bloque 5.5).
 * - mcq: la opción exacta. - tf: verdadero/falso.
 * - written (provisional, hasta la corrección con rúbrica de la Entrega 4):
 *   cuenta si recoge al menos la mitad de las ideas de la rúbrica, por sus
 *   palabras importantes.
 * @param {LessonQuestion} q
 * @param {unknown} answer
 */
export function gradeQuestion(q, answer) {
  if (q.type === "mcq") return { correct: typeof answer === "string" && answer.trim() === q.answer, correct_answer: q.answer };
  if (q.type === "tf") return { correct: answer === q.answer, correct_answer: q.answer };
  if (q.type === "numeric") {
    // Coma o punto, sin espacios ni unidad; vale un redondeo de 0,5 % (o 0,01 si es 0).
    const raw = typeof answer === "string" ? answer : typeof answer === "number" ? String(answer) : "";
    const n = Number(raw.replace(/\s/g, "").replace(/[^\d,.\-eE+]/g, "").replace(",", "."));
    const want = Number(q.answer);
    const tol = Math.max(Math.abs(want) * 0.005, want === 0 ? 0.01 : 1e-9);
    const unit = q.unit ? ` ${q.unit}` : "";
    return { correct: raw.trim() !== "" && Number.isFinite(n) && Math.abs(n - want) <= tol, correct_answer: `${String(want).replace(".", ",")}${unit}` };
  }
  const text = fold(typeof answer === "string" ? answer.slice(0, LIMITS.writtenChars) : "");
  const ideas = (q.rubric ?? []).map((idea) => {
    const keys = fold(idea).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !STOP.has(w));
    const hit = keys.filter((k) => text.includes(k)).length;
    return keys.length ? hit / keys.length >= 0.5 : false;
  });
  const met = ideas.filter(Boolean).length;
  return { correct: (q.rubric?.length ?? 0) > 0 && met >= Math.ceil((q.rubric?.length ?? 1) / 2), correct_answer: q.answer, rubric: q.rubric ?? [], met };
}

/** La pregunta tal y como la ve el alumno: sin respuesta, sin explicación, sin rúbrica. */
export function publicQuestion(q, index) {
  return { index, type: q.type, prompt: q.prompt, ...(q.type === "mcq" ? { options: q.options } : {}), ...(q.type === "numeric" && q.unit ? { unit: q.unit } : {}) };
}

/** Una tarjeta por cada fallo (Bloque 3), sin IA y sin pasar de 300 caracteres. */
export function mistakeCard(q) {
  const answer = q.type === "tf" ? (q.answer ? "Verdadero" : "Falso") : q.type === "numeric" ? `${String(q.answer).replace(".", ",")}${q.unit ? ` ${q.unit}` : ""}` : String(q.answer ?? "");
  const back = `${answer}${q.explanation ? `. ${q.explanation}` : ""}`.slice(0, LIMITS.cardChars);
  return { front: String(q.prompt).slice(0, LIMITS.cardChars), back: back || "Revisa la lectura." };
}
