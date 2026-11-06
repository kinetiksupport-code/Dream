// Auditoría SEO/GEO (3-nov-2026): título 45-60, descripción 150-160, JSON-LD
// válido, llms.txt y páginas públicas del sitemap en www.edudream.es.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { HOME_DESCRIPTION, HOME_TITLE, PUBLIC_PAGES, SITE_URL, homeJsonLd, jsonLdScript } from "../lib/seo";

test("título y descripción de la portada con la longitud recomendada", () => {
  assert.ok(HOME_TITLE.length >= 45 && HOME_TITLE.length <= 60, `título: ${HOME_TITLE.length}`);
  assert.ok(HOME_DESCRIPTION.length >= 150 && HOME_DESCRIPTION.length <= 160, `descripción: ${HOME_DESCRIPTION.length}`);
});

test("JSON-LD con organización, web, página y aplicación gratis, sin poder cerrar el script", () => {
  const graph = homeJsonLd()["@graph"];
  assert.deepEqual(graph.map((n) => n["@type"]), ["Organization", "WebSite", "WebPage", "SoftwareApplication"]);
  const app = graph[3] as { offers: { price: string } };
  assert.equal(app.offers.price, "0");
  assert.doesNotMatch(jsonLdScript({ x: "</script>" }), /<\/script>/);
});

test("llms.txt existe y no promete ejercicios resueltos", () => {
  assert.ok(existsSync("public/llms.txt"));
  const txt = readFileSync("public/llms.txt", "utf8");
  assert.match(txt, /^# Dream/);
  assert.doesNotMatch(txt, /problemas resueltos/i);
  assert.match(txt, /https:\/\/www\.edudream\.es\/blog/);
});

test("el sitemap usa www.edudream.es y solo páginas públicas", () => {
  assert.equal(SITE_URL, "https://www.edudream.es");
  assert.deepEqual(PUBLIC_PAGES.map((p) => p.path), ["/", "/blog", "/sobre-nosotros", "/login", "/privacidad", "/terminos", "/cookies", "/aviso-legal"]);
});
