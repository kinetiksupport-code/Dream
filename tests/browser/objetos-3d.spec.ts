import { test, expect, type Page } from "@playwright/test";
import { EXAM_ID, inDays, wizard } from "./asistente-fixture";
import { DESKTOP, LAUNCH_3D, MOBILE, capableDesktop, object3d as object, watch } from "./objetos-3d-fixture";
// Objeto 3D real de escritorio (PR 6, §5.8): en escritorio capaz aparece el
// lienzo y no hay errores; en móvil, con movimiento reducido, en equipos
// justos o sin WebGL se queda el icono estático y el trozo 3D ni se pide.
// Si la carga falla o WebGL se pierde, vuelve al icono.
test.use({ serviceWorkers: "block", launchOptions: LAUNCH_3D });

const identifyDraft = {
  materials: [{ id: "a1", file_name: "t.pdf", mime_type: "application/pdf", size_bytes: 1, status: "processed" }],
  exam_date: inDays(10),
  target_grade: 8,
  wizard_step: "identify",
};

test("desktop: the calculator model appears, then on «listo»; no console errors", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await capableDesktop(page);
  const w = watch(page);
  await wizard(page, { draft: identifyDraft });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(page.getByRole("heading", { name: "Matemáticas", level: 2 })).toBeVisible();
  await expect(object(page)).toHaveAttribute("data-3d", "ready", { timeout: 20_000 });
  const canvas = object(page).locator("canvas");
  await expect(canvas).toHaveAttribute("data-model", "calculator");
  await expect(canvas).toBeVisible();
  // Mismo tamaño fijo que el icono: no mueve nada.
  const box = await object(page).boundingBox();
  expect(box?.width).toBe(112);
  expect(box?.height).toBe(112);
  expect(w.chunks.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Crear mi ruta", exact: true }).click();
  await expect(page.locator("[data-step-title]")).toHaveText("Tu examen está listo");
  await expect(object(page)).toHaveAttribute("data-3d", "ready", { timeout: 20_000 });
  // El de la pantalla anterior ya no está (desmontado y liberado).
  await expect(page.locator(".subject-object-canvas")).toHaveCount(1);
  expect(w.errors).toEqual([]);
});

test("desktop: the exam page title carries the model too", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await capableDesktop(page);
  const w = watch(page);
  await wizard(page, {
    draft: { ...identifyDraft, status: "preparing", title: "Reacciones", subject: "Química" },
  });
  await page.goto(`/exams/${EXAM_ID}`);
  await expect(object(page)).toHaveAttribute("data-3d", "ready", { timeout: 20_000 });
  await expect(object(page).locator("canvas")).toHaveAttribute("data-model", "flask");
  expect(w.errors).toEqual([]);
});

test("WebGL lost: back to the static icon", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await capableDesktop(page);
  await wizard(page, { draft: identifyDraft });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(object(page)).toHaveAttribute("data-3d", "ready", { timeout: 20_000 });
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".subject-object-canvas")!;
    c.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(object(page)).toHaveAttribute("data-3d", "failed");
  await expect(page.locator(".subject-object-canvas")).toHaveCount(0);
  await expect(object(page).locator("img")).toBeVisible();
});

test("the 3D chunk fails to load: the static icon stays", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await capableDesktop(page);
  await page.route(/\/_next\/static\/chunks\/.+\.js/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (/WebGLRenderer|webglcontextlost/.test(body)) return route.abort();
    return route.fulfill({ response: res, body });
  });
  await wizard(page, { draft: identifyDraft });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(object(page)).toHaveAttribute("data-3d", "failed", { timeout: 20_000 });
  await expect(object(page).locator("img")).toBeVisible();
});

const staticCases: [string, (page: Page) => Promise<void>][] = [
  ["mobile", async (page) => {
    await page.setViewportSize(MOBILE);
    await capableDesktop(page);
  }],
  ["desktop with reduced motion", async (page) => {
    await page.setViewportSize(DESKTOP);
    await capableDesktop(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  }],
  ["desktop with 4 cores", async (page) => {
    await page.setViewportSize(DESKTOP);
    await capableDesktop(page, 4);
  }],
  ["desktop without WebGL", async (page) => {
    await page.setViewportSize(DESKTOP);
    await capableDesktop(page);
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, o?: unknown) {
        if (type === "webgl2" || type === "webgl") return null;
        return (get as (t: string, o?: unknown) => RenderingContext | null).call(this, type, o);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  }],
];

for (const [name, setup] of staticCases)
  test(`${name}: static icon, and the 3D chunk is never requested`, async ({ page }) => {
    await setup(page);
    const w = watch(page);
    await wizard(page, { draft: identifyDraft });
    await page.goto(`/exams/new?id=${EXAM_ID}`);
    await expect(page.getByRole("heading", { name: "Matemáticas", level: 2 })).toBeVisible();
    await expect(object(page)).toHaveAttribute("data-3d", "static");
    await expect(object(page).locator("img")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator(".subject-object-canvas")).toHaveCount(0);
    expect(w.chunks).toEqual([]);
    expect(w.errors).toEqual([]);
  });
