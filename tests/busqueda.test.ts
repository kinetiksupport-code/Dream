// Búsqueda por fecha, a fondo y «si no lo sabe, que lo busque»
// (docs/HABLA_NATURAL.md, «Búsqueda»).
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchOptionsFor, soundsUnsure } from "../supabase/functions/dream-api/search-options.mjs";
import { searchBody, SEARCH_PREFER_DOMAINS, createTavilyManager, NEWS_CACHE_MS } from "../supabase/functions/dream-api/tavily.mjs";
import { validateToolCall, webSearchTool } from "../supabase/functions/dream-api/tools.mjs";
import { SEARCH_PLANNER_PROMPT, SEARCH_ANSWER_STYLE, searchPlannerMessages } from "../supabase/functions/dream-api/prompts.mjs";

test("recent things are searched by date first", () => {
  assert.deepEqual(searchOptionsFor("qué ha pasado hoy en el congreso"), { topic: "news", timeRange: "day", deep: false });
  assert.deepEqual(searchOptionsFor("noticias del cambio climático"), { topic: "news", timeRange: "week", deep: false });
  assert.equal(searchOptionsFor("qué ha salido este mes sobre la DANA").timeRange, "month");
  assert.equal(searchOptionsFor("cuál es la última versión de Python").timeRange, "year");
  // Study questions keep the normal search.
  assert.deepEqual(searchOptionsFor("cómo se calcula la fracción generatriz"), { topic: "general", timeRange: null, deep: false });
  assert.equal(searchOptionsFor("cuál fue el último rey visigodo").timeRange, null);
});

test("the AI may narrow the date window, never widen it", () => {
  assert.equal(searchOptionsFor("noticias de la NASA", { recency: "day" }).timeRange, "day");
  assert.equal(searchOptionsFor("qué ha pasado hoy", { recency: "year" }).timeRange, "day");
  assert.equal(searchOptionsFor("fotosíntesis", { recency: "month" }).timeRange, "month");
});

test("a lot of information: deep search", () => {
  assert.equal(searchOptionsFor("investiga a fondo la Guerra Fría").deep, true);
  assert.equal(searchOptionsFor("diferencias entre mitosis y meiosis").deep, true);
  assert.equal(searchOptionsFor("qué es la mitosis").deep, false);
  assert.equal(searchOptionsFor("qué es la mitosis", { deep: true }).deep, true);
});

test("Tavily body: news without the school sites, dates on, deep with 5 results, wide without filters", () => {
  const news = searchBody("eclipse", { topic: "news", timeRange: "week" });
  assert.equal(news.topic, "news");
  assert.equal(news.time_range, "week");
  assert.equal(news.include_published_date, true);
  assert.equal(news.include_domains, undefined);
  const study = searchBody("generatriz", {});
  assert.deepEqual(study.include_domains, SEARCH_PREFER_DOMAINS);
  assert.equal(study.search_depth, "basic");
  assert.equal(study.max_results, 3);
  const deep = searchBody("guerra fría", { deep: true });
  assert.equal(deep.search_depth, "advanced");
  assert.equal(deep.max_results, 5);
  const wide = searchBody("eclipse", { topic: "news", timeRange: "day" }, true);
  assert.equal(wide.time_range, undefined);
  assert.equal(wide.topic, undefined);
  assert.equal(wide.include_domains, undefined);
  assert.ok(wide.exclude_domains.includes("brainly.com"));
});

test("news results expire after an hour; the cache key includes the options", async () => {
  let t = 0, calls = 0;
  const tavily = createTavilyManager({
    getEnv: (n) => (n === "TAVILY_API_KEY_1" ? "tvly-x" : undefined),
    now: () => t,
    logger: { ...console, log() {} },
    fetchImpl: async () => { calls++; return Response.json({ results: [1, 2, 3].map((n) => ({ title: "t", url: `https://e.org/${n}`, content: "c" })) }); },
  });
  await tavily.search("eclipse", { topic: "news", timeRange: "week" });
  await tavily.search("eclipse", { topic: "news", timeRange: "week" });
  assert.equal(calls, 1);
  await tavily.search("eclipse", {});
  assert.equal(calls, 2, "other options, other search");
  t = NEWS_CACHE_MS + 1;
  await tavily.search("eclipse", { topic: "news", timeRange: "week" });
  assert.equal(calls, 3);
  await tavily.search("eclipse", {});
  assert.equal(calls, 3, "general results still cached");
});

test("the tool accepts recency and deep, and ignores odd values", () => {
  assert.deepEqual(Object.keys(webSearchTool.function.parameters.properties), ["query", "recency", "deep"]);
  const call = (args: Record<string, unknown>) => validateToolCall({ id: "c1", type: "function", function: { name: "web_search", arguments: JSON.stringify(args) } });
  assert.deepEqual(call({ query: "x", recency: "week", deep: true }), { id: "c1", query: "x", recency: "week", deep: true });
  assert.deepEqual(call({ query: "x", recency: "siglo" }), { id: "c1", query: "x", recency: null, deep: false });
  assert.throws(() => call({ query: "x", url: "https://evil" }));
});

test("«no lo sé» is detected so the server searches", () => {
  for (const t of ["No lo sé con seguridad.", "No estoy seguro de la fecha.", "Mis datos llegan hasta 2024.", "No tengo información actualizada sobre eso."])
    assert.ok(soundsUnsure(t), t);
  for (const t of ["A ver, el verbo es «juegan». ¿Cuál es el sujeto?", "Casi: falta restar la parte que no se repite."])
    assert.ok(!soundsUnsure(t), t);
});

test("the planner and the answer know today's date and how to search", () => {
  assert.match(SEARCH_PLANNER_PROMPT, /recency/);
  assert.match(SEARCH_PLANNER_PROMPT, /deep: true/);
  assert.match(SEARCH_ANSWER_STYLE, /lo más reciente/);
  assert.equal(searchPlannerMessages({ today: "2026-11-01" }).at(-1)?.content, "Hoy es 2026-11-01.");
  assert.equal(searchPlannerMessages({ today: "mañana" }).length, 1);
});
