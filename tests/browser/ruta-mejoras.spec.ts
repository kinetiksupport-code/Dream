// Mejoras de la ruta (Entrega 5, Bloque 6) y objetos 3D de la cabecera.
import { test, expect, type Page } from "@playwright/test";
import { eid, routeFixture } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const today = { due: 14, minutes: 5, reviewed_today: 0, lessons_today: 0, goal: { lessons: 1, cards: 10 } };

async function errorsOf(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return errors;
}

test("cabecera: repaso de hoy, meta diaria suave y minutos al día, dentro del presupuesto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page, { handlers: { study_today: () => today } });
  await page.goto(`/exams/${eid}/ruta`);
  const due = page.locator("[data-testid='repaso-hoy'] >> visible=true");
  await expect(due).toHaveText("14 tarjetas para repasar (≈5 min)");
  await expect(page.locator("text=Hoy: 1 lección o 10 tarjetas >> visible=true")).toBeVisible();
  await expect(page.locator("text=/≈ \\d+ min al día/ >> visible=true")).toBeVisible();
  await expect(due).toHaveAttribute("href", `/exams/repaso?desde=${eid}`);
});

test("meta cumplida: lo dice sin presionar; sin tarjetas, no hay enlace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeFixture(page, { handlers: { study_today: () => ({ ...today, due: 0, reviewed_today: 12 }) } });
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.locator("text=Meta de hoy hecha >> visible=true")).toBeVisible();
  await expect(page.getByTestId("repaso-hoy")).toHaveCount(0);
});

test("Inicio: el repaso de hoy en una línea", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page, { handlers: { study_today: () => today } });
  await page.goto("/chat");
  await expect(page.getByTestId("repaso-hoy")).toHaveText("14 tarjetas para repasar (≈5 min)");
});

test("«Ya me sé este tema»: test directo sin leer y, si lo supera, la lección cuenta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await routeFixture(page, {
    handlers: {
      unit_content_get: () => ({ status: "ready", reading: { sections: [{ title: "No se ve", body_markdown: "x", why_it_matters: null, check: { statement: "s" } }], sources: [] }, progress: null }),
      unit_quiz_get: (b) => (b.pretest ? { questions: [] } : { questions: [{ index: 0, type: "tf", prompt: "Bizancio era la parte oriental." }] }),
      unit_quiz_answer: () => ({ correct: true, correct_answer: true, explanation: "" }),
      unit_quiz_finish: () => ({ right: 1, total: 1, pct: 100, mastered: true, completed: true, mistake_cards: 0 }),
    },
  });
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: /Etapas históricas y Constantinopla/ }).click();
  await page.getByTestId("route-sheet").getByRole("link", { name: "Ya me sé este tema" }).click();
  await expect(page.getByRole("heading", { name: "Bizancio era la parte oriental." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No se ve" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await page.getByRole("button", { name: "Ver resultados" }).click();
  await expect(page.getByTestId("leccion-resultados")).toContainText("Dominado");
  expect(calls.find((c) => c.action === "unit_quiz_finish")).toMatchObject({ known: true });
});

test("3D: en ordenador con WebGL, el modelo vivo; sin WebGL o en móvil, la pieza plana; nunca errores ni saltos", async ({ page }) => {
  // Equipo «capaz» para la prueba (el contenedor tiene pocos núcleos).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  });
  const errors = await errorsOf(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  const head = page.locator("aside").getByTestId("ruta-3d");
  await expect(head).toBeVisible();
  const box = await head.boundingBox();
  expect(box && Math.round(box.width)).toBe(60);
  expect(errors).toEqual([]);
});

test("3D: con WebGL bloqueado o en móvil, la pieza plana del mismo tamaño", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
  const errors = await errorsOf(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.locator("aside img[src$='.svg']").first()).toBeVisible();
  await expect(page.getByTestId("ruta-3d")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("ruta-3d")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Capturas: CAPTURAS_DIR=docs/diseno/ruta-pasos/despues npx playwright test ruta-mejoras -g capturas
test("capturas de la ruta con el repaso de hoy y el 3D", async ({ page }) => {
  const dir = process.env.CAPTURAS_DIR;
  test.skip(!dir, "solo con CAPTURAS_DIR");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  });
  for (const [w, h, name] of [[390, 844, "movil"], [1440, 900, "escritorio"]] as const)
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await routeFixture(page, { handlers: { study_today: () => today } });
      await page.goto(`/exams/${eid}/ruta`);
      await expect(page.locator("[data-testid='repaso-hoy'] >> visible=true")).toBeVisible();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${dir}/ruta-hoy-${name}-${scheme}.png` });
    }
});
