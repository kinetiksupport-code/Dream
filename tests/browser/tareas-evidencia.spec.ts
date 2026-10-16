import { test, type Page } from "@playwright/test";
import { open, sample } from "./tareas-fixture";
// Evidence for docs/diseno/tareas: the states the general capture run does not
// reach (empty, loading, a task just marked as done) and a short recording of
// the row microinteractions. Runs only when CAPTURAS_DIR is set.
const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
];
const STATES: {
  name: string;
  units: unknown[];
  hold?: boolean;
  ready: (p: Page) => Promise<unknown>;
}[] = [
  {
    name: "vacio",
    units: [],
    ready: (p) => p.getByText("Aún no tienes tareas").waitFor(),
  },
  {
    name: "cargando",
    units: sample,
    hold: true,
    ready: (p) => p.getByRole("status", { name: "Cargando tareas" }).waitFor(),
  },
  {
    name: "hecha",
    units: sample,
    ready: async (p) => {
      await p.getByRole("checkbox", { name: /Factorización/ }).check();
      await p.getByText("Tarea hecha.").waitFor();
    },
  },
];

for (const state of STATES)
  for (const vp of VIEWPORTS)
    for (const scheme of ["light", "dark"] as const)
      test(`tareas-${state.name} ${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        const { release } = await open(page, state.units, { hold: state.hold });
        await state.ready(page);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `${OUT}/tareas-${state.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
          fullPage: true,
        });
        release();
      });

test("grabación de las microinteracciones", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 800 } },
    serviceWorkers: "block",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await open(page, sample);
  const row = page.locator("label").filter({ hasText: "Factorización" });
  await row.waitFor();
  await page.waitForTimeout(600);
  // Hover over two rows, then press one without ticking it.
  await page.locator("label").filter({ hasText: "Signos" }).hover();
  await page.waitForTimeout(500);
  await row.hover();
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(640, 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  // Keyboard focus ring.
  await page.getByRole("checkbox", { name: /Signos/ }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(700);
  // Mark as done: icon + «Hecha», toast with undo.
  await row.click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await page.waitForTimeout(900);
  // Again, and let it save: the row moves to «Hechas».
  await row.click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await page.waitForTimeout(1400);
  await context.close();
});
