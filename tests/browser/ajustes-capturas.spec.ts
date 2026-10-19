import { test } from "@playwright/test";
import { fullShot } from "./full-shot";
import { mock } from "./design-fixture";
// Visual evidence for docs/diseno/ajustes (PR «estilo ajustes»). Runs only
// when CAPTURAS_DIR is set: phone (390) and desktop (1280), light and dark,
// a confirmation dialog and a reduced-motion pass.
const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 900 },
] as const;

for (const vp of VIEWPORTS)
  for (const scheme of ["light", "dark"] as const)
    test(`ajustes ${vp.name} ${scheme}`, async ({ page }) => {
      const name = scheme === "light" ? "claro" : "oscuro";
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: scheme });
      await mock(page);
      await page.goto("/settings");
      await page.getByRole("heading", { name: "Ajustes" }).waitFor();
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(700);
      await fullShot(page, `${OUT}/ajustes-${vp.name}-${name}.png`);
      await page.getByRole("button", { name: "Borrar historial" }).click();
      await page.getByRole("alertdialog").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${OUT}/ajustes-dialogo-${vp.name}-${name}.png`,
      });
    });

test("ajustes movimiento reducido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await mock(page);
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Ajustes" }).waitFor();
  await page.waitForTimeout(60);
  await page.screenshot({
    path: `${OUT}/ajustes-reducido-60ms-movil-claro.png`,
  });
  await page.waitForTimeout(700);
  await fullShot(page, `${OUT}/ajustes-reducido-movil-claro.png`);
});

// GRABAR=<carpeta>: a short video of the entry, the theme pill and its icon,
// the switch and a confirmation dialog.
const REC = process.env.GRABAR;
test("ajustes grabación", async ({ browser }) => {
  test.skip(!REC, "Set GRABAR to record the video");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: REC as string, size: { width: 1280, height: 800 } },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await mock(page);
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Ajustes" }).waitFor();
  await page.waitForTimeout(1400);
  for (const theme of ["Oscuro", "Claro", "Sistema"]) {
    await page.getByRole("button", { name: theme }).click();
    await page.waitForTimeout(900);
  }
  const sw = page.getByRole("switch", { name: /Lectura fácil/ });
  await sw.click();
  await page.waitForTimeout(700);
  await sw.click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Borrar historial" }).click();
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await context.close();
});
