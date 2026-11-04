// Esquemas: los fallos pequeños se arreglan solos en vez de tirar el esquema
// (caso real del 4-nov-2026: «Hazme un esquema de imperio…» fallaba siempre).
import test from "node:test";
import assert from "node:assert/strict";
import { generateScheme, validateScheme } from "../supabase/functions/dream-api/schemes.mjs";

const SOURCE = "El Imperio carolingio nació cuando Carlomagno fue coronado emperador en el año 800. Tras su muerte, el Tratado de Verdún de 843 dividió el imperio entre sus nietos. Los condes gobernaban los condados y los missi dominici los vigilaban.";
const section = (heading: string, extra: Record<string, unknown> = {}) => ({
  heading, period: "", kind: "list", intro: "", formula: "", highlight: "", illustration_prompt: null, illustration_caption: "", subcards: [], dates: [],
  bullets: [{ text: "Los condes gobernaban los condados", quote: "Los condes gobernaban los condados" }], ...extra,
});
const messy = {
  title: "El Imperio carolingio",
  subtitle: "Un imperio que duró hasta 1999",
  subject: "Historia",
  sections: [
    section("Origen", { intro: "Empezó en el año 768 con muchos cambios.", kind: "mapa" }),
    section("Gobierno", { dates: [
      { year: "843", text: "Tratado de Verdún", quote: "el Tratado de Verdún de 843 dividió el imperio" },
      { year: "800", text: "Carlomagno, emperador", quote: "Carlomagno fue coronado emperador en el año 800" },
    ], kind: "dates" }),
    section("Final", { highlight: "x".repeat(400) }),
  ],
  key_ideas: ["Carlomagno unió Europa", "Cayó en 1200"],
  summary: "Resumen sin cifras.",
  closing: "",
};

test("sin arreglar, el esquema desordenado se rechaza (como antes)", () => {
  assert.equal(validateScheme(messy, { sources: SOURCE }).scheme, null);
});

test("en modo arreglar: quita cifras sin respaldo, ordena fechas, recorta y corrige el tipo", () => {
  const r = validateScheme(messy, { sources: SOURCE, lenient: true });
  assert.ok(r.scheme, r.errors.join("; "));
  const s = r.scheme!;
  assert.equal(s.subtitle, "");
  assert.equal(s.sections[0].intro, "");
  assert.equal(s.sections[0].kind, "list");
  assert.deepEqual(s.sections[1].dates.map((d: { year: string }) => d.year), ["800", "843"]);
  assert.ok(s.sections[2].highlight.length <= 170);
  assert.deepEqual(s.key_ideas, ["Carlomagno unió Europa"]);
});

test("generateScheme: primer intento sin JSON y segundo con fallos pequeños → esquema arreglado", async () => {
  let n = 0;
  const r = await generateScheme({
    call: async () => {
      if (n++ === 0) throw new Error("http_400");
      return messy;
    },
    messages: [{ role: "user", content: "esquema" }],
    sources: SOURCE,
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});

test("lo grave sigue fallando: sin secciones suficientes no se inventa nada", () => {
  assert.equal(validateScheme({ ...messy, sections: messy.sections.slice(0, 1) }, { sources: SOURCE, lenient: true }).scheme, null);
});
