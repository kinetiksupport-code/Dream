import { test, type Page } from "@playwright/test";
import { EXAM_ID, PDF, PHOTO, inDays, wizard, type WizardOpts } from "./asistente-fixture";
// Capturas y grabación del asistente (PR 3). CAPTURAS_DIR=<carpeta> para las
// capturas; GRABAR=<carpeta> para los vídeos del flujo completo.
test.use({ serviceWorkers: "block" });
const OUT = process.env.CAPTURAS_DIR;
const REC = process.env.GRABAR;
const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 800 },
];
const files = [
  { id: "a1", file_name: "Tema 4 · Ecuaciones.pdf", mime_type: "application/pdf", size_bytes: 248_000, status: "processed" },
  { id: "a2", file_name: "Foto 1.jpg", mime_type: "image/jpeg", size_bytes: 1_400_000, status: "processed" },
];
const at = (extra: Record<string, unknown>) => ({ materials: files, exam_date: inDays(12), target_grade: 8, ...extra });

const STATES: { name: string; opts: WizardOpts; path: string; then?: (p: Page) => Promise<unknown> }[] = [
  { name: "1-bienvenida", opts: {}, path: "/exams/new" },
  { name: "2-apuntes", opts: { draft: { materials: files }, phoneAfter: 0 }, path: `/exams/new?id=${EXAM_ID}` },
  {
    name: "2-apuntes-subiendo",
    opts: { draft: {}, delay: { attachment_upload: 60_000 } },
    path: `/exams/new?id=${EXAM_ID}`,
    then: (p) => p.locator("input[type=file]:not([capture])").setInputFiles(PDF),
  },
  {
    name: "3-pocos-apuntes",
    opts: { draft: { materials: files.slice(0, 1) }, chars: 800 },
    path: `/exams/new?id=${EXAM_ID}`,
    then: async (p) => {
      await p.getByRole("button", { name: "Continuar", exact: true }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
  { name: "4-fecha", opts: { draft: at({ exam_date: inDays(12), wizard_step: "date" }) }, path: `/exams/new?id=${EXAM_ID}` },
  { name: "5-nota", opts: { draft: at({ wizard_step: "grade" }) }, path: `/exams/new?id=${EXAM_ID}` },
  {
    name: "6-tu-examen",
    opts: { draft: at({ target_grade: 8.5, wizard_step: "identify" }) },
    path: `/exams/new?id=${EXAM_ID}`,
    then: (p) => p.getByRole("heading", { level: 3 }).waitFor(),
  },
  {
    name: "6-tu-examen-a-mano",
    opts: { draft: at({ target_grade: 8.5, wizard_step: "identify" }), identifyFails: 503 },
    path: `/exams/new?id=${EXAM_ID}`,
    then: (p) => p.getByText(/escribe tú el nombre/i).waitFor(),
  },
  {
    name: "7-listo",
    opts: { draft: at({ target_grade: 8.5, wizard_step: "identify" }) },
    path: `/exams/new?id=${EXAM_ID}`,
    then: async (p) => {
      await p.getByRole("button", { name: "Crear mi ruta" }).click();
      await p.getByText("Tu ruta empieza así:").waitFor();
    },
  },
  {
    name: "8-salir",
    opts: { draft: { materials: files } },
    path: `/exams/new?id=${EXAM_ID}`,
    then: async (p) => {
      await p.getByRole("button", { name: "Salir del asistente" }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
];

test.describe("asistente capturas", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR");
  for (const st of STATES)
    for (const vp of VIEWPORTS)
      for (const scheme of ["light", "dark"] as const)
        test(`${st.name} ${vp.name} ${scheme}`, async ({ page }) => {
          await page.setViewportSize(vp);
          await page.emulateMedia({ colorScheme: scheme });
          await wizard(page, st.opts);
          await page.goto(st.path);
          await page.locator("[data-step-title]").first().waitFor();
          if (st.then) await st.then(page);
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${OUT}/${st.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png` });
        });
  for (const name of ["1-bienvenida", "5-nota", "7-listo"])
    test(`${name} reducido`, async ({ page }) => {
      const st = STATES.find((x) => x.name === name)!;
      await page.setViewportSize(VIEWPORTS[0]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await wizard(page, st.opts);
      await page.goto(st.path);
      await page.locator("[data-step-title]").first().waitFor();
      if (st.then) await st.then(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${name}-movil-claro-reducido.png` });
    });
});

test.describe("asistente grabacion", () => {
  test.skip(!REC, "Set GRABAR");
  for (const vp of VIEWPORTS)
    test(`flujo ${vp.name}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({
        viewport: vp,
        recordVideo: { dir: `${REC}/${vp.name}`, size: vp },
        serviceWorkers: "block",
      });
      const page = await ctx.newPage();
      await wizard(page, { chars: 800, phoneAfter: 3 });
      const slow = (ms = 700) => page.waitForTimeout(ms);
      await page.goto("/exams/new");
      await slow(1400);
      await page.getByRole("button", { name: "Empezar" }).click();
      await slow(1200);
      if (vp.name === "movil") await page.locator("input[capture]").setInputFiles(PHOTO);
      await page.locator("input[type=file]:not([capture])").setInputFiles(PDF);
      await slow(vp.name === "escritorio" ? 4500 : 1600);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await slow(2200);
      await page.getByRole("button", { name: "Continuar con estos" }).click();
      await slow(900);
      const target = inDays(9);
      const day = page.locator(`[data-day="${target}"]`);
      if (!(await day.count())) await page.getByRole("button", { name: "Mes siguiente" }).click();
      await page.locator(`[data-day="${target}"]`).click();
      await slow(500);
      await page.locator(`[data-day="${inDays(12)}"]`).click().catch(() => {});
      await slow(900);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await slow(900);
      const wheel = page.getByTestId("grade-wheel-scroller");
      const box = (await wheel.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -64);
        await slow(450);
      }
      await page.getByRole("slider").focus();
      await page.keyboard.press("ArrowDown");
      await slow(700);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await slow(2600);
      await page.getByRole("button", { name: "Quitar el tema Factorización" }).click();
      await slow(700);
      await page.getByRole("button", { name: "Crear mi ruta" }).click();
      await slow(2400);
      await ctx.close();
    });
});
