import { test, expect, type Page } from "@playwright/test";
// Landing → login (prompt «landing, login y bienvenida» §3): the Orb travels
// with a View Transition, the login enters in order and a message appears
// without making the rest jump.
test.use({ serviceWorkers: "block" });

async function signedOut(page: Page) {
  await page.addInitScript(() => localStorage.setItem("dream-storage-notice-v1", "1"));
}

test("«Probar Dream» makes the Orb travel to the login (280 ms, ease-out)", async ({ page }) => {
  await signedOut(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Record the transition's animations while it runs.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const tick = () => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect & { pseudoElement?: string };
        if (effect.pseudoElement) seen.push(`${effect.pseudoElement} ${effect.getTiming().duration}`);
      }
      if (seen.length < 50) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("link", { name: "Probar Dream" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar en Dream" })).toBeVisible();
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  expect(seen).toContain("::view-transition-group(dream-orb) 280");
  await expect.poll(() => page.evaluate(() => "orbTransition" in document.documentElement.dataset)).toBe(false);
});

test("reduced motion: no transition, the login just fades in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedOut(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const state = await page.evaluate(() => ({
    flag: "orbTransition" in document.documentElement.dataset,
    moving: document
      .getAnimations()
      .filter((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => k.transform && k.transform !== "none"))
      .filter((a) => (a.effect as KeyframeEffect).getTiming().iterations !== Infinity).length,
  }));
  expect(state).toEqual({ flag: false, moving: 0 });
});

test("the login enters in order: sticker, title, text, Google, links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signedOut(page);
  await page.goto("/login");
  const delay = (sel: string) =>
    page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).animationDelay) * 1000);
  const order = [
    await delay("main a[aria-label='Dream, inicio']"),
    await delay("main h1"),
    await delay("main h1 + p"),
    await delay("main button"),
    await delay("main p:has(a[href='/terminos'])"),
  ];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(new Set(order).size).toBe(5);
  expect(Math.max(...order)).toBeLessThanOrEqual(200);
  // The button works from the first frame.
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
});

test("a message appears or goes without the links jumping (they glide)", async ({ page }) => {
  await signedOut(page);
  // Record the glides (Element.animate on [data-glide], transform only).
  await page.addInitScript(() => {
    const glides: string[] = [];
    (window as unknown as { glides: string[] }).glides = glides;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this instanceof HTMLElement && this.hasAttribute("data-glide"))
        glides.push(JSON.stringify(keyframes));
      return animate.call(this, keyframes, options);
    };
  });
  await page.route("**/auth/v1/settings", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/login?error=cancelled");
  const alert = page.locator("main").getByRole("alert");
  await expect(alert).toContainText("Has cancelado el acceso con Google.");
  await alert.getByRole("button", { name: "Volver a intentarlo" }).click();
  await expect(alert).toContainText("No se pudo preparar el acceso");
  const glides = await page.evaluate(() => (window as unknown as { glides: string[] }).glides);
  expect(glides.length).toBeGreaterThan(0);
  for (const g of glides) expect(g).toMatch(/^\[\{"transform":"translateY\(-?[\d.]+px\)"\},\{"transform":"none"\}\]$/);
});

test("reduced motion: the links do not glide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedOut(page);
  await page.route("**/auth/v1/settings", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/login?error=cancelled");
  const alert = page.locator("main").getByRole("alert");
  await alert.getByRole("button", { name: "Volver a intentarlo" }).click();
  await expect(alert).toContainText("No se pudo preparar el acceso");
  const moving = await page
    .locator("main p:has(a[href='/terminos'])")
    .evaluate((el) => (el as HTMLElement).getAnimations().filter((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => k.transform)).length);
  expect(moving).toBe(0);
});
