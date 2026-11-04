// Textos largos (prompt «ahorrar tokens», Parte B).
import test from "node:test";
import assert from "node:assert/strict";
import {
  TURN_MATERIAL_CHARS,
  condenseText,
  historyPlaceholder,
  isLongDocument,
  materialForTurn,
  selectChunks,
  splitChunks,
  wantsWholeDocument,
  wholeDocumentGroups,
} from "../supabase/functions/dream-api/long-text.mjs";
import { compactHistory } from "../supabase/functions/dream-api/capacity.mjs";
import { readFileSync } from "node:fs";
import { nextPastedNumber, isPastedName, wordsLabel } from "../lib/pasted-text";
import { longDocument, parseDreamContent } from "../lib/widgets";

const long = Array.from({ length: 12 }, (_, i) => `## Apartado ${i + 1}\n\n${`En el apartado ${i + 1} se habla del tema ${["romanos", "visigodos", "árabes", "reyes"][i % 4]} con detalle. `.repeat(10)}`).join("\n\n") + "\n\n## Final\n\nLa Paz de Utrecht cierra la guerra en 1713.";

test("tope de material por turno: 6.000 caracteres (antes 32.000)", () => {
  // attachments.mjs importa paquetes npm: de Deno: se lee el valor del código.
  assert.match(readFileSync(new URL("../supabase/functions/dream-api/attachments.mjs", import.meta.url), "utf8"), /MAX_ATTACHMENT_CONTEXT_CHARS = 6000;/);
  assert.equal(TURN_MATERIAL_CHARS, 6000);
});

test("trocea por apartados y elige los trozos que encajan (y el final si se pregunta)", () => {
  const chunks = splitChunks(long);
  assert.ok(chunks.length >= 12);
  assert.ok(chunks.every((c) => c.text.length <= 1500));
  assert.match(selectChunks(chunks, "¿qué pasa con los visigodos?")[0].text, /visigodos/);
  assert.match(selectChunks(chunks, "¿cómo termina al final?").map((c) => c.text).join(), /Utrecht/);
});

test("un texto largo va como partes + resumen + índice y nunca pasa del tope", () => {
  const out = condenseText(long, "¿qué tratado se firma al final?");
  assert.ok(out.length <= TURN_MATERIAL_CHARS);
  assert.match(out, /Utrecht/);
  assert.match(out, /RESUMEN/);
  assert.match(out, /ÍNDICE/);
  assert.equal(condenseText("corto", "x"), "corto");
  const two = materialForTurn([{ extracted_text: long }, { extracted_text: long }], "romanos");
  assert.ok(two.every((f: { extracted_text: string }) => f.extracted_text.length <= TURN_MATERIAL_CHARS / 2));
});

test("«resúmelo entero» recorre todo en ≤ 5 llamadas pequeñas", () => {
  assert.ok(wantsWholeDocument("resúmelo entero"));
  assert.ok(wantsWholeDocument("hazme apuntes de todo"));
  assert.ok(!wantsWholeDocument("¿qué pasó en 1713?"));
  const groups = wholeDocumentGroups(long.repeat(3));
  assert.ok(groups.length <= 5);
  assert.ok(groups.every((g) => g.text.length <= 5000));
});

test("historial: el texto pegado va como título + resumen, no 4.000 caracteres cortados", () => {
  const h = compactHistory([{ role: "user", content: long }, { role: "assistant", content: "Vale." }, { role: "user", content: "hola" }]);
  assert.match(h[0].content, /^\[Texto pegado: «Apartado 1», \d+ palabras — resumen: /);
  assert.ok(h[0].content.length < 700);
  assert.match(historyPlaceholder(long), /palabras/);
});

test("historial: un documento largo de Dream va como título y 2 líneas, y vuelve el trozo que se pregunta", () => {
  const doc = `# Apuntes de historia\n\n${long}`;
  assert.ok(isLongDocument(doc));
  const h = compactHistory([{ role: "assistant", content: `${doc}\n<!--DREAM_DOC:{"title":"x","words":1}-->` }, { role: "user", content: "ok" }], { prompt: "explícame lo de Utrecht" });
  assert.match(h[0].content, /^\[Documento de Dream: «Apuntes de historia»/);
  assert.match(h[0].content, /Utrecht/);
  assert.doesNotMatch(h[0].content, /DREAM_DOC/);
  const plain = compactHistory([{ role: "assistant", content: doc }, { role: "user", content: "gracias" }], { prompt: "gracias" });
  assert.ok(plain[0].content.length < 600);
});

test("composer: nombres de texto pegado y palabras", () => {
  assert.ok(isPastedName("texto-pegado-2.md"));
  assert.ok(!isPastedName("apuntes.md"));
  assert.equal(nextPastedNumber(["texto-pegado-1.md", "foto.png"]), 2);
  assert.match(wordsLabel(2340), /^2\.?340 palabras$/);
});

test("el marcador de documento se quita del texto y da título y palabras", () => {
  const parsed = parseDreamContent(`# Hola\n\ntexto\n<!--DREAM_DOC:{"title":"Apuntes","words":2400}-->`);
  assert.deepEqual(parsed.doc, { title: "Apuntes", words: 2400 });
  assert.doesNotMatch(parsed.text, /DREAM_DOC/);
  assert.equal(longDocument("corto"), null);
  assert.equal(longDocument(`# Apuntes de historia\n\n${long}`)?.title, "Apuntes de historia");
});
