import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COOKIEBOT_DEFAULT_CBID,
  cookiebotConfig,
  cookiebotPage,
  consentFromCookie,
  cookieDeclarationScript,
  cookiebotScript,
  grantPreferences,
  readConsent,
  renewConsent,
} from "../lib/cookie-consent";
import { clearCrispCookies, clearCrispStorage } from "../lib/consent-cleanup";
import { appCsp, cspHeaderName } from "../lib/csp";

// Cookiebot (docs/cookies-inventario.md, docs/cookiebot-panel.md).
test("config: Carlos's id and «auto» by default; env can switch to manual, .eu or off", () => {
  const def = cookiebotConfig({});
  assert.deepEqual(def, { enabled: true, cbid: COOKIEBOT_DEFAULT_CBID, blockingMode: "auto", tld: "com" });
  assert.equal(cookiebotScript(def), "https://consent.cookiebot.com/uc.js");
  assert.equal(cookieDeclarationScript(def), `https://consent.cookiebot.com/${COOKIEBOT_DEFAULT_CBID}/cd.js`);
  const eu = cookiebotConfig({ blockingMode: "manual", tld: "eu", cbid: "11111111-2222-3333-4444-555555555555" });
  assert.equal(eu.blockingMode, "manual");
  assert.equal(cookiebotScript(eu), "https://consent.cookiebot.eu/uc.js");
  assert.equal(eu.cbid, "11111111-2222-3333-4444-555555555555");
  assert.equal(cookiebotConfig({ cbid: "off" }).enabled, false);
  assert.equal(cookiebotConfig({ cbid: "\"><script>" }).enabled, false, "un id raro nunca llega al HTML");
});

test("Cookiebot only on the landing, Términos, Privacidad and /cookies", () => {
  for (const p of ["/", "/terminos", "/privacidad", "/cookies"]) assert.ok(cookiebotPage(p), p);
  for (const p of ["/login", "/chat", "/settings", "/aviso-legal", "/subir", "/revision", "/panel-interno", "/auth/callback", "/.well-known/security.txt", "/cookies/x"])
    assert.ok(!cookiebotPage(p), p);
});

test("consent from the CookieConsent cookie when Cookiebot is not on the page (the app)", () => {
  const real = (p: boolean, s: boolean) =>
    `CookieConsent=${encodeURIComponent(`{stamp:'abc',necessary:true,preferences:${p},statistics:${s},marketing:false,method:'explicit',ver:1,utc:1761600000000,region:'es'}`)}`;
  assert.deepEqual(consentFromCookie(`a=1; ${real(true, false)}; b=2`), { ready: false, decided: true, preferences: true, statistics: false });
  assert.deepEqual(readConsent({}, real(false, true)), { ready: false, decided: true, preferences: false, statistics: true });
  assert.deepEqual(consentFromCookie(`CookieConsent=${encodeURIComponent(JSON.stringify({ preferences: true, statistics: false }))}`).preferences, true);
  for (const c of [undefined, "", "CookieConsent=-1", "CookieConsent=%E0%A4%A", "XCookieConsent=preferences:true"])
    assert.deepEqual(consentFromCookie(c), { ready: false, decided: false, preferences: false, statistics: false }, String(c));
  // Cookiebot on the page wins over the cookie.
  assert.equal(readConsent({ Cookiebot: { hasResponse: false } }, real(true, true)).preferences, false);
});

test("consent: silence is never consent, and only a real decision counts", () => {
  assert.deepEqual(readConsent(undefined), { ready: false, decided: false, preferences: false, statistics: false });
  assert.deepEqual(readConsent({}), { ready: false, decided: false, preferences: false, statistics: false });
  // Banner on screen, nothing pressed: Cookiebot is ready but there is no consent.
  assert.deepEqual(readConsent({ Cookiebot: { hasResponse: false, consent: { preferences: true } } }), { ready: true, decided: false, preferences: false, statistics: false });
  assert.deepEqual(readConsent({ Cookiebot: { hasResponse: true, consent: { preferences: true, statistics: false } } }), { ready: true, decided: true, preferences: true, statistics: false });
});

test("«Permitir y abrir» grants Preferences, keeps Statistics as it was, never Marketing", () => {
  const calls: boolean[][] = [];
  const win = { Cookiebot: { hasResponse: true, consent: { preferences: false, statistics: true }, submitCustomConsent: (...a: boolean[]) => void calls.push(a) } };
  assert.equal(grantPreferences(win), true);
  assert.deepEqual(calls, [[true, true, false]]);
  assert.equal(grantPreferences({}), false, "sin Cookiebot no hay registro: vale solo para esta visita");
  let renewed = 0;
  assert.equal(renewConsent({ Cookiebot: { renew: () => void renewed++ } }), true);
  assert.equal(renewed, 1);
  assert.equal(renewConsent({}), false);
});

test("withdrawing consent removes Crisp's cookies and storage, and nothing else", () => {
  const jar = new Map([["crisp-client/session/abc", "1"], ["crisp-client/socket/abc", "1"], ["other", "1"]]);
  const writes: string[] = [];
  const doc = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      jar.delete(value.split("=")[0]);
    },
  };
  assert.equal(clearCrispCookies(doc, "www.edudream.es"), 2);
  assert.deepEqual([...jar.keys()], ["other"]);
  assert.ok(writes.some((w) => w.includes("domain=.edudream.es")), "también el dominio padre");
  const store = new Map([["crisp-client/session", "x"], ["dream-theme", "dark"], ["crisp_x", "y"]]);
  const storage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => void store.delete(k),
  };
  assert.equal(clearCrispStorage([storage, null]), 2);
  assert.deepEqual([...store.keys()], ["dream-theme"]);
});

test("CSP: nonce + strict-dynamic, Cookiebot and Crisp hosts, only style-src is unsafe-inline", () => {
  const csp = appCsp("abc", {
    supabaseUrl: "https://ref.supabase.co",
    dreamApiUrl: "https://ref.supabase.co/functions/v1/dream-api",
    posthogHost: "https://eu.i.posthog.com",
    sentryDsn: "https://k@o1.ingest.de.sentry.io/2",
  }, ["sha256-xyz"]);
  const dir = Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d]));
  assert.match(dir["script-src"], /'nonce-abc' 'sha256-xyz' 'strict-dynamic' https:\/\/consent\.cookiebot\.com https:\/\/consentcdn\.cookiebot\.com/);
  assert.doesNotMatch(dir["script-src"], /unsafe-inline|unsafe-eval/);
  assert.match(dir["connect-src"], /https:\/\/consent\.cookiebot\.com https:\/\/consentcdn\.cookiebot\.com/);
  assert.match(dir["connect-src"], /https:\/\/eu\.i\.posthog\.com https:\/\/eu-assets\.i\.posthog\.com https:\/\/o1\.ingest\.de\.sentry\.io/);
  assert.match(dir["frame-src"], /https:\/\/consentcdn\.cookiebot\.com/);
  assert.match(dir["img-src"], /https:\/\/imgsct\.cookiebot\.com/);
  assert.doesNotMatch(csp, /http:\/\//, "solo https");
  assert.equal(csp.match(/'unsafe-inline'/g)?.length, 1);
  assert.match(dir["style-src"], /'unsafe-inline'/);
  assert.equal(dir["frame-ancestors"], "frame-ancestors 'none'");
  assert.equal(dir["object-src"], "object-src 'none'");
  assert.match(appCsp("n", { development: true }), /'unsafe-eval'/);
  assert.equal(cspHeaderName(undefined), "Content-Security-Policy");
  assert.equal(cspHeaderName("report-only"), "Content-Security-Policy-Report-Only");
  assert.equal(cspHeaderName("off"), null);
});

test("Cookiebot is installed once, in the root layout, with the nonce and without async/defer", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.equal(layout.match(/id="Cookiebot"/g)?.length, 1);
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(layout, /nonce=\{nonce\}/);
  assert.doesNotMatch(layout, /\basync\b(?!\s+function)|\bdefer\b|type="text\/javascript"/);
  // Nadie más carga uc.js.
  for (const f of ["components/providers.tsx", "app/page.tsx", "components/legal-page.tsx"]) assert.doesNotMatch(readFileSync(f, "utf8"), /uc\.js/);
  // Ni gtag ni Google Tag Manager.
  assert.doesNotMatch(layout, /gtag|googletagmanager/);
});

test("the service worker never caches anything from another origin (Cookiebot included)", () => {
  const sw = readFileSync("public/sw.js", "utf8");
  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/);
});
