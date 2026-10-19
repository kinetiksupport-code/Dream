import { test, type Page } from "@playwright/test";
import { HISTORY, history, inDays, type HistoryOpts } from "./examenes-historial-fixture";
// Capturas de la pantalla Exámenes (historial). CAPTURAS_DIR=<carpeta>.
// ANTES=1 adapta los datos a la versión anterior (no admitía borradores sin
// fecha ni nombre) para sacar las capturas «antes» con el mismo guion.
test.use({ serviceWorkers: "block" });
const OUT = process.env.CAPTURAS_DIR;
const before = !!process.env.ANTES;
const data = before
  ? HISTORY.map((e) =>
      e.exam_date ? e : { ...e, exam_date: inDays(30), title: "Examen sin nombre", subject: "Otra" },
    )
  : HISTORY;

const STATES: { name: string; opts: HistoryOpts }[] = [
  { name: "lista", opts: { exams: data } },
  { name: "vacia", opts: { exams: [] } },
  { name: "cargando", opts: { delay: 60_000 } },
  { name: "error", opts: { fail: true } },
];
const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 800 },
];

async function open(page: Page, opts: HistoryOpts, name: string) {
  await history(page, opts);
  await page.goto("/exams");
  if (name === "cargando") await page.locator("[aria-busy=true]").first().waitFor();
  else await page.locator("h1, [role=alert]").first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(700);
}

test.describe("examenes historial capturas", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  for (const st of STATES)
    for (const vp of VIEWPORTS)
      for (const scheme of ["light", "dark"] as const)
        test(`${st.name} ${vp.name} ${scheme}`, async ({ page }) => {
          await page.setViewportSize(vp);
          await page.emulateMedia({ colorScheme: scheme });
          await open(page, st.opts, st.name);
          await page.screenshot({
            path: `${OUT}/${st.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
            fullPage: true,
          });
        });
  for (const vp of VIEWPORTS)
    test(`lista ${vp.name} reducido`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, { exams: data }, "lista");
      await page.screenshot({ path: `${OUT}/lista-${vp.name}-claro-reducido.png`, fullPage: true });
    });
  test("acciones movil", async ({ page }) => {
    test.skip(before, "no existía");
    await page.setViewportSize(VIEWPORTS[0]);
    await open(page, { exams: data }, "lista");
    await page.getByRole("button", { name: /Más opciones de Álgebra/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/acciones-movil-claro.png` });
    await page.getByRole("button", { name: "Borrar examen" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/borrar-movil-claro.png` });
    await page.getByRole("button", { name: "Sí, borrar" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/deshacer-movil-claro.png` });
  });
});

const REC = process.env.GRABAR;
test.describe("examenes historial grabacion", () => {
  test.skip(!REC, "Set GRABAR=<carpeta> to record");
  test("record", async ({ browser }) => {
    test.setTimeout(90_000);
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: vp,
        recordVideo: { dir: `${REC}/${vp.name}`, size: vp },
        serviceWorkers: "block",
      });
      const page = await ctx.newPage();
      await history(page, { exams: data });
      await page.goto("/exams");
      await page.waitForTimeout(1200);
      const cards = page.locator("a[class*=hLink]");
      if (vp.name === "escritorio")
        for (let i = 0; i < 3; i++) {
          await cards.nth(i).hover();
          await page.waitForTimeout(500);
        }
      await page.getByRole("button", { name: /Más opciones de La célula/ }).click();
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: "Borrar examen" }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Sí, borrar" }).click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Deshacer" }).click();
      await page.waitForTimeout(900);
      await page.getByRole("link", { name: "Crear examen" }).hover();
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.move(5, 5);
      await page.mouse.up();
      await page.waitForTimeout(400);
      await cards.first().click();
      await page.waitForTimeout(1500);
      await ctx.close();
    }
  });
});
