import { test, expect, type Page } from "@playwright/test";
// Landing de Dream design (skill dream-design-system): estructura, cabecera
// flotante, FAQ, movimiento reducido y sin scroll lateral.
test.use({ serviceWorkers: "block" });

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem("dream-storage-notice-v1", "1"));
  await page.goto("/");
}

test("one h1, the sections, real text and links to the login and the legal pages", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Saca\s*tu mejor\s*nota/i);
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual([
    "Todo lo que necesitas para tu examen",
    "Dream en cifras",
    "Llévate Dream en el móvil",
    "Preguntas frecuentes",
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
  // Nada de tiendas ni idiomas: QR e «Instalar Dream».
  await expect(page.getByRole("img", { name: "Código QR para abrir Dream en el móvil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Instalar Dream" })).toBeVisible();
  await expect(page.getByText(/App Store|Google Play/)).toHaveCount(0);
});

test("keyboard: skip link first, then Dream, Entrar, the menu and the main action", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ir al contenido" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Dream", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Entrar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Probar Dream" }).first()).toBeFocused();
});

test("floating header: the menu opens and closes with Escape; «Empezar» appears after scrolling", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("navigation", { name: "Secciones" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Secciones" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();
  await page.evaluate(() => scrollTo(0, 800));
  await expect(page.locator("header[data-scrolled]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Empezar" })).toBeVisible();
});

test("FAQ: the answer opens and the + turns into ×", async ({ page }) => {
  await open(page);
  const item = page.locator("details").first();
  await item.locator("summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect(item.getByText(/no hace falta tarjeta/)).toBeVisible();
});

test("reduced motion: no scroll-driven animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const scrollDriven = await page.evaluate(
    () => document.getAnimations().filter((a) => a.timeline && !(a.timeline instanceof DocumentTimeline)).length,
  );
  expect(scrollDriven).toBe(0);
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
