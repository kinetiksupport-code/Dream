import type { Page, BrowserContext } from "@playwright/test";

// Cookiebot de prueba (Bloque 6): imita la API pública de uc.js (Cookiebot.consent,
// hasResponse, renew, submitCustomConsent, eventos CookiebotOn*) y pinta un banner
// mínimo con Aceptar / Rechazar / Personalizar. Sirve para probar el código de
// Dream sin depender de la cuenta real; el banner real se prueba en
// cookiebot-real.spec.ts. Solo en pruebas.
const FAKE_UC = String.raw`(() => {
  const fire = (n) => window.dispatchEvent(new Event(n));
  const read = () => {
    const m = document.cookie.match(/(?:^|; )CookieConsent=([^;]+)/);
    try { return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch { return null; }
  };
  let box = null;
  const cb = (window.Cookiebot = {
    consent: { necessary: true, preferences: false, statistics: false, marketing: false },
    hasResponse: false, consented: false, declined: false,
    submitCustomConsent(p, s, m) { save({ preferences: !!p, statistics: !!s, marketing: !!m }); },
    renew() { show(); },
  });
  function apply(c) {
    cb.consent = { necessary: true, ...c };
    cb.hasResponse = true;
    cb.consented = c.preferences || c.statistics;
    cb.declined = !cb.consented;
  }
  function save(c) {
    document.cookie = "CookieConsent=" + encodeURIComponent(JSON.stringify(c)) + "; path=/; max-age=2592000; SameSite=Lax";
    apply(c);
    hide();
    fire("CookiebotOnConsentReady");
    fire(cb.consented ? "CookiebotOnAccept" : "CookiebotOnDecline");
  }
  function hide() { if (box) { box.remove(); box = null; } }
  function show() {
    hide();
    box = document.createElement("div");
    box.id = "CybotCookiebotDialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Tus cookies, tu decisión");
    box.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483000;background:#fff;color:#111;padding:12px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.2);display:flex;gap:8px;flex-wrap:wrap;font:14px system-ui";
    const p = document.createElement("p");
    p.textContent = "Tus cookies, tu decisión";
    p.style.cssText = "flex-basis:100%;margin:0";
    box.append(p);
    for (const [id, label, act] of [
      ["fake-accept", "Permitir todas", () => save({ preferences: true, statistics: true, marketing: false })],
      ["fake-decline", "Denegar", () => save({ preferences: false, statistics: false, marketing: false })],
      ["fake-custom", "Personalizar", () => save({ preferences: true, statistics: false, marketing: false })],
    ]) {
      const b = document.createElement("button");
      b.id = id; b.type = "button"; b.textContent = label; b.onclick = act;
      b.style.cssText = "flex:1;min-height:44px;border:1px solid #333;border-radius:8px;background:#fff;color:#111";
      box.append(b);
    }
    document.body.append(box);
  }
  const saved = read();
  if (saved) apply(saved);
  const ready = () => {
    if (!saved) show();
    fire("CookiebotOnLoad");
    if (saved) fire("CookiebotOnConsentReady");
  };
  if (document.body) ready(); else document.addEventListener("DOMContentLoaded", ready);
})();`;

export interface CookiebotLog {
  uc: number;
  declaration: number;
}

/** Sirve el Cookiebot de prueba en lugar de uc.js y cuenta las peticiones a Cookiebot. */
export async function fakeCookiebot(target: Page | BrowserContext, preset?: { preferences: boolean; statistics?: boolean }) {
  const log: CookiebotLog = { uc: 0, declaration: 0 };
  if (preset) {
    const value = encodeURIComponent(JSON.stringify({ preferences: preset.preferences, statistics: !!preset.statistics, marketing: false }));
    await target.addInitScript((v) => {
      // Solo la primera vez: después manda lo que el alumno decida.
      if (!document.cookie.includes("CookieConsent=")) document.cookie = `CookieConsent=${v}; path=/; max-age=2592000; SameSite=Lax`;
    }, value);
  }
  await target.route("https://consent.cookiebot.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/uc.js")) {
      log.uc++;
      return route.fulfill({ contentType: "application/javascript", body: FAKE_UC });
    }
    if (url.endsWith("/cd.js")) {
      log.declaration++;
      return route.fulfill({
        contentType: "application/javascript",
        body: `(() => { const s = document.getElementById("CookieDeclaration"); const d = document.createElement("div"); d.className = "CookieDeclaration"; d.textContent = "Declaración de Cookiebot (prueba)"; s.after(d); })();`,
      });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  return log;
}

/** Crisp de prueba: guarda una cookie crisp-client/… como el real. */
export async function fakeCrisp(target: Page | BrowserContext) {
  const log = { loads: 0 };
  await target.route("https://client.crisp.chat/**", (route) => {
    log.loads++;
    return route.fulfill({
      contentType: "application/javascript",
      body: `document.cookie = "crisp-client%2Fsession%2Fsite=abc; path=/; max-age=15552000"; localStorage.setItem("crisp-client/session/site", "x"); window.$crisp = { push() {}, is() { return true; } }; window.CRISP_READY_TRIGGER && window.CRISP_READY_TRIGGER();`,
    });
  });
  return log;
}

/** Recoge las violaciones de la CSP de cada página (Bloque 6, prueba 9). */
export async function watchCsp(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    const list: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = list;
    document.addEventListener("securitypolicyviolation", (e) => list.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}
export const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
/** Sesión de prueba y dream-api simulado (como moderacion-alumno.spec.ts). */
export async function signedIn(page: Page, { banned = false } = {}) {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "42345678-1234-1234-1234-123456789abc", email: "qa@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      }),
    );
  }, KEY);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    switch (body.action) {
      case "profile":
        return json({
          profile: { email: "qa@example.test", display_name: "Alex" },
          service_ready: true,
          ban: banned ? { until: "2026-12-15T00:00:00Z", permanent: false, rule: "G-MULTI" } : null,
        });
      case "mod_ban_info":
        return json({ ban: { rule: "G-MULTI", reason: "una persona, una cuenta", until: "2026-12-15T00:00:00Z", permanent: false }, code: "DREAM-K7QM-2XPD", appeals: [], deadline_days: 30 });
      default:
        return json({ items: [], ok: true });
    }
  });
}
