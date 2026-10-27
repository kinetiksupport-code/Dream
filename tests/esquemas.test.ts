import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SCHEME_JSON_SCHEMA,
  SCHEME_LIMITS,
  generateScheme,
  normalizeForQuote,
  quoteFound,
  validateScheme,
  yearValue,
} from "../supabase/functions/dream-api/schemes.mjs";
import { SCHEME_PROMPT, schemeMessages } from "../supabase/functions/dream-api/prompts.mjs";
import example from "../supabase/functions/dream-api/scheme-example.json" with { type: "json" };
import { layoutScheme, PALETTE, parseBold, parseInline } from "../lib/esquema";

const notes = fs.readFileSync(new URL("../evals/esquemas/apuntes/al-andalus.md", import.meta.url), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (value: unknown): any => JSON.parse(JSON.stringify(value));

test("el ejemplo de al-Ándalus pasa el validador con sus apuntes y conserva todos los datos", () => {
  const result = validateScheme(example, { sources: notes });
  assert.deepEqual(result.errors, []);
  assert.equal(result.dropped, 0);
  assert.ok(result.checkedFacts >= 8);
  assert.equal(result.foundFacts, result.checkedFacts);
  assert.equal(result.scheme?.sections.length, 5);
});

test("un dato con cifras cuya cita no está en la fuente se quita sin reintentar", () => {
  const bad = clone(example);
  bad.sections[0].bullets.push({ text: "En **1050** se fundaron 40 taifas.", quote: "en 1050 se fundaron cuarenta taifas en total" });
  bad.sections[3].dates.splice(1, 0, { year: "1086", text: "Batalla inventada", quote: "" });
  const result = validateScheme(bad, { sources: notes });
  assert.deepEqual(result.errors, []);
  assert.equal(result.dropped, 2);
  assert.ok(!JSON.stringify(result.scheme).includes("1050"));
  assert.ok(!JSON.stringify(result.scheme).includes("Batalla inventada"));
});

test("la cita debe contener las mismas cifras que el texto", () => {
  const bad = clone(example);
  bad.sections[0].bullets[0].text = "En **1035** desaparece el califato.";
  assert.equal(validateScheme(bad, { sources: notes }).dropped, 1);
});

test("errores graves: longitudes, HTML, inglés, fechas desordenadas, duplicados", () => {
  const bad = clone(example);
  bad.title = "x".repeat(SCHEME_LIMITS.title + 5);
  bad.sections[0].bullets[1].text = "<b>Reinos</b> pequeños";
  bad.sections[3].dates.reverse();
  bad.sections[2].heading = bad.sections[0].heading;
  const { errors, scheme } = validateScheme(bad, { sources: notes });
  assert.equal(scheme, null);
  assert.ok(errors.some((e: string) => e.startsWith("title:")));
  assert.ok(errors.some((e: string) => e.includes("HTML")));
  assert.ok(errors.some((e: string) => e.includes("orden cronológico")));
  assert.ok(errors.some((e: string) => e.includes("repetido")));
  const english = clone(example);
  english.summary = "The caliphate of Cordoba was divided into the taifa kingdoms and this was the end of the unity of the territory that the rulers had built.";
  english.closing = "It was a period of political division and of territorial decline for the Muslims, with the Christian kingdoms that were advancing from the north.";
  assert.ok(validateScheme(english, { sources: notes }).errors.some((e: string) => e.includes("inglés")));
});

test("validador: entradas no válidas", () => {
  assert.equal(validateScheme(null).scheme, null);
  assert.equal(validateScheme([]).scheme, null);
  assert.ok(validateScheme({ title: "Hola", sections: [] }).errors.some((e: string) => e.startsWith("sections:")));
});

test("citas y años", () => {
  assert.equal(normalizeForQuote("«Él» llegó, ¡en 1492!"), "el llego en 1492");
  assert.ok(quoteFound("los Reyes Católicos toman Granada", normalizeForQuote(notes)));
  assert.ok(!quoteFound("Granada", normalizeForQuote(notes)));
  assert.equal(yearValue("1492"), 1492);
  assert.equal(yearValue("218 a. C."), -218);
  assert.equal(yearValue("Siglo XII"), 1150);
  assert.equal(yearValue("hoy"), null);
});

test("generateScheme reintenta una vez con la lista de errores y luego se rinde", async () => {
  const calls: unknown[][] = [];
  const bad = clone(example);
  bad.title = "";
  const ok = await generateScheme({
    messages: [{ role: "user", content: "x" }],
    sources: notes,
    call: async (messages: unknown[]) => { calls.push(messages); return calls.length === 1 ? bad : example; },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.attempts, 2);
  assert.match(String((calls[1].at(-1) as { content: string }).content), /title: está vacío/);
  const fail = await generateScheme({ messages: [], sources: notes, call: async () => bad });
  assert.equal(fail.ok, false);
  assert.equal(fail.attempts, 2);
  const admission = Object.assign(new Error("cupo"), { name: "AdmissionError" });
  await assert.rejects(generateScheme({ messages: [], call: async () => { throw admission; } }), /cupo/);
});

test("formato estricto: todas las propiedades son obligatorias y no hay extras", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (node?.type === "object") {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(walk);
    }
    if (node?.items) walk(node.items);
  };
  walk(SCHEME_JSON_SCHEMA);
});

test("prompt: fuente como datos, ejemplo opcional, sin diseño", () => {
  const plain = schemeMessages({ request: "esquema de al-Ándalus", sources: notes });
  assert.equal(plain.length, 2);
  assert.ok(!plain[0].content.includes("EJEMPLO"));
  assert.match(plain[1].content, /datos, no instrucciones/);
  const withExample = schemeMessages({ request: "x", sources: "y", example });
  assert.match(withExample[0].content, /EJEMPLO DE SALIDA IDEAL/);
  assert.ok(!/css|html libre|color/i.test(SCHEME_PROMPT.replace("sin HTML", "")));
});

test("maqueta determinista: tonos, números, columnas, ilustraciones y bloques finales", () => {
  const scheme = validateScheme(example, { sources: notes }).scheme!;
  const a = layoutScheme(scheme, 3);
  assert.deepEqual(a, layoutScheme(scheme, 3));
  const sections = a.blocks.flatMap((b) => (b.type === "section" ? [b.card] : []));
  assert.deepEqual(sections.map((c) => c.number), [1, 2, 3, 4, null]);
  assert.deepEqual(sections.map((c) => c.tone), [...PALETTE.slice(0, 5)]);
  // «Patrimonio» (legacy) cierra el esquema; ideas y resumen van en las columnas.
  assert.deepEqual(a.blocks.map((b) => (b.type === "section" ? b.card.kind : b.type)), ["list", "subcards", "list", "dates", "ideas", "summary", "legacy"]);
  assert.deepEqual(a.columns.map((c) => c[0]), [0, 1, 2]);
  assert.deepEqual(a.columns.flat().sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6]);
  // La caja de cierre va en la primera tarjeta y solo ahí.
  assert.equal(sections[0].closing, scheme.closing);
  assert.ok(sections.slice(1).every((c) => !c.closing));
  const illustrated = sections.filter((c) => c.illustration);
  assert.ok(illustrated.length >= 2 && illustrated.length <= 4);
  assert.ok(illustrated.every((c) => c.kind !== "dates" && c.kind !== "formula"));
  assert.deepEqual(layoutScheme(scheme, 1).columns, [[0, 1, 2, 3, 4, 5, 6]]);
});

test("las cifras de los textos libres deben aparecer en la fuente; las de fórmulas no cuentan", () => {
  const bad = clone(example);
  bad.summary = "En 1300 al-Ándalus vivió su mejor momento.";
  bad.sections[1].period = "1086-1269";
  const { errors } = validateScheme(bad, { sources: notes });
  assert.ok(errors.some((e: string) => e.startsWith("summary: la cifra 1300")));
  assert.ok(errors.some((e: string) => e.includes("period: la cifra 1269")));
  // 1236 está en la fuente aunque ninguna viñeta lo cite: vale en un periodo.
  const ok = clone(example);
  ok.sections[2].period = "1236-1492";
  assert.deepEqual(validateScheme(ok, { sources: notes }).errors, []);
  // CO2, H2O o x^2 son fórmulas, no datos que citar.
  const chem = clone(example);
  chem.key_ideas.push("Las plantas toman CO2 y H2O; en x^2 el 2 es un exponente.");
  chem.sections[0].bullets.push({ text: "El CO2 entra por los estomas.", quote: "" });
  const chemResult = validateScheme(chem, { sources: notes });
  assert.deepEqual(chemResult.errors, []);
  assert.equal(chemResult.dropped, 0);
});

test("negritas: solo **texto**, nunca HTML", () => {
  assert.deepEqual(parseBold("En **1031** cae <b>"), [
    { text: "En ", bold: false },
    { text: "1031", bold: true },
    { text: " cae <b>", bold: false },
  ]);
});

test("contraste AA de los tonos del esquema en claro y oscuro", async () => {
  const { contrast, parseColor } = await import("../scripts/design/contrast.mjs");
  const css = fs.readFileSync(new URL("../components/esquema/esquema.module.css", import.meta.url), "utf8");
  const block = (selector: string) => {
    const i = css.indexOf(`${selector} {`);
    assert.ok(i >= 0, selector);
    const body = css.slice(i, css.indexOf("}", i));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  };
  for (const theme of [".esquema", ':root[data-theme="dark"] .esquema']) {
    const base = block(theme);
    const failures: string[] = [];
    const check = (label: string, fg: string, bg: string, min: number) => {
      const ratio = contrast(parseColor(fg), parseColor(bg));
      assert.ok(Number.isFinite(ratio), `${label}: color no válido`);
      if (ratio < min) failures.push(`${theme} ${label}: ${ratio.toFixed(2)} < ${min}`);
    };
    check("texto/papel", base["--esq-ink"], base["--esq-paper"], 4.5);
    check("texto suave/papel", base["--esq-ink-soft"], base["--esq-paper"], 4.5);
    check("título/franja", base["--esq-ink"], base["--esq-band"], 4.5);
    for (const id of [...PALETTE, "verde", "lila"]) {
      const tone = block(`${theme} [data-tone="${id}"]`);
      check(`${id} texto`, base["--esq-ink"], tone["--bg"], 4.5);
      check(`${id} cabecera, píldora, destacado`, base["--esq-ink"], tone["--head"], 4.5);
      check(`${id} pie de foto`, base["--esq-ink-soft"], tone["--bg"], 4.5);
      // Número de 28 px en negrita: texto grande, 3:1. Iconos: 3:1.
      check(`${id} número`, base["--esq-on-accent"], tone["--accent"], 3);
      check(`${id} icono`, tone["--accent"], tone["--head"], 3);
    }
    assert.deepEqual(failures, []);
  }
});

test("matemática en línea, años repetidos y periodos iguales", () => {
  assert.deepEqual(parseInline("Si $b^2 - 4ac > 0$ hay **dos** soluciones").map((p) => [p.text, p.bold, p.math]), [
    ["Si ", false, false],
    ["b^2 - 4ac > 0", false, true],
    [" hay ", false, false],
    ["dos", true, false],
    [" soluciones", false, false],
  ]);
  const messy = clone(example);
  messy.sections[3].dates[2].text = "1085: Alfonso VI conquista Toledo.";
  messy.sections[0].period = "1031-1031";
  messy.sections[0].bullets.push({ text: "Ejemplo: $x^2 - 5x + 6 = 0$ tiene dos raíces.", quote: "" });
  const { scheme, errors, dropped } = validateScheme(messy, { sources: notes });
  assert.deepEqual(errors, []);
  assert.equal(dropped, 0);
  assert.equal(scheme!.sections[3].dates[2].text, "Alfonso VI conquista Toledo.");
  assert.equal(scheme!.sections[0].period, "1031");
});

test("intención: «hazme un esquema» sí; «qué es un esquema» o imprimir, no", async () => {
  const { wantsScheme } = await import("../lib/esquema");
  for (const yes of ["Hazme un esquema de estos apuntes.", "esquema del tema 3", "Pásalo a esquema", "¿Me haces un esquema? quiero un esquema", "Resúmelo en un esquema"])
    assert.ok(wantsScheme(yes), yes);
  for (const no of ["¿Qué es un esquema?", "Imprimir el esquema", "Explícame la fotosíntesis", "¿Cómo se hace un esquema?"])
    assert.ok(!wantsScheme(no), no);
});

test("fuente de los apuntes: nombre de cada archivo y tope de 10.000 caracteres repartido", async () => {
  const { schemeSourceFrom, SCHEME_SOURCE_CHARS } = await import("../supabase/functions/dream-api/schemes.mjs");
  const out = schemeSourceFrom([
    { name: "tema1.pdf", text: "a".repeat(20000) },
    { name: "foto.jpg", text: "b".repeat(300) },
    { name: "vacío.txt", text: "   " },
  ]);
  assert.ok(out.length <= SCHEME_SOURCE_CHARS);
  assert.match(out, /^\[tema1\.pdf\]\n/);
  assert.ok(out.includes("[foto.jpg]\n" + "b".repeat(300)));
  assert.ok(!out.includes("vacío"));
  assert.ok(out.split("a").length - 1 > 8000);
});

test("tarjeta «Dreams» del esquema en el chat; nada de HTML ni ids raros", async () => {
  const { parseDreamContent } = await import("../lib/widgets");
  const id = "0b5b3c3e-8f2a-4c1b-9a51-0c4d2a9f7e11";
  const ok = parseDreamContent(`He preparado tu esquema.\n\n<!--DREAM_WIDGET:{"type":"scheme","schemeId":"${id}","title":"Al-Ándalus","sections":5}-->`);
  assert.deepEqual(ok.schemes, [{ type: "scheme", schemeId: id, title: "Al-Ándalus", subject: undefined, sections: 5 }]);
  assert.equal(ok.text.trim(), "He preparado tu esquema.");
  assert.equal(ok.widgets.length, 0);
  const bad = parseDreamContent(`<!--DREAM_WIDGET:{"type":"scheme","schemeId":"../../x","title":"x"}-->`);
  assert.equal(bad.schemes.length, 0);
});

test("edición: cambiar, añadir, quitar, mover, color, deshacer y rehacer sin tocar el original", async () => {
  const E = await import("../lib/esquema-edit");
  const base = validateScheme(example, { sources: notes }).scheme!;
  const a = E.setAt(base, ["sections", 0, "bullets", 0, "text"], "Nuevo texto");
  assert.equal(a.sections[0].bullets[0].text, "Nuevo texto");
  assert.notEqual(base.sections[0].bullets[0].text, "Nuevo texto");
  const b = E.insertAt(a, ["key_ideas"], "Otra idea");
  assert.equal(b.key_ideas.at(-1), "Otra idea");
  const c = E.removeAt(b, ["sections", 0, "bullets", 1]);
  assert.equal(c.sections[0].bullets.length, a.sections[0].bullets.length - 1);
  const d = E.moveSection(c, 0, 1);
  assert.equal(d.sections[1].heading, c.sections[0].heading);
  assert.equal(E.moveSection(d, 0, -1), d); // la primera no sube más
  const e = E.setTone(d, 2, "verde");
  assert.equal(e.sections[2].tone, "verde");
  const card = layoutScheme(e, 3).blocks.flatMap((x) => (x.type === "section" ? [x.card] : [])).find((x) => x.index === 2);
  assert.equal(card?.tone, "verde");
  let h = E.historyOf(base);
  h = E.commit(h, a);
  h = E.commit(h, b);
  assert.equal(E.undo(h).present, a);
  assert.equal(E.redo(E.undo(h)).present, b);
  // Nunca se queda sin tarjetas.
  let one = base;
  while (one.sections.length > 1) one = E.removeAt(one, ["sections", 0]);
  assert.equal(E.removeAt(one, ["sections", 0]).sections.length, 1);
});

test("texto editado por el alumno: se quitan etiquetas y vacíos; sin título no vale", async () => {
  const { normalizeEditedScheme } = await import("../supabase/functions/dream-api/schemes.mjs");
  const edited = clone(example);
  edited.title = "<b>Mi</b> esquema";
  edited.sections[0].bullets.push({ text: "   " }, { text: "<i>Viñeta</i> nueva" });
  edited.sections[0].tone = "verde";
  edited.sections[1].tone = "fucsia";
  const out = normalizeEditedScheme(edited) as unknown as { title: string; sections: { tone?: string; bullets: { text: string }[] }[] };
  assert.equal(out.title, "Mi esquema");
  assert.ok(out.sections[0].bullets.every((b: { text: string }) => b.text && !b.text.includes("<")));
  assert.ok(out.sections[0].bullets.some((b: { text: string }) => b.text === "Viñeta nueva"));
  assert.equal(out.sections[0].tone, "verde");
  assert.equal(out.sections[1].tone, undefined);
  assert.equal(normalizeEditedScheme({ ...edited, title: "" }), null);
  assert.equal(normalizeEditedScheme({ ...edited, sections: [] }), null);
});

test("«Pedir a la IA»: la tarjeta rehecha pasa por el mismo validador (cifras con cita)", async () => {
  const { validateSection } = await import("../supabase/functions/dream-api/schemes.mjs");
  const ctx = { title: example.title, subject: example.subject };
  const good = validateSection(example.sections[0], { sources: notes, context: ctx });
  assert.equal(good.section?.heading, example.sections[0].heading);
  const invented = clone(example.sections[0]);
  invented.bullets = [{ text: "En **1099** pasó algo.", quote: "esto no está en la fuente de ninguna manera" }, { text: "Una viñeta sin cifras.", quote: "" }];
  const bad = validateSection(invented, { sources: notes, context: ctx });
  assert.ok(bad.section);
  assert.ok(bad.section!.bullets.every((b: { text: string }) => !b.text.includes("1099")));
});

test("Markdown y nombre de archivo del esquema", async () => {
  const { toMarkdown, fileNameFor } = await import("../lib/esquema-export");
  const md = toMarkdown(validateScheme(example, { sources: notes }).scheme!);
  assert.match(md, /^# La evolución de al-Ándalus/);
  assert.match(md, /## 1\. La fragmentación de al-Ándalus en taifas \(1031-1086\)/);
  assert.match(md, /- \*\*1492\*\*: Los Reyes Católicos toman Granada\./);
  assert.match(md, /## Ideas clave/);
  assert.equal(fileNameFor("Al-Ándalus: ¿tras el califato?", "png"), "esquema-al-andalus-tras-el-califato.png");
});

test("ilustraciones: prompt saneado, estilo fijo sin texto y temas sensibles fuera", async () => {
  const I = await import("../supabase/functions/dream-api/illustrations.mjs");
  assert.equal(I.sanitizeIllustrationPrompt("The \"Alhambra\" palace in 1492, golden hour"), "The Alhambra palace in, golden hour");
  assert.equal(I.sanitizeIllustrationPrompt("battlefield with blood and corpses"), null);
  assert.equal(I.sanitizeIllustrationPrompt("close-up portrait of a woman"), null);
  assert.equal(I.sanitizeIllustrationPrompt("sol"), null);
  const prompt = I.buildImagePrompt("Old water wheel among orange trees");
  assert.match(prompt, /^Old water wheel among orange trees\. /);
  assert.match(prompt, /No text, no letters, no numbers/);
  assert.match(prompt, /no realistic faces/);
  const targets = I.illustrationTargets(example);
  assert.ok(targets.length >= 2 && targets.length <= 4);
  assert.ok(targets.every((t: { key: string }) => example.sections.some((s: { illustration_prompt: string | null }) => s.illustration_prompt === t.key)));
  assert.equal(await I.promptHash("x"), await I.promptHash("x"));
  assert.notEqual(await I.promptHash("x"), await I.promptHash("y"));
  assert.deepEqual(I.imageType(new Uint8Array([0xff, 0xd8, 0xff])), { mime: "image/jpeg", ext: "jpg" });
  assert.equal(I.imageType(new Uint8Array([1, 2, 3])), null);
  assert.equal(I.illustrationsEnabled(() => "off"), false);
  assert.equal(I.illustrationsEnabled(() => undefined), true);
});

test("ilustraciones: llamada a Workers AI en multipart (prompt, width, height) y errores claros", async () => {
  const I = await import("../supabase/functions/dream-api/illustrations.mjs");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
  let sent: FormData | null = null;
  let url = "";
  const bytes = await I.generateImage({
    accountId: "a".repeat(32), apiKey: "k".repeat(40), prompt: "p",
    fetchImpl: (async (u: string, init: RequestInit) => { url = u; sent = init.body as FormData; return new Response(JSON.stringify({ result: { image: jpeg } })); }) as unknown as typeof fetch,
  });
  assert.equal(bytes[0], 0xff);
  assert.match(url, /\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
  assert.equal(sent!.get("prompt"), "p");
  assert.equal(sent!.get("width"), "768");
  await assert.rejects(I.generateImage({ accountId: "a", apiKey: "k", prompt: "p", fetchImpl: async () => new Response("", { status: 429 }) }), /image_quota/);
  await assert.rejects(I.generateImage({ accountId: "a", apiKey: "k", prompt: "p", fetchImpl: async () => new Response(JSON.stringify({ result: { image: "aGVsbG8=" } })) }), /image_format/);
});
