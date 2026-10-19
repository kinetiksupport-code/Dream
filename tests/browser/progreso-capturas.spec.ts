import { test } from "@playwright/test";
import { fullShot } from "./full-shot";
import { algebraExam, fixture, historyExam } from "./progress-fixture";
// Visual evidence for docs/diseno/progreso (PR «estilo progreso»). Runs only
// when CAPTURAS_DIR is set: the three tabs at phone (390) and desktop (1280)
// width, light and dark, plus the empty state and a reduced-motion pass.
const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 900 },
] as const;
const TABS = [
  ["Preparación", "preparacion"],
  ["Simulacros", "simulacros"],
  ["Ritmo", "ritmo"],
] as const;

for (const vp of VIEWPORTS)
  for (const scheme of ["light", "dark"] as const)
    test(`progreso ${vp.name} ${scheme}`, async ({ page }) => {
      const name = scheme === "light" ? "claro" : "oscuro";
      await fixture(page, [historyExam, algebraExam]);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/progress");
      await page
        .getByRole("progressbar", { name: "Preparación para el examen" })
        .waitFor();
      for (const [tab, slug] of TABS) {
        await page.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(700);
        await fullShot(page, `${OUT}/progreso-${slug}-${vp.name}-${name}.png`);
      }
    });

test("progreso vacío", async ({ page }) => {
  await fixture(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/progress");
  await page.getByRole("heading", { name: "Aún no hay nada que medir" }).waitFor();
  await page.waitForTimeout(500);
  await fullShot(page, `${OUT}/progreso-vacio-movil-claro.png`);
});

test("progreso movimiento reducido", async ({ page }) => {
  await fixture(page, [historyExam, algebraExam]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/progress");
  await page
    .getByRole("progressbar", { name: "Preparación para el examen" })
    .waitFor();
  // 60 ms in: with reduced motion nothing has moved, only faded.
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/progreso-reducido-60ms-movil-claro.png` });
  await page.waitForTimeout(600);
  await fullShot(page, `${OUT}/progreso-reducido-movil-claro.png`);
});

// GRABAR=<carpeta>: a short video of the micro-interactions (numbers roll,
// bars fill, cards stagger, tab pill slides, press on a result row).
const REC = process.env.GRABAR;
test("progreso grabación", async ({ browser }) => {
  test.skip(!REC, "Set GRABAR to record the video");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: REC as string, size: { width: 1280, height: 800 } },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await fixture(page, [historyExam, algebraExam]);
  await page.goto("/progress");
  await page.waitForTimeout(1500);
  for (const tab of ["Simulacros", "Ritmo", "Preparación"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(1300);
  }
  await page.getByRole("tab", { name: "Simulacros" }).click();
  await page.waitForTimeout(800);
  const row = page.getByRole("link", { name: /Simulacro.*60\s%/ });
  await row.hover();
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await page.waitForTimeout(800);
  await context.close();
});
