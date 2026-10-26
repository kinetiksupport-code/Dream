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
import { layoutScheme, PALETTE, parseBold } from "../lib/esquema";

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
  bad.sections[2].dates.splice(1, 0, { year: "1086", text: "Batalla inventada", quote: "" });
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
  bad.sections[2].dates.reverse();
  bad.sections[3].heading = bad.sections[0].heading;
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

test("maqueta determinista: colores en ciclo, números, columnas equilibradas, 2–4 ilustraciones", () => {
  const scheme = validateScheme(example, { sources: notes }).scheme!;
  const a = layoutScheme(scheme, 3);
  const b = layoutScheme(scheme, 3);
  assert.deepEqual(a, b);
  assert.deepEqual(a.cards.map((c) => c.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(a.cards.map((c) => c.tone), PALETTE.slice(0, 5).map((p) => p.id));
  assert.equal(a.columns.length, 3);
  assert.deepEqual(a.columns.flat().sort(), [0, 1, 2, 3, 4]);
  const illustrated = a.cards.filter((c) => c.illustration).length;
  assert.ok(illustrated >= 2 && illustrated <= 4);
  assert.ok(a.cards.every((c) => !(c.kind === "dates" && c.illustration)));
  const one = layoutScheme(scheme, 1);
  assert.deepEqual(one.columns, [[0, 1, 2, 3, 4]]);
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
    check("píldora A", base["--esq-pill-ink"], base["--esq-pill-a"], 4.5);
    check("píldora B", base["--esq-pill-ink"], base["--esq-pill-b"], 4.5);
    check("ideas", base["--esq-ideas-accent"], base["--esq-ideas-bg"], 4.5);
    check("ideas texto", base["--esq-ink"], base["--esq-ideas-bg"], 4.5);
    check("cierre", base["--esq-closing-ink"], base["--esq-closing-bg"], 4.5);
    for (const { id } of PALETTE) {
      const tone = block(`${theme} [data-tone="${id}"]`);
      check(`${id} texto`, base["--esq-ink"], tone["--bg"], 4.5);
      check(`${id} título`, tone["--accent"], tone["--bg"], 4.5);
      check(`${id} subtarjeta`, tone["--accent"], base["--esq-paper"], 4.5);
      check(`${id} número`, base["--esq-paper"], tone["--accent"], 4.5);
    }
    assert.deepEqual(failures, []);
  }
});
