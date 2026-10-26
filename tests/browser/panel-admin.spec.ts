import { test, expect, type Page } from "@playwright/test";
import { TERMS_VERSION } from "../../lib/consent";

// Panel de administración (B5) en un navegador real, con datos sintéticos y el
// servidor simulado (no se llama a Supabase ni a dream-api). Comprueba lo que
// ve cada persona y que la CSP estricta no rompe el panel.
const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
const ADMIN_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const STUDENT = "bbbbbbbb-0000-4000-8000-000000000002";
const VICTIM = "cccccccc-0000-4000-8000-000000000003";
const NOT_FOUND = "No encontramos esta página";

const session = (id: string, email: string) => ({
  access_token: `synthetic.${id}.token`,
  refresh_token: "synthetic",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: "bearer",
  user: { id, email, aud: "authenticated", app_metadata: { provider: "google" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});
const profile = (extra: Record<string, unknown> = {}) => ({
  email: "synthetic@example.test",
  display_name: "Cuenta de prueba",
  age_band: "18_plus",
  ai_consent_at: "2026-10-01T00:00:00Z",
  terms_accepted_at: "2026-10-01T00:00:00Z",
  terms_version: TERMS_VERSION,
  onboarding_completed: true,
  onboarding_step: 6,
  nickname: "Prueba",
  interests: ["Matemáticas"],
  ...extra,
});

async function signIn(page: Page, id: string, email: string) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: session(id, email) });
}

const inbox = {
  appeals: [
    { id: "a1", user_id: STUDENT, user_short: "bbbbbbbb", user_email: "a***@example.test", body: '<img src=x onerror="window.__xss=1"> Creo que ha sido un error, por favor revisadlo.', created_at: "2026-10-20T10:00:00Z", days_left: 27 },
  ],
  observations: [{ id: "o1", user_id: VICTIM, user_short: "cccccccc", user_email: "v***@example.test", status: "revision_pendiente", entries: 5, shared: true, ends_at: "2026-10-23T10:00:00Z", ip_prefix: "abcdef012345" }],
  proposals: [{ id: "p1", user_id: VICTIM, user_short: "cccccccc", user_email: "v***@example.test", kind: "baneo", rule: "G-MULTI", until: null, decided_by: "sistema", created_at: "2026-10-22T10:00:00Z" }],
  active_bans: [],
  ip_blocks: [{ ip_prefix: "0123456789ab", until: "2026-10-23T12:00:00Z", rule: "G-BOT" }],
  events: [{ user_id: VICTIM, user_short: "cccccccc", user_email: "v***@example.test", rule: "G-MULTI", origin: "automatico", severity: "alta", created_at: "2026-10-22T09:00:00Z" }],
};

/** dream-api simulado. `admin` decide si quien llama es el administrador. */
async function mockApi(page: Page, opts: { admin: boolean; aal2?: boolean }) {
  const calls: string[] = [];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const action = String(body.action);
    calls.push(action);
    if (action === "profile")
      return route.fulfill({ json: { profile: profile(opts.admin ? { admin_panel: { path: "/revision" } } : {}), service_ready: true, ban: null } });
    if (action.startsWith("admin_")) {
      // Un no administrador recibe lo mismo que ante una acción inexistente.
      if (!opts.admin) return route.fulfill({ status: 400, json: { error: "Acción no válida." } });
      if (action === "admin_mfa_status") return route.fulfill({ json: { admin: true, aal2: opts.aal2 !== false, fresh: opts.aal2 !== false } });
      if (action === "admin_session_start") return route.fulfill({ json: { ok: true, idle_minutes: 30 } });
      if (action === "admin_inbox") return route.fulfill({ json: inbox });
      if (action === "admin_sanction_resolve" && !body.confirm_token) return route.fulfill({ json: { needs_confirmation: true, confirm_token: "t.0", expires_in: 120 } });
      if (action === "admin_sanction_resolve") return route.fulfill({ json: { ok: true } });
      if (action === "admin_user")
        return route.fulfill({ json: { user_short: "cccccccc", user_email: "v***@example.test", ban: { banned: false }, sanctions: inbox.proposals, events: inbox.events, appeals: [], observations: inbox.observations } });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  return calls;
}

test("signed out, the usual admin paths look exactly like a missing page and the panel path sends you to Inicio", async ({ page, request }) => {
  const texts: string[] = [];
  for (const path of ["/revision", "/admin", "/panel", "/administracion", "/panel-interno", "/no-existe-nada"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    if (path === "/revision") continue;
    await page.goto(path);
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    texts.push(await page.locator("main").innerText());
  }
  expect(new Set(texts).size, "mismo contenido visible en todas").toBe(1);
  await page.goto("/revision");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  // Cabeceras: solo la ruta del panel lleva la CSP estricta y no se puede encuadrar ni cachear.
  const panel = await request.get("/revision");
  expect(panel.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'sha256-[^']+' 'strict-dynamic'/);
  expect(panel.headers()["x-frame-options"]).toBe("DENY");
  expect(panel.headers()["cache-control"]).toContain("no-store");
  expect(panel.headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get("/admin")).headers()["content-security-policy"]).toBeUndefined();
  expect((await request.get("/panel-interno")).headers()["content-security-policy"]).toBeUndefined();
});

test("a signed-in student with another email is sent to Inicio from the panel path and has no menu entry", async ({ page }) => {
  await signIn(page, STUDENT, "alumno@example.test");
  const calls = await mockApi(page, { admin: false });
  await page.goto("/chat");
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
  await expect(page.getByText("Panel de administración")).toHaveCount(0);
  await page.goto("/revision");
  await expect.poll(() => calls.includes("admin_mfa_status")).toBe(true);
  await expect(page).toHaveURL((url) => url.pathname === "/chat");
  expect(calls.filter((a) => a.startsWith("admin_") && a !== "admin_mfa_status")).toEqual([]);
  await expect(page.getByText("Panel de administración")).toHaveCount(0);
});

test("the administrator gets the link, the inbox and a two-step confirmation; hostile text is never executed", async ({ page }) => {
  const violations: string[] = [];
  const outside: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
  });
  page.on("request", (r) => {
    const host = new URL(r.url()).host;
    if (!["localhost:3000", "localhost:3111"].includes(host) && !r.url().startsWith("data:") && !r.url().startsWith("blob:") && !r.url().includes("supabase.co")) outside.push(r.url());
  });
  await signIn(page, ADMIN_ID, "hellodream@edudream.es");
  const calls = await mockApi(page, { admin: true });
  await page.goto("/chat");
  const link = page.getByRole("link", { name: "Panel de administración" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { name: "Panel de administración", level: 1 })).toBeVisible();
  expect(calls).toContain("admin_session_start");
  await expect(page.getByText("Apelaciones y reclamaciones")).toBeVisible();
  await expect(page.getByText("Plazo: 27 días de 30")).toBeVisible();
  // El texto del alumno se enseña como texto: no se ejecuta ni crea elementos.
  await expect(page.getByText('<img src=x onerror="window.__xss=1">', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator("img[src='x']").count()).toBe(0);
  // Correo enmascarado; ni IP ni huella completa.
  const text = await page.locator("main").innerText();
  expect(text).toContain("a***@example.test");
  expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  expect(text).not.toMatch(/[0-9a-f]{64}/);
  // Baneo permanente propuesto: confirmar pide el segundo paso.
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Confirmar: Confirmar sanción");
  await page.screenshot({ path: "docs/diseno/panel/panel-confirmar.png", fullPage: false });
  await dialog.getByRole("button", { name: "Sí, confirmar" }).click();
  await expect(page.getByRole("status")).toContainText("Sanción confirmada.");
  await page.screenshot({ path: "docs/diseno/panel/panel-bandeja.png", fullPage: true });
  // Ficha de la cuenta.
  await page.getByRole("button", { name: /v\*\*\*@example\.test · cccccccc/ }).first().click();
  const card = page.getByRole("dialog");
  await expect(card.getByRole("button", { name: "Ban user" })).toBeVisible();
  await page.screenshot({ path: "docs/diseno/panel/panel-ficha.png", fullPage: false });
  expect(violations, violations.join("\n")).toEqual([]);
  expect(outside, outside.join("\n")).toEqual([]);
});

test("an administrator without the second factor is asked for the code and sees no data", async ({ page }) => {
  await signIn(page, ADMIN_ID, "hellodream@edudream.es");
  const calls = await mockApi(page, { admin: true, aal2: false });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ json: { ...session(ADMIN_ID, "hellodream@edudream.es").user, factors: [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "Panel de Dream" }] } }),
  );
  await page.goto("/revision");
  await expect(page.getByRole("heading", { name: "Código de verificación" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Código" })).toBeVisible();
  expect(calls).not.toContain("admin_inbox");
  await expect(page.getByText("Apelaciones y reclamaciones")).toHaveCount(0);
  await page.screenshot({ path: "docs/diseno/panel/panel-segundo-factor.png", fullPage: false });
});

test("the panel works in dark mode and with reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signIn(page, ADMIN_ID, "hellodream@edudream.es");
  await mockApi(page, { admin: true });
  await page.goto("/revision");
  await expect(page.getByRole("heading", { name: "Panel de administración", level: 1 })).toBeVisible();
  await page.screenshot({ path: "docs/diseno/panel/panel-bandeja-oscuro.png", fullPage: true });
});

test("the menu never renders a panel link whose path is not a plain local path", async ({ page }) => {
  await signIn(page, STUDENT, "alumno@example.test");
  await page.route("**/functions/v1/dream-api", (route) => {
    const action = String((route.request().postDataJSON() as Record<string, unknown>).action);
    if (action === "profile") return route.fulfill({ json: { profile: profile({ admin_panel: { path: "javascript:alert(1)" } }), service_ready: true, ban: null } });
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/chat");
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
  await expect(page.getByText("Panel de administración")).toHaveCount(0);
});
