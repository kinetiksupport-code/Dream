import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  DEFAULT_PANEL_PATH,
  PANEL_HEADERS,
  PANEL_INTERNAL,
  classifyPanelRoute,
  cspHash,
  panelCsp,
  panelPath,
} from "../lib/admin-route";
import { ADMIN_BAN_RULES as WEB_RULES } from "../lib/admin-api";
import { ADMIN_BAN_RULES as SERVER_RULES, panelPath as serverPanelPath } from "../supabase/functions/dream-api/admin.mjs";
import { middleware } from "../middleware";

// B5: la ruta discreta, sus cabeceras y que nada más se parezca a un panel.

test("the panel path is configurable on the server but only to a safe, boring value", () => {
  assert.equal(panelPath(undefined), DEFAULT_PANEL_PATH);
  assert.equal(DEFAULT_PANEL_PATH, "/revision");
  assert.equal(panelPath("/mi-ruta-secreta-42"), "/mi-ruta-secreta-42");
  for (const bad of ["", "revision", "/", "/a", "/Admin", "/con espacio", "/../x", "/x/y", "//evil.example", "/ruta?x=1", PANEL_INTERNAL, "/" + "a".repeat(60)])
    assert.equal(panelPath(bad), DEFAULT_PANEL_PATH, bad);
  // La web (middleware) y dream-api (enlace del menú) entienden la ruta igual.
  for (const value of ["/mi-ruta-secreta-42", "/Admin", "", PANEL_INTERNAL.slice(1), "/x/y"])
    assert.equal(serverPanelPath(value), panelPath(value) === PANEL_INTERNAL ? DEFAULT_PANEL_PATH : panelPath(value));
});

test("only the configured path is the panel; the internal page and the usual admin paths are not reachable", () => {
  const configured = "/revision";
  assert.equal(classifyPanelRoute("/revision", configured), "panel");
  assert.equal(classifyPanelRoute("/revision/", configured), "panel");
  assert.equal(classifyPanelRoute(PANEL_INTERNAL, configured), "internal");
  assert.equal(classifyPanelRoute(`${PANEL_INTERNAL}/x`, configured), "internal");
  for (const decoy of ["/admin", "/panel", "/administracion", "/revision/otra", "/Revision", "/chat"])
    assert.equal(classifyPanelRoute(decoy, configured), null, decoy);
});

test("the CSP has no unsafe-inline for scripts, no third parties and no framing", () => {
  const csp = panelCsp("NONCE123", { supabaseUrl: "https://abc.supabase.co", dreamApiUrl: "https://abc.supabase.co/functions/v1/dream-api" });
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
  assert.equal(directive("default-src"), "default-src 'none'");
  assert.match(directive("script-src"), /^script-src 'self' 'nonce-NONCE123' 'strict-dynamic'$/);
  assert.match(panelCsp("N", {}, ["sha256-abc="]), /script-src 'self' 'nonce-N' 'sha256-abc=' 'strict-dynamic'/);
  assert.ok(!directive("script-src").includes("unsafe-inline") && !directive("script-src").includes("unsafe-eval"));
  assert.ok(!directive("style-src").includes("unsafe-inline"));
  assert.equal(directive("connect-src"), "connect-src 'self' https://abc.supabase.co");
  assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive("object-src"), "object-src 'none'");
  assert.equal(directive("base-uri"), "base-uri 'none'");
  assert.ok(!/https?:\/\/(?!abc\.supabase\.co)/.test(csp), "ningún origen de terceros (Crisp, PostHog, Sentry…)");
  assert.ok(!/crisp|posthog|sentry/i.test(csp));
});

test("the panel headers forbid caching, indexing, framing and referrers", () => {
  assert.match(PANEL_HEADERS["Cache-Control"], /no-store/);
  assert.equal(PANEL_HEADERS["X-Frame-Options"], "DENY");
  assert.match(PANEL_HEADERS["X-Robots-Tag"], /noindex/);
  assert.equal(PANEL_HEADERS["Referrer-Policy"], "no-referrer");
  assert.equal(PANEL_HEADERS["X-Content-Type-Options"], "nosniff");
});

const ask = (path: string) => middleware(new NextRequest(`http://localhost:3000${path}`));

test("middleware: the panel path answers 404 with strict headers; the internal page and decoys look like any missing page", async () => {
  delete process.env.ADMIN_PANEL_PATH;
  const panel = await ask("/revision");
  assert.equal(panel.status, 404);
  assert.match(panel.headers.get("x-middleware-rewrite") ?? "", /\/panel-interno$/);
  assert.match(panel.headers.get("content-security-policy") ?? "", /script-src 'self' 'nonce-[^']+' 'sha256-[^']+' 'strict-dynamic'/);
  assert.equal(panel.headers.get("x-frame-options"), "DENY");
  assert.match(panel.headers.get("cache-control") ?? "", /no-store/);
  assert.match(panel.headers.get("x-robots-tag") ?? "", /noindex/);
  // Cada petición, su propio nonce.
  const another = await ask("/revision");
  assert.notEqual(panel.headers.get("content-security-policy"), another.headers.get("content-security-policy"));
  // La página interna pedida a mano: el 404 de siempre.
  const internal = await ask(PANEL_INTERNAL);
  assert.match(internal.headers.get("x-middleware-rewrite") ?? "", /\/no-existe-404$/);
  // Con la CSP de la app (lib/csp.ts), como cualquier otra página: nada la delata.
  const appPolicy = (csp: string | null) => (csp ?? "").replace(/'nonce-[^']+'/, "'nonce-x'");
  const missing = await ask("/no-existe-de-verdad");
  assert.match(missing.headers.get("content-security-policy") ?? "", /^default-src 'self'/);
  assert.equal(appPolicy(internal.headers.get("content-security-policy")), appPolicy(missing.headers.get("content-security-policy")));
  // Las rutas «típicas» no existen: pasan de largo y Next responde su 404.
  for (const decoy of ["/admin", "/panel", "/administracion", "/admin/users"]) {
    const res = await ask(decoy);
    assert.equal(res.headers.get("x-middleware-rewrite"), null, decoy);
    assert.equal(appPolicy(res.headers.get("content-security-policy")), appPolicy(missing.headers.get("content-security-policy")), decoy);
  }
});

test("middleware: ADMIN_PANEL_PATH moves the panel; the old default stops being special", async () => {
  process.env.ADMIN_PANEL_PATH = "/entrada-privada";
  try {
    assert.match((await ask("/entrada-privada")).headers.get("x-middleware-rewrite") ?? "", /\/panel-interno$/);
    assert.equal((await ask("/revision")).headers.get("x-middleware-rewrite"), null);
  } finally {
    delete process.env.ADMIN_PANEL_PATH;
  }
});

test("the rules offered by the panel are exactly the ones the server accepts", () => {
  assert.deepEqual(WEB_RULES, SERVER_RULES);
  const terms = readFileSync("content/legal/terminos.ts", "utf8");
  for (const row of Object.values(SERVER_RULES)) assert.ok(terms.includes(row), row);
});

test("the panel is not in robots, sitemap or any link except the admin-only menu entry", () => {
  const files = ["public", "app"];
  assert.ok(files.length > 0);
  for (const f of ["public/robots.txt", "app/robots.ts", "app/sitemap.ts"]) {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {}
    assert.ok(!/revision|panel-interno|admin/i.test(text), f);
  }
  const shell = readFileSync("components/shell.tsx", "utf8");
  assert.match(shell, /profile\.admin_panel && \(/);
});

test("the panel page and its components load nothing from third parties and never inject HTML", () => {
  for (const f of ["components/admin/panel-app.tsx", "components/admin/panel-home.tsx", "components/admin/mfa-gate.tsx", "lib/admin-api.ts", "app/panel-interno/page.tsx"]) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/.test(text), f);
    assert.ok(!/https?:\/\//.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${f}: sin URLs externas`);
    assert.ok(!/crisp|posthog|sentry|track\(/i.test(text), `${f}: sin Crisp ni telemetría`);
  }
});

test("the only inline script the design adds is allowed by hash, and the hash matches the real script", async () => {
  const { HEAD_BOOT } = await import("../lib/theme");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.ok(layout.includes("__html: HEAD_BOOT"), "el layout escribe exactamente el script que se hashea");
  const hash = await cspHash(HEAD_BOOT);
  assert.match(hash, /^sha256-[A-Za-z0-9+/]{43}=$/);
  const res = await middleware(new NextRequest("http://localhost:3000/revision"));
  assert.ok((res.headers.get("content-security-policy") ?? "").includes(`'${hash}'`));
  assert.ok(!(res.headers.get("content-security-policy") ?? "").includes("unsafe-inline'") || /style-src-attr 'unsafe-inline'/.test(res.headers.get("content-security-policy") ?? ""));
});
