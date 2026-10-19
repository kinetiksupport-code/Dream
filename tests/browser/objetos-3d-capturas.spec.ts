import { test, type Page } from "@playwright/test";
import { EXAM_ID, inDays, wizard } from "./asistente-fixture";
import { DESKTOP, LAUNCH_3D, MOBILE, capableDesktop, object3d } from "./objetos-3d-fixture";
// Capturas y grabación del objeto 3D (PR 6). CAPTURAS_DIR=<carpeta> para las
// capturas; GRABAR=<carpeta> para el vídeo.
test.use({ serviceWorkers: "block", launchOptions: LAUNCH_3D });
const OUT = process.env.CAPTURAS_DIR;
const REC = process.env.GRABAR;

const draft = {
  materials: [{ id: "a1", file_name: "Tema 4.pdf", mime_type: "application/pdf", size_bytes: 248_000, status: "processed" }],
  exam_date: inDays(12),
  target_grade: 8.5,
  wizard_step: "identify",
};
const SUBJECTS = [
  "Matemáticas",
  "Geografía",
  "Lengua y Literatura",
  "Plástica",
  "Historia",
  "Física",
  "Química",
  "Biología",
  "Inglés",
  "Filosofía",
  "Música",
  "Informática",
  "Economía",
  "Educación Física",
  "Otra",
];
const scheme = (s: "light" | "dark") => (s === "light" ? "claro" : "oscuro");
const ready = (p: Page) => object3d(p).and(p.locator('[data-3d="ready"]')).waitFor({ timeout: 20_000 });

test.describe("objetos 3d capturas", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR");
  for (const s of ["light", "dark"] as const) {
    test(`tu examen y listo, escritorio ${s}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.emulateMedia({ colorScheme: s });
      await capableDesktop(page);
      await wizard(page, { draft });
      await page.goto(`/exams/new?id=${EXAM_ID}`);
      await ready(page);
      await page.mouse.move(980, 200);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/6-tu-examen-escritorio-${scheme(s)}.png` });
      await page.getByRole("button", { name: "Crear mi ruta" }).click();
      await page.getByText("Tu ruta empieza así:").waitFor();
      await ready(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/7-listo-escritorio-${scheme(s)}.png` });
    });

    test(`detalle, escritorio ${s}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.emulateMedia({ colorScheme: s });
      await capableDesktop(page);
      await wizard(page, { draft: { ...draft, status: "preparing", title: "Reacciones químicas", subject: "Química" } });
      await page.goto(`/exams/${EXAM_ID}`);
      await ready(page);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/detalle-escritorio-${scheme(s)}.png` });
    });

    test(`los 15 modelos ${s}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, colorScheme: s, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await capableDesktop(page);
      await wizard(page, { draft });
      await page.goto(`/exams/new?id=${EXAM_ID}`);
      await ready(page);
      for (const [i, subject] of SUBJECTS.entries()) {
        if (i > 0) {
          await page.getByRole("button", { name: "No es esta asignatura" }).click();
          await page.getByRole("dialog").getByRole("button", { name: subject, exact: true }).click();
          await page.getByRole("dialog").waitFor({ state: "hidden" });
        }
        await ready(page);
        await page.waitForTimeout(900);
        const box = (await object3d(page).boundingBox())!;
        const pad = 12;
        await page.screenshot({
          path: `${OUT}/modelos/${s}-${String(i + 1).padStart(2, "0")}.png`,
          clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
        });
      }
      await ctx.close();
    });
  }

  test("móvil claro: icono estático", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await capableDesktop(page);
    await wizard(page, { draft });
    await page.goto(`/exams/new?id=${EXAM_ID}`);
    await page.getByRole("heading", { level: 3 }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/6-tu-examen-movil-claro.png` });
  });

  test("escritorio reducido: icono estático", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await capableDesktop(page);
    await wizard(page, { draft });
    await page.goto(`/exams/new?id=${EXAM_ID}`);
    await page.getByRole("heading", { level: 3 }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/6-tu-examen-escritorio-claro-reducido.png` });
  });
});

test.describe("objetos 3d grabacion", () => {
  test.skip(!REC, "Set GRABAR");
  test("gira y mira al puntero", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({
      viewport: DESKTOP,
      recordVideo: { dir: REC, size: DESKTOP },
      serviceWorkers: "block",
    });
    const page = await ctx.newPage();
    await capableDesktop(page);
    await wizard(page, { draft });
    await page.goto(`/exams/new?id=${EXAM_ID}`);
    await ready(page);
    await page.waitForTimeout(1500);
    // El puntero da una vuelta alrededor del objeto: se inclina hacia él.
    for (const [x, y] of [[1200, 120], [1200, 700], [100, 700], [100, 100], [640, 400]] as const) {
      await page.mouse.move(x, y, { steps: 30 });
      await page.waitForTimeout(700);
    }
    await page.getByRole("button", { name: "No es esta asignatura" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Geografía", exact: true }).click();
    await ready(page);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Crear mi ruta" }).click();
    await ready(page);
    await page.waitForTimeout(2500);
    await ctx.close();
  });
});
