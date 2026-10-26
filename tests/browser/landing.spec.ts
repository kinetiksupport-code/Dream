import { test, expect, type Page } from "@playwright/test";
// Landing con scroll cinematográfico (docs/diseno/landing-storyboard.md):
// structure, the pinned signature scene only on desktop, the scroll-driven
// details and the static version (reduced motion / no support).
test.use({ serviceWorkers: "block" });

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem("dream-storage-notice-v1", "1"));
  await page.goto("/");
}

test("one h1, a heading per scene, real text and links to the login and the legal pages", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Saca tu mejor nota/);
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual([
    "Sube tus apuntes.",
    "Entiende, no copies.",
    "Tests y simulacros.",
    "Mira cómo avanzas.",
    "Dream es gratis.",
  ]);
  for (const link of await page.getByRole("link", { name: "Probar Dream" }).all())
    await expect(link).toHaveAttribute("href", "/login");
  await expect(page.getByText("Gratis. Entra con Google.")).toBeVisible();
  const legal = page.getByRole("navigation", { name: "Legal" });
  for (const [name, href] of [
    ["Privacidad", "/privacidad"],
    ["Términos", "/terminos"],
    ["Cookies", "/cookies"],
    ["Aviso legal", "/aviso-legal"],
  ])
    await expect(legal.getByRole("link", { name })).toHaveAttribute("href", href);
  // The chat example and the progress number are text, not pictures.
  await expect(page.getByRole("list", { name: "Ejemplo de conversación" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("82 %")).toBeAttached();
});

test("keyboard: skip link first, then Dream, Entrar and every action", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ir al contenido" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Dream", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Entrar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Probar Dream" }).first()).toBeFocused();
});

test("desktop: the notes scene is pinned and the sheet becomes the exam card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const stage = page.locator("section[aria-labelledby='notes-title'] > div").first();
  expect(await stage.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  const opacity = () =>
    page.getByText("Examen de Biología").evaluate((el) => Number(getComputedStyle(el.parentElement!).opacity));
  await page.locator("#notes-title").scrollIntoViewIfNeeded();
  const section = page.locator("section[aria-labelledby='notes-title']");
  const top = await section.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  const start = await opacity();
  await page.evaluate((y) => scrollTo(0, y + innerHeight * 0.7), top);
  await page.waitForTimeout(200);
  const end = await opacity();
  expect(start).toBeLessThan(0.2);
  expect(end).toBeGreaterThan(0.95);
  // While pinned, the title stays on screen (readable hold).
  await expect(page.locator("#notes-title")).toBeInViewport();
});

test("phones: nothing is pinned and every scene reads in order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const stage = page.locator("section[aria-labelledby='notes-title'] > div").first();
  expect(await stage.evaluate((el) => getComputedStyle(el).position)).toBe("static");
});

test("the progress number rolls to 82 % and the bar fills as the card arrives", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.locator("#progress-title").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 200));
  await page.waitForTimeout(300);
  const digits = await page.locator("[class*=digit]").evaluateAll((cols) =>
    cols.map((c) => {
      const box = c.getBoundingClientRect();
      const shown = [...c.children].find((d) => Math.abs(d.getBoundingClientRect().top - box.top) < 2);
      return shown?.textContent;
    }),
  );
  expect(digits).toEqual(["8", "2"]);
});

test("reduced motion: no scroll animation, no pin, everything in its final place", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const stage = page.locator("section[aria-labelledby='notes-title'] > div").first();
  expect(await stage.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  const scrollDriven = await page.evaluate(
    () => document.getAnimations().filter((a) => a.timeline && !(a.timeline instanceof DocumentTimeline)).length,
  );
  expect(scrollDriven).toBe(0);
  await expect(page.getByText("Examen de Biología")).toBeVisible();
  expect(await page.getByText("Examen de Biología").evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe("1");
});

for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
])
  test(`no sideways scroll at ${vp.width}×${vp.height}, top to bottom`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += vp.height) {
      await page.evaluate((top) => scrollTo(0, top), y);
      const wide = await page.evaluate(() => document.scrollingElement!.scrollWidth > innerWidth + 1);
      expect(wide, `at ${y}px`).toBe(false);
    }
  });
