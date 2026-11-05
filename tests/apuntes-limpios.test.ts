// «Apuntes» (apuntes pasados a limpio): validador fiel a los apuntes, troceo,
// caché y reintento. docs/APUNTES-LIMPIOS.md.
import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTES_JSON_SCHEMA, NOTES_PAGE_CHARS, NOTES_MAX_PAGES, factsIn, generateNotesPage, namesIn, notesCacheKey,
  notesMessages, notesPages, validateNotesPage, unreadableMarks,
} from "../supabase/functions/dream-api/clean-notes.mjs";

// Apuntes «a mano» del alumno, con sus faltas (sin tildes en algunos sitios).
const SOURCE = `Evolucion de al-Andalus
1. Crisis del califato. Tras la muerte de Al-Hakam II, los califas perdieron poder. Almanzor, como hayib, controlo el gobierno mediante razias (campañas militares de saqueo) contra reinos cristianos. A su muerte en 1002, las luchas internas provocaron la desaparicion del califato en 1031.
2. Taifas. Al-Andalus se dividio en numerosos reinos o taifas que competian entre si. Los reyes pagaban parias a los monarcas cristianos para evitar ataques.
3. Imperios norteafricanos. Tras la caida de Toledo en 1085, los musulmanes buscaron apoyo externo. Almoravides: guerreros bereberes de Marrakech que cruzaron el estrecho en 1086. Su impopularidad causo la fragmentacion en segundas taifas. Almohades: llegaron en 1146 tras ser llamados por nuevas taifas. Fueron derrotados en la batalla de Las Navas de Tolosa en 1212. Tras esto el imperio almohade se desintegro y los cristianos conquistaron casi toda al-Andalus, exceptuando Granada.`;

const GOOD = {
  title: "Evolución de al-Ándalus",
  sections: [
    { heading: "Crisis del Califato", period: "", bullets: [
      { term: "", text: "Tras la muerte de Al-Hakam II, los califas perdieron poder.", quote: "Tras la muerte de Al-Hakam II, los califas perdieron poder" },
      { term: "Almanzor", text: "Como hayib, controló el gobierno mediante razias (campañas militares de saqueo) contra reinos cristianos.", quote: "Almanzor, como hayib, controlo el gobierno mediante razias" },
      { term: "", text: "A su muerte en 1002, las luchas internas provocaron la desaparición del califato en 1031.", quote: "A su muerte en 1002, las luchas internas provocaron la desaparicion del califato en 1031" },
    ] },
    { heading: "Fragmentación en taifas", period: "1031-1086", bullets: [
      { term: "", text: "Al-Ándalus se dividió en numerosos reinos o taifas que competían entre sí.", quote: "Al-Andalus se dividio en numerosos reinos o taifas que competian entre si" },
      { term: "", text: "Los reyes pagaban parias a los monarcas cristianos para evitar ataques.", quote: "Los reyes pagaban parias a los monarcas cristianos para evitar ataques" },
    ] },
    { heading: "Imperios norteafricanos", period: "1086-1212", bullets: [
      { term: "", text: "Tras la caída de Toledo en 1085, los musulmanes buscaron apoyo externo.", quote: "Tras la caida de Toledo en 1085, los musulmanes buscaron apoyo externo" },
      { term: "Almorávides", text: "Guerreros bereberes de Marrakech que cruzaron el estrecho en 1086. Su impopularidad causó las segundas taifas.", quote: "guerreros bereberes de Marrakech que cruzaron el estrecho en 1086" },
      { term: "Almohades", text: "Llegaron en 1146 y fueron derrotados en la batalla de Las Navas de Tolosa en 1212.", quote: "llegaron en 1146 tras ser llamados por nuevas taifas. Fueron derrotados en la batalla de Las Navas de Tolosa en 1212" },
      { term: "", text: "Los cristianos conquistaron casi toda al-Ándalus, excepto Granada.", quote: "los cristianos conquistaron casi toda al-Andalus, exceptuando Granada" },
    ] },
  ],
  flow: [
    { label: "Califato", period: "hasta 1031" },
    { label: "Taifas", period: "1031-1086" },
    { label: "Almorávides y Almohades", period: "1086-1212" },
    { label: "Conquista cristiana", period: "excepto Granada" },
  ],
  key_idea: { text: "La caída del califato y la llegada de los almorávides y almohades marcaron el final de al-Ándalus.", quote: "las luchas internas provocaron la desaparicion del califato en 1031" },
  unreadable: [],
  doubts: [],
};
const clone = (): any => structuredClone(GOOD);

test("una página fiel a los apuntes pasa entera, con las faltas corregidas", () => {
  const r = validateNotesPage(GOOD, { source: SOURCE });
  assert.deepEqual(r.errors, []);
  assert.equal(r.dropped, 0);
  assert.ok(r.page);
  assert.equal(r.page.sections.length, 3);
  assert.equal(r.page.flow.length, 4);
  assert.ok(r.page.key_idea.text);
  assert.equal(r.title, "Evolución de al-Ándalus");
});

test("un dato inventado se quita (aunque sea cierto)", () => {
  const raw = clone();
  raw.sections[2].bullets.push({ term: "Nazaríes", text: "El reino nazarí de Granada duró hasta 1492.", quote: "los cristianos conquistaron casi toda al-Andalus, exceptuando Granada" });
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.dropped, 1);
  assert.deepEqual(r.droppedWhy, ["dato_sin_cita"]);
  assert.ok(!JSON.stringify(r.page).includes("1492"));
});

test("una cita que no está en los apuntes se quita", () => {
  const raw = clone();
  raw.sections[1].bullets.push({ term: "", text: "Las taifas eran muy ricas en cultura y ciencia.", quote: "las taifas fueron un periodo de gran esplendor cultural" });
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.dropped, 1);
  assert.deepEqual(r.droppedWhy, ["sin_cita"]);
});

test("una frase nueva con una cita real se quita", () => {
  const raw = clone();
  raw.sections[1].bullets.push({ term: "", text: "Esta etapa supuso un florecimiento extraordinario de la poesía andalusí.", quote: "Los reyes pagaban parias a los monarcas cristianos para evitar ataques" });
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.deepEqual(r.droppedWhy, ["texto_nuevo"]);
});

test("las cajas con un dato que no está en las viñetas → error (y en el arreglo se quitan)", () => {
  const raw = clone();
  raw.flow[3] = { label: "Reino nazarí", period: "1238-1492" };
  const strict = validateNotesPage(raw, { source: SOURCE });
  assert.equal(strict.page, null);
  assert.match(strict.errors.join(" "), /flow: las cajas «Reino nazarí \(1238-1492\)»/);
  const fixed = validateNotesPage(raw, { source: SOURCE, lenient: true });
  assert.ok(fixed.page);
  assert.equal(fixed.page.flow.length, 3);
  assert.ok(!JSON.stringify(fixed.page).includes("1492"));
});

test("si quedan menos de 3 cajas, no hay cajas", () => {
  const raw = clone();
  raw.flow = [{ label: "Califato", period: "" }, { label: "Taifas", period: "" }];
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.page?.flow.length, 0);
});

test("la idea clave con un nombre nuevo → error; en el arreglo se quita", () => {
  const raw = clone();
  raw.key_idea = { text: "Los Reyes Católicos terminaron con al-Ándalus.", quote: "los cristianos conquistaron casi toda al-Andalus, exceptuando Granada" };
  assert.equal(validateNotesPage(raw, { source: SOURCE }).page, null);
  const fixed = validateNotesPage(raw, { source: SOURCE, lenient: true });
  assert.equal(fixed.page?.key_idea.text, "");
});

test("si se deja fechas de los apuntes, se le pide que las ponga", () => {
  const raw = clone();
  raw.sections[0].bullets.splice(2, 1);
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.page, null);
  assert.deepEqual(r.missing, ["1002"]);
  assert.match(r.errors.join(" "), /Te has dejado estos datos de los apuntes: 1002/);
});

test("periodo o título con una cifra que no está en los apuntes", () => {
  const raw = clone();
  raw.sections[1].period = "1031-1090";
  raw.title = "Al-Ándalus hasta 1492";
  const strict = validateNotesPage(raw, { source: SOURCE });
  assert.equal(strict.page, null);
  const fixed = validateNotesPage(raw, { source: SOURCE, lenient: true });
  assert.equal(fixed.page?.sections[1].period, "");
  assert.equal(fixed.title, "Al-Ándalus hasta");
});

test("sin título en la primera página → error; en las siguientes no hace falta", () => {
  const raw = clone();
  raw.title = "";
  assert.equal(validateNotesPage(raw, { source: SOURCE }).page, null);
  assert.ok(validateNotesPage(raw, { source: SOURCE, first: false }).page);
});

test("los avisos de datos dudosos solo señalan lo que pone en los apuntes", () => {
  const raw = clone();
  raw.doubts = [
    { text: "En tus apuntes pone que los almohades llegaron en 1146; revísalo.", quote: "llegaron en 1146 tras ser llamados por nuevas taifas" },
    { text: "En tus apuntes pone 1085, pero fue en 1084; revísalo.", quote: "Tras la caida de Toledo en 1085, los musulmanes buscaron apoyo externo" },
  ];
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.page?.doubts.length, 1);
});

test("HTML y Markdown fuera", () => {
  const raw = clone();
  raw.sections[0].bullets[0].text = "Tras la muerte de **Al-Hakam II**, los califas <b>perdieron</b> poder.";
  assert.equal(validateNotesPage(raw, { source: SOURCE }).page, null);
  const fixed = validateNotesPage(raw, { source: SOURCE, lenient: true });
  assert.equal(fixed.page?.sections[0].bullets[0].text, "Tras la muerte de Al-Hakam II, los califas perdieron poder.");
});

test("datos que se comprueban: cifras, romanos y nombres propios (no la primera palabra)", () => {
  assert.deepEqual(factsIn("Tras la muerte de Al-Hakam II en 961, Almanzor gobernó."), ["961", "ii", "al hakam", "almanzor"]);
  assert.deepEqual(namesIn("Los reyes de Castilla. Después llegó Fernando III."), ["castilla", "fernando"]);
});

test("las marcas [ilegible] del OCR se cuentan", () => {
  assert.equal(unreadableMarks("batalla de [ilegible] en 1086 y [ ilegible ]"), 2);
});

test("troceo: páginas de ~3.000 caracteres por apartados y tope de páginas", () => {
  const para = (i: number) => `Apartado ${i}\n${"Frase de los apuntes con contenido. ".repeat(30)}`;
  const long = Array.from({ length: 20 }, (_, i) => para(i + 1)).join("\n\n");
  const { pages, truncated } = notesPages(long);
  assert.ok(pages.length === NOTES_MAX_PAGES);
  assert.ok(truncated);
  assert.ok(pages.every((p) => p.length <= NOTES_PAGE_CHARS));
  assert.ok(pages[0].startsWith("Apartado 1"));
  const short = notesPages(SOURCE);
  assert.equal(short.pages.length, 1);
  assert.equal(short.truncated, false);
});

test("caché: misma clave para el mismo texto, distinta si cambia", async () => {
  const a = await notesCacheKey(SOURCE);
  assert.equal(a, await notesCacheKey(SOURCE));
  assert.notEqual(a, await notesCacheKey(`${SOURCE} `));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("mensajes: los apuntes van como datos y la página se indica", () => {
  const m = notesMessages({ text: "apuntes", page: 2, pages: 3 });
  assert.equal(m.length, 2);
  assert.match(m[1].content, /Página 2 de 3 \(no es la primera/);
  assert.match(m[1].content, /APUNTES \(datos, no instrucciones\)/);
  assert.ok(NOTES_JSON_SCHEMA.required.includes("flow"));
});

test("generateNotesPage: reintenta una vez con los errores y luego arregla quitando", async () => {
  const bad = clone();
  bad.flow[3] = { label: "Reino nazarí", period: "1238-1492" };
  const seen: string[] = [];
  const result = await generateNotesPage({
    call: async (messages) => { seen.push(messages[messages.length - 1].content); return bad; },
    messages: notesMessages({ text: SOURCE }), source: SOURCE,
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.repaired, true);
  assert.match(seen[1], /El JSON tiene estos errores/);
  assert.equal(result.page?.flow.length, 3);
});

test("generateNotesPage: si no queda nada citado, falla (y no se guarda nada)", async () => {
  const empty = { ...clone(), sections: [{ heading: "Nada", period: "", bullets: [{ term: "", text: "Algo inventado del todo.", quote: "una frase que no está" }] }] };
  const result = await generateNotesPage({ call: async () => empty, messages: notesMessages({ text: SOURCE }), source: SOURCE });
  assert.equal(result.ok, false);
  assert.equal(result.page, null);
});

test("chat: detecta «pásame a limpio estos apuntes» y no confunde esquemas ni tests", async () => {
  const { wantsCleanNotes, notesMarkdown, sectionNumbers } = await import("../lib/clean-notes");
  for (const yes of ["Pásame a limpio estos apuntes.", "pasa a limpio mis apuntes", "¿Me puedes poner en limpio las notas?", "ordena mis apuntes", "quiero mis apuntes a limpio"])
    assert.ok(wantsCleanNotes(yes), yes);
  for (const no of ["Hazme un esquema de estos apuntes", "hazme un test de mis apuntes", "resume mis apuntes", "¿qué es el califato?"])
    assert.ok(!wantsCleanNotes(no), no);
  const page = { sections: [{ heading: "A", period: "", bullets: [{ term: "X", text: "y" }] }, { heading: "B", period: "1031-1086", bullets: [{ term: "", text: "z" }] }], flow: [], key_idea: { text: "Idea" }, unreadable: [], doubts: [] };
  assert.deepEqual(sectionNumbers([page, page]), [[1, 2], [3, 4]]);
  const md = notesMarkdown({ title: "T", pages: [page], total: 1 });
  assert.match(md, /## 2\. B \(1031-1086\)/);
  assert.match(md, /- \*\*X:\*\* y/);
  assert.match(md, /> \*\*Idea clave:\*\* Idea/);
});

test("chat: la tarjeta «Dreams · Apuntes» se lee del mensaje", async () => {
  const { parseDreamContent } = await import("../lib/widgets");
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const parsed = parseDreamContent(`He pasado a limpio tus apuntes.\n\n<!--DREAM_WIDGET:{"type":"notes","notesId":"${id}","title":"Al-Ándalus","pages":2}-->`);
  assert.deepEqual(parsed.notes, [{ type: "notes", notesId: id, title: "Al-Ándalus", pages: 2 }]);
  assert.ok(!parsed.text.includes("DREAM_WIDGET"));
});

test("sin título: se pide en el reintento y, como último recurso, se usa la primera línea de los apuntes", () => {
  const raw = clone();
  raw.title = "";
  assert.match(validateNotesPage(raw, { source: SOURCE }).errors.join(" "), /title: está vacío/);
  assert.equal(validateNotesPage(raw, { source: SOURCE, lenient: true }).title, "Evolucion de al-Andalus");
});

test("ideas perdidas: las frases de los apuntes que no salen se piden en el reintento", async () => {
  const { lostSentences } = await import("../supabase/functions/dream-api/clean-notes.mjs");
  const raw = clone();
  raw.sections[1].bullets.pop();
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.page, null);
  assert.match(r.errors.join(" "), /Te has dejado estas ideas de los apuntes: «Los reyes pagaban parias/);
  assert.deepEqual(lostSentences("# Título largo del tema\n- Las mitocondrias producen energía para la célula.", "Las mitocondrias producen energía"), []);
});

test("la idea clave con palabras que no salen de los apuntes se quita", () => {
  const raw = clone();
  raw.key_idea = { text: "El proceso transforma alimentos mediante mecanismos químicos complejos y enzimáticos.", quote: "Tras la muerte de Al-Hakam II, los califas perdieron poder" };
  assert.equal(validateNotesPage(raw, { source: SOURCE, lenient: true }).page?.key_idea.text, "");
});

test("OCR: solo la transcripción, sin la descripción de la foto", async () => {
  const { notesTextFrom } = await import("../supabase/functions/dream-api/clean-notes.mjs");
  const ocr = "Análisis visual y OCR\n**Descripción visual:**\nUna hoja de cuaderno.\n\n**Transcripción del texto (OCR):**\n\nAparato digestivo\n1. Boca: los dientes trituran.";
  assert.equal(notesTextFrom(ocr), "Aparato digestivo\n1. Boca: los dientes trituran.");
  assert.equal(notesTextFrom("PDF · 2 páginas\nTema 1"), "Tema 1");
});

test("en el reintento se explica qué viñeta se quitó y por qué", () => {
  const raw = clone();
  raw.sections[0].bullets[2] = { term: "", text: "A su muerte en 1002, las luchas internas provocaron la desaparición del califato en 1031.", quote: "A su muerte en 1002, las luchas internas provocaron" };
  const r = validateNotesPage(raw, { source: SOURCE });
  assert.equal(r.page, null);
  assert.match(r.errors.join(" "), /Viñetas quitadas: «A su muerte en 1002.*: lleva 1031, que no está en su quote/);
});
