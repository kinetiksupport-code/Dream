// Blog de BabyLoveGrowth: la CSP solo abre imágenes https en /blog, la clave
// nunca va al navegador y el blog no rompe la web sin clave.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appCsp } from "../lib/csp";

const imgSrc = (csp: string) => csp.split(";").find((d) => d.trim().startsWith("img-src")) ?? "";

test("img-src admite https solo en el blog", () => {
  assert.doesNotMatch(imgSrc(appCsp("n", {}, [])), /\shttps:(\s|$)/);
  assert.match(imgSrc(appCsp("n", { blogImages: true }, [])), /\shttps:(\s|$)/);
});

test("la clave del blog es solo de servidor y no tiene NEXT_PUBLIC_", () => {
  const client = readFileSync("app/blog/lib/blog-client.ts", "utf8");
  assert.match(client, /process\.env\.BABYLOVEGROWTH_BLOG_API_KEY/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_BABYLOVEGROWTH/);
  assert.doesNotMatch(client, /^["']use client["']/m);
});

test("sin clave, el blog devuelve listas vacías en lugar de fallar", async () => {
  delete process.env.BABYLOVEGROWTH_BLOG_API_KEY;
  const { blog } = await import("../app/blog/lib/blog-client");
  assert.deepEqual(await blog.getAllArticles(), []);
  assert.equal(await blog.getArticleBySlug("x"), null);
  assert.deepEqual(await blog.getSitemapEntries(), []);
});

test("el sitemap del blog lleva al menos un <url> aunque no haya artículos", async () => {
  delete process.env.BABYLOVEGROWTH_BLOG_API_KEY;
  const { GET } = await import("../app/blog/sitemap.xml/route");
  const xml = await (await GET(new Request("https://www.edudream.es/blog/sitemap.xml"))).text();
  assert.match(xml, /<url>\s*<loc>https:\/\/www\.edudream\.es\/blog<\/loc>\s*<\/url>/);
});

test("la URL del sitio siempre lleva https:// aunque la variable venga sin esquema", async () => {
  const { absoluteSiteUrl } = await import("../app/blog/constants");
  assert.equal(absoluteSiteUrl("www.edudream.es"), "https://www.edudream.es");
  assert.equal(absoluteSiteUrl("https://www.edudream.es/"), "https://www.edudream.es");
  assert.equal(absoluteSiteUrl(undefined), "https://www.edudream.es");
});
