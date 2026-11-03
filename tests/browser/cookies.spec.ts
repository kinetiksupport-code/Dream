import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cspViolations, fakeCookiebot, fakeCrisp, signedIn, watchCsp } from "./cookiebot-fixture";

// Bloque 6 de Cookiebot con el Cookiebot de prueba (la API pública de uc.js).
// El banner real de la cuenta de Carlos se prueba en cookiebot-real.spec.ts.
const SHOTS = "docs/capturas/cookies";
// Lo único que puede haber antes del consentimiento (docs/cookies-inventario.md).
const NECESSARY = /^(sb-[a-z]+-auth-token(-code-verifier)?|dream-(theme|reading|ai-mode|privacy-v1|crisp-notice|login-pending|qr-token|qr-device:.*|storage-notice-v1))$/;

async function storageKeys(page: Page) {
  return page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
}
const crispCookies = async (page: Page) =>
  (await page.context().cookies()).filter((c) => c.name.startsWith("crisp-client"));

test("1 · first visit, nothing pressed: banner, only necessary storage, no cookies, no Crisp", async ({ page }) => {
  const cb = await fakeCookiebot(page);
  const crisp = await fakeCrisp(page);
  await watchCsp(page);
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" })).toBeVisible();
  expect(cb.uc).toBe(1);
  const script = page.locator("script#Cookiebot");
  await expect(script).toHaveAttribute("data-cbid", "d0c2f6fa-09c9-4036-8807-4ed977783c45");
  await expect(script).toHaveAttribute("data-blockingmode", "auto");
  await expect(script).toHaveAttribute("src", "https://consent.cookiebot.com/uc.js");
  expect(await page.context().cookies()).toEqual([]);
  for (const key of await storageKeys(page)) expect(key, `no listado: ${key}`).toMatch(NECESSARY);
  expect(await storageKeys(page), "el tema solo se guarda si el alumno lo elige").not.toContain("dream-theme");
  expect(crisp.loads).toBe(0);
  expect(await cspViolations(page)).toEqual([]);
});

test("6 · scrolling, navigating and waiting is not consent; the site works with the banner on", async ({ page }) => {
  await fakeCookiebot(page);
  await page.goto("/");
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(1500);
  const banner = page.getByRole("dialog", { name: "Tus cookies, tu decisión" });
  await expect(banner).toBeVisible();
  // No es un muro: la navegación se puede usar con el banner puesto.
  await page.mouse.wheel(0, -4000);
  await page.goto("/privacidad");
  await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" })).toBeVisible();
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain("CookieConsent");
  expect(await page.evaluate(() => (window as unknown as { Cookiebot: { hasResponse: boolean } }).Cookiebot.hasResponse)).toBe(false);
});

test("only the landing and the legal pages show Cookiebot; the app never does, not even after a client-side jump", async ({ page }) => {
  const cb = await fakeCookiebot(page);
  await signedIn(page);
  for (const path of ["/login", "/chat", "/settings", "/aviso-legal"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#CybotCookiebotDialog, #CookiebotWidget"), path).toHaveCount(0);
  }
  expect(cb.uc).toBe(0);
  // From the landing into the app without a reload: Cookiebot stays in memory but hidden.
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" })).toBeVisible();
  await page.locator('header a[href="/login"]').first().click();
  // Con sesión, /login lleva directo a /chat.
  await expect(page).toHaveURL(/\/(login|chat)$/);
  await expect(page.locator("#CybotCookiebotDialog")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-cookiebot", "off");
});

test("2 · reject all: one click, the app works, no Crisp, and support asks for permission", async ({ page }) => {
  await fakeCookiebot(page);
  const crisp = await fakeCrisp(page);
  await signedIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Denegar" }).click();
  await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" })).toBeHidden();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  const sheet = page.getByRole("alertdialog");
  await expect(sheet).toContainText("Para abrir el chat de ayuda necesitamos tu permiso para las cookies de preferencias de Crisp.");
  await expect(sheet.getByRole("link", { name: "hellodream@edudream.es" })).toHaveAttribute("href", "mailto:hellodream@edudream.es");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/hoja-permiso-crisp-movil.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/hoja-permiso-crisp-movil-oscuro.png` });
  await sheet.getByRole("button", { name: "Ahora no" }).click();
  await expect(sheet).toBeHidden();
  expect(crisp.loads).toBe(0);
  expect(await crispCookies(page)).toEqual([]);
  // Las demás secciones siguen funcionando.
  await page.goto("/chat");
  await expect(page.locator("main")).toBeVisible();
  expect(crisp.loads).toBe(0);
});

test("2b · «Permitir y abrir» in the app opens the chat for this visit (no Cookiebot there)", async ({ page }) => {
  await fakeCookiebot(page, { preferences: false });
  const crisp = await fakeCrisp(page);
  await signedIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Permitir y abrir" }).click();
  await expect.poll(() => crisp.loads).toBe(1);
  // On a Cookiebot page the same click is recorded in Cookiebot.
  await page.goto("/");
  await page.evaluate(() => (window as unknown as { Cookiebot: { submitCustomConsent: (p: boolean, s: boolean, m: boolean) => void } }).Cookiebot.submitCustomConsent(true, false, false));
  const consent = (await page.context().cookies()).find((c) => c.name === "CookieConsent");
  expect(JSON.parse(decodeURIComponent(consent!.value))).toEqual({ preferences: true, statistics: false, marketing: false });
});

test("3 · accept all: Crisp opens from Ajustes > Ayuda and from the ban screen, and sets its cookies", async ({ page }) => {
  await fakeCookiebot(page);
  const crisp = await fakeCrisp(page);
  await signedIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Permitir todas" }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  // Con permiso, queda el aviso de siempre (una vez) y se abre.
  const sheet = page.getByRole("alertdialog");
  await expect(sheet).not.toContainText("necesitamos tu permiso");
  await sheet.getByRole("button", { name: "Abrir chat" }).click();
  await expect.poll(() => crisp.loads).toBe(1);
  await expect.poll(async () => (await crispCookies(page)).length).toBe(1);
});

test("3b · accepted before: the appeal on the ban screen opens Crisp after the usual notice", async ({ page }) => {
  await fakeCookiebot(page, { preferences: true });
  const crisp = await fakeCrisp(page);
  await signedIn(page, { banned: true });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Hacer una apelación" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Abrir chat" }).click();
  await expect.poll(() => crisp.loads).toBe(1);
});

test("4 · withdraw: «Configurar cookies» → Denegar closes Crisp and removes its cookies", async ({ page }) => {
  await fakeCookiebot(page, { preferences: true });
  const crisp = await fakeCrisp(page);
  await signedIn(page);
  await page.addInitScript(() => localStorage.setItem("dream-crisp-notice", "1"));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  await expect.poll(() => crisp.loads).toBe(1);
  await expect.poll(async () => (await crispCookies(page)).length).toBe(1);
  // Desde la app, «Configurar cookies» lleva a /cookies con el banner abierto.
  await page.getByRole("button", { name: "Configurar cookies" }).click();
  await expect(page).toHaveURL(/\/cookies$/);
  await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" })).toBeVisible();
  await page.getByRole("button", { name: "Denegar" }).click();
  await expect.poll(async () => (await crispCookies(page)).length).toBe(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("crisp")))).toEqual([]);
  // Y no vuelve a cargarse: la hoja pide permiso otra vez.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("necesitamos tu permiso");
  expect(crisp.loads).toBe(1);
});

test("«Configurar cookies» is in every public footer and in Ajustes > Privacidad", async ({ page }) => {
  await fakeCookiebot(page, { preferences: false });
  await signedIn(page);
  for (const path of ["/", "/privacidad", "/terminos", "/cookies", "/aviso-legal", "/settings"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Configurar cookies" }).click();
    await expect(page.getByRole("dialog", { name: "Tus cookies, tu decisión" }), path).toBeVisible();
    await page.getByRole("button", { name: "Denegar" }).click();
  }
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Política de cookies" })).toHaveAttribute("href", "/cookies");
});

test("without Cookiebot (blocker) the button says so and the support sheet still works for this visit", async ({ page }) => {
  await page.route("https://consent.cookiebot.com/**", (r) => r.abort());
  const crisp = await fakeCrisp(page);
  await signedIn(page);
  await page.goto("/privacidad");
  await page.getByRole("button", { name: "Configurar cookies" }).click();
  await expect(page.getByRole("status").filter({ hasText: "No se pudo abrir ahora" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Permitir y abrir" }).click();
  await expect.poll(() => crisp.loads).toBe(1);
});

test("8 · no Cookiebot on the admin panel or the sign-in callback", async ({ page }) => {
  // (Also covered by the allow-list test above.)
  const cb = await fakeCookiebot(page);
  await page.goto("/revision");
  await page.goto("/auth/callback");
  await page.waitForTimeout(500);
  expect(cb.uc).toBe(0);
});

test("9 · no CSP violations or hydration errors on landing, login, /cookies and the app", async ({ page }) => {
  await fakeCookiebot(page, { preferences: false });
  await watchCsp(page);
  await signedIn(page);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text());
  });
  for (const path of ["/", "/login", "/cookies", "/privacidad", "/chat", "/settings", "/dreams", "/exams"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await cspViolations(page), path).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("/cookies: our introduction, Cookiebot's declaration, and the table if it does not load", async ({ page }) => {
  const cb = await fakeCookiebot(page, { preferences: false });
  await page.goto("/cookies");
  await expect(page.getByRole("heading", { name: "Política de cookies", level: 1 })).toBeVisible();
  await expect(page.getByText("Dream no usa cookies de publicidad")).toBeVisible();
  await expect(page.getByText("Declaración de Cookiebot (prueba)")).toBeVisible();
  expect(cb.declaration).toBe(1);
  await expect(page.getByTestId("cookie-table")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/politica-cookies-movil.png`, fullPage: true });

  const blocked = await page.context().newPage();
  await blocked.route("https://consent.cookiebot.com/**", (r) => r.abort());
  await blocked.goto("/cookies");
  await expect(blocked.getByTestId("cookie-table")).toContainText("CookieConsent");
  await expect(blocked.getByTestId("cookie-table")).toContainText("crisp-client");
});

test("10 · accessibility: axe finds no serious problems on /cookies or the support sheet", async ({ browser }) => {
  // axe se inyecta desde node_modules; la CSP lo bloquearía, así que esta prueba la ignora.
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  await fakeCookiebot(page, { preferences: false });
  await signedIn(page);
  const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
  const serious = async () => {
    await page.addScriptTag({ content: axe });
    return page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run({ resultTypes: ["violations"] });
      return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
    });
  };
  await page.goto("/cookies");
  await page.getByText("Declaración de Cookiebot (prueba)").waitFor();
  expect(await serious()).toEqual([]);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Hablar con soporte" }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.waitForTimeout(300);
  expect(await serious()).toEqual([]);
  await context.close();
});

test("no theme is stored any more (Dream is dark only) and an old choice is removed", async ({ page }) => {
  await fakeCookiebot(page, { preferences: false });
  await signedIn(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("dream-theme", "light");
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/settings");
  const theme = () => page.evaluate(() => localStorage.getItem("dream-theme"));
  await expect.poll(theme).toBeNull();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Sistema" })).toHaveCount(0);
});

