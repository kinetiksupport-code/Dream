import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cspViolations, watchCsp } from "./cookiebot-fixture";

// Banner REAL de Cookiebot con la cuenta de Carlos (Bloque 6). Cookiebot solo se
// enseña en el dominio registrado, así que el navegador de la prueba pide
// https://www.edudream.es/… y cada petición se sirve desde la build local
// (PLAYWRIGHT_BASE_URL). Necesita red hacia consent.cookiebot.com y deja
// registros de consentimiento de prueba en la cuenta. Opcional:
//   COOKIEBOT_REAL=1 PLAYWRIGHT_BASE_URL=http://localhost:3111 npx playwright test tests/browser/cookiebot-real.spec.ts
test.skip(!process.env.COOKIEBOT_REAL, "Solo con COOKIEBOT_REAL=1 (red y cuenta real de Cookiebot).");

const HOST = "https://www.edudream.es";
const SHOTS = "docs/capturas/cookies";
const LOCAL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const DIALOG = "#CybotCookiebotDialog";
const ACCEPT = "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll";
const DECLINE = "#CybotCookiebotDialogBodyButtonDecline";

async function open(browser: Browser, opts: { width: number; height: number; dark?: boolean; bypassCSP?: boolean }) {
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    colorScheme: opts.dark ? "dark" : "light",
    serviceWorkers: "block",
    bypassCSP: opts.bypassCSP,
  });
  await context.route(`${HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${LOCAL}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  await watchCsp(page);
  return { context, page };
}
const banner = (page: Page) => page.locator(DIALOG);

for (const [name, size] of [
  ["movil", { width: 390, height: 844 }],
  ["escritorio", { width: 1440, height: 900 }],
] as const)
  for (const dark of [false, true])
    test(`real banner · ${name} · ${dark ? "oscuro" : "claro"}: capture, same-size buttons, no ×, not a wall`, async ({ browser }) => {
      const { context, page } = await open(browser, { ...size, dark });
      await page.goto(`${HOST}/`);
      await expect(banner(page)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/banner-${name}-${dark ? "oscuro" : "claro"}.png` });
      const accept = await page.locator(ACCEPT).boundingBox();
      const decline = await page.locator(DECLINE).boundingBox();
      expect(accept && decline, "Aceptar y Rechazar en la primera capa").toBeTruthy();
      // 5 · Mismo tamaño (±2 px) y ninguno escondido.
      expect(Math.abs(accept!.width - decline!.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(accept!.height - decline!.height)).toBeLessThanOrEqual(2);
      await expect(page.locator(DECLINE)).toBeInViewport();
      // Sin botón de cerrar.
      await expect(page.locator(`${DIALOG} [aria-label*="errar" i], #CybotCookiebotDialogBodyLevelButtonClose`)).toHaveCount(0);
      // No es un muro: deja ver y usar al menos un tercio de la pantalla.
      const box = await banner(page).boundingBox();
      expect(box!.height, `el banner ocupa ${Math.round(box!.height)} de ${size.height} px`).toBeLessThan(size.height * 0.66);
      expect(await cspViolations(page)).toEqual([]);
      await context.close();
    });

test("real banner · 6: scroll, navigation and waiting keep it on screen and store no consent", async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 844 });
  await page.goto(`${HOST}/`);
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(3000);
  await page.goto(`${HOST}/privacidad`);
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  expect((await context.cookies()).map((c) => c.name)).not.toContain("CookieConsent");
  await context.close();
});

test("real banner · decline, then «Configurar cookies» (renew) opens it again; details panel", async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 844 });
  await page.goto(`${HOST}/cookies`);
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  await page.locator(DECLINE).click();
  await expect(banner(page)).toBeHidden();
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === "CookieConsent")).toBe(true);
  const consent = (await context.cookies()).find((c) => c.name === "CookieConsent");
  expect(decodeURIComponent(consent!.value)).toMatch(/preferences:false/);
  const days = (consent!.expires * 1000 - Date.now()) / 86_400_000;
  test.info().annotations.push({ type: "CookieConsent", description: `caduca en ${Math.round(days)} días` });
  await page.getByRole("button", { name: "Configurar cookies" }).click();
  await expect(banner(page)).toBeVisible();
  const details = page.locator("#CybotCookiebotDialogNavDetails");
  if (await details.count()) {
    await details.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/panel-preferencias-movil.png` });
  }
  // La declaración automática en /cookies, dentro de la página.
  await page.keyboard.press("Escape");
  await expect(page.locator(".CookieDeclaration, #CookieDeclarationUserStatusPanel").first()).toBeAttached({ timeout: 15_000 });
  await expect(page.getByTestId("cookie-table")).toHaveCount(0);
  expect(await cspViolations(page)).toEqual([]);
  await context.close();
});

test("real banner · blocking mode «auto» on this plan: what it does (reported, not asserted)", async ({ browser }) => {
  const { context, page } = await open(browser, { width: 1440, height: 900 });
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (/cookiebot|blocking/i.test(m.text())) warnings.push(`${m.type()}: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${HOST}/`);
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  const blocked = await page.evaluate(() => [...document.scripts].filter((s) => s.type === "text/plain").map((s) => s.src || "inline"));
  test.info().annotations.push({ type: "auto-blocking", description: JSON.stringify({ blocked, warnings }) });
  await context.close();
});

test("real banner · 10: axe finds no serious problems in the banner", async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 844, bypassCSP: true });
  await page.goto(`${HOST}/`);
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
  const found = await page.evaluate(async (sel) => {
    const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run({ include: [sel] }, { resultTypes: ["violations"] });
    return r.violations.map((v) => `${v.impact}: ${v.id} (${v.nodes.length})`);
  }, DIALOG);
  test.info().annotations.push({ type: "axe", description: found.join("; ") || "sin problemas" });
  const focus = await page.evaluate((sel) => !!document.activeElement?.closest(sel), DIALOG);
  test.info().annotations.push({ type: "foco", description: focus ? "el foco está en el banner" : "el foco NO está en el banner" });
  expect(found.filter((f) => /^(serious|critical)/.test(f))).toEqual([]);
  await context.close();
});
