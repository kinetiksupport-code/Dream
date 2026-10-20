import test from "node:test";
import assert from "node:assert/strict";
import { parseDreamContent } from "../lib/widgets";
import {
  sourcesMarker,
  stripSourcesMarker,
  SEARCH_ANSWER_STYLE,
} from "../supabase/functions/dream-api/prompts.mjs";

const result = JSON.stringify([
  { title: "Fracciones --> suma", url: "https://es.wikipedia.org/wiki/Fracción", content: "x" },
  { title: "Khan", url: "https://www.khanacademy.org/fracciones", content: "y" },
  { title: "Malo", url: "javascript:alert(1)", content: "z" },
]);

test("the server hides the sources in a marker the web reads apart", () => {
  const marker = sourcesMarker(result);
  assert.ok(marker.startsWith("<!--DREAM_SOURCES:") && marker.endsWith("-->"));
  // A title cannot close the marker early.
  assert.equal(marker.indexOf("-->"), marker.length - 3);
  const parsed = parseDreamContent(`${marker}Para sumar fracciones…`);
  assert.equal(parsed.text, "Para sumar fracciones…");
  assert.deepEqual(parsed.sources, [
    { title: "Fracciones --> suma", url: "https://es.wikipedia.org/wiki/Fracción" },
    { title: "Khan", url: "https://www.khanacademy.org/fracciones" },
  ]);
});

test("unsafe or broken sources never reach the page", () => {
  const parsed = parseDreamContent(
    '<!--DREAM_SOURCES:[{"title":"x","url":"javascript:alert(1)"},{"url":"notaurl"}]-->Hola',
  );
  assert.deepEqual(parsed.sources, []);
  assert.equal(parseDreamContent("<!--DREAM_SOURCES:{roto-->Hola").text, "Hola");
  // While it streams, a half marker is hidden too.
  assert.equal(parseDreamContent('<!--DREAM_SOURCES:[{"ti').text, "");
  assert.equal(sourcesMarker("no es json"), "");
});

test("old answers without sources keep working", () => {
  assert.deepEqual(parseDreamContent("Hola").sources, []);
});

test("the AI gets no sources markers in its history and writes the answer itself", () => {
  assert.equal(stripSourcesMarker(`${sourcesMarker(result)}Respuesta`), "Respuesta");
  assert.match(SEARCH_ANSWER_STYLE, /redacta TÚ la respuesta/);
  assert.match(SEARCH_ANSWER_STYLE, /No escribas enlaces ni URLs/);
});
