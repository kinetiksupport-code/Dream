import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COOKIEBOT_DEFAULT_CBID,
  cookiebotConfig,
  cookiebotExcluded,
  cookieDeclarationScript,
  cookiebotScript,
  grantPreferences,
  readConsent,
  renewConsent,
} from "../lib/cookie-consent";
import { clearCrispCookies, clearCrispStorage } from "../lib/consent-cleanup";

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

test("no Cookiebot on the admin panel, the sign-in callback or well-known files", () => {
  for (const p of ["/revision", "/panel-interno", "/auth/callback", "/.well-known/security.txt"]) assert.ok(cookiebotExcluded(p, "/revision"), p);
  for (const p of ["/", "/login", "/chat", "/settings", "/cookies", "/subir", "/revision-2"]) assert.ok(!cookiebotExcluded(p, "/revision"), p);
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
