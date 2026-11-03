// Ruta «tipo Knowunity» (prompt de la ruta, 0.11 · 1-2 y 0.13): secciones por
// tema, tarjeta de examen con tres datos y el pop-up de la ruta.
import { test, expect, type Page } from "@playwright/test";
import { eid, exam, routeFixture } from "./ruta-pasos-fixture";
import { ROUTE_PROMPT_TITLE } from "../../lib/route-prompt-title";

test.use({ serviceWorkers: "block" });

const withNotes = (route: unknown = null) => ({ ...exam(), route, materials: [{ id: "m1", file_name: "apuntes.pdf", mime_type: "application/pdf", size_bytes: 10, status: "ready" }] }) as never;
const profile = (aiRoute: boolean) => () => ({ profile: { email: "qa@example.test", display_name: "Alex" }, service_ready: true, ...(aiRoute ? { ai_route: true } : {}) });

async function detail(page: Page, { aiRoute = true, route = null as unknown } = {}) {
  return routeFixture(page, {
    data: withNotes(route),
    handlers: {
      profile: profile(aiRoute),
      exam_route_regenerate: () => ({ exam: withNotes({ nodes: [] }) }),
    },
  });
}

test("ruta por secciones: barra con el tema actual y su resumen, separadores y anillo en el actual", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  const bar = page.getByTestId("barra-seccion");
  await expect(bar).toContainText("Sección");
  await expect(bar).toContainText("Al-Ándalus");
  await bar.getByRole("button", { name: /Resumen de «Al-Ándalus»/ }).click();
  await expect(page.getByTestId("route-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByTestId("separador-seccion").first()).toBeVisible();
  // El actual: «Ahora» + su título (una frase corta al lado del círculo).
  await expect(page.locator("[data-current]")).toContainText(/Ahora.+/);
});

test("lista de exámenes: una tarjeta con «Faltan…», la asignatura y «N % completado · a/b lecciones»", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page);
  await page.goto("/exams");
  await expect(page.getByTestId("tarjeta-examen-progreso")).toHaveText("3/10 pasos");
});

test("pop-up de la ruta: sale sin ruta, una vez por sesión; «Ahora no» lo oculta; teclado y foco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await detail(page);
  await page.goto(`/exams/${eid}`);
  const dialog = page.getByRole("dialog", { name: ROUTE_PROMPT_TITLE });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Dream ordena tus apuntes y tu fecha de examen en lecciones cortas.");
  // Foco inicial en el botón principal; Esc cierra.
  await expect(dialog.getByRole("button", { name: "Crear mi ruta de estudio" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Una vez por sesión y, tras cerrarlo, 7 días sin salir.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Historia" })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(dialog).toHaveCount(0);
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem("dream.route-prompt.v1") || "{}"));
  expect(Object.keys(seen)).toEqual([eid]);
  expect(typeof seen[eid].off).toBe("number");
  expect(JSON.stringify(seen)).not.toMatch(/Historia|Edad Media/);
});

test("pop-up: «Crear mi ruta de estudio» lleva a la ruta y la pide", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await detail(page);
  await page.goto(`/exams/${eid}`);
  await page.getByRole("button", { name: "Crear mi ruta de estudio" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
  await expect.poll(() => calls.some((c) => c.action === "exam_route_regenerate")).toBe(true);
});

test("pop-up: no sale con ruta ni con la ruta con IA apagada", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await detail(page, { route: { nodes: [] } });
  await page.goto(`/exams/${eid}`);
  await expect(page.getByRole("heading", { name: "Historia" })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByTestId("ruta-popup")).toHaveCount(0);
  await page.context().clearCookies();
  const fresh = await page.context().newPage();
  await detail(fresh, { aiRoute: false });
  await fresh.goto(`/exams/${eid}`);
  await expect(fresh.getByRole("heading", { name: "Historia" })).toBeVisible();
  await fresh.waitForTimeout(900);
  await expect(fresh.getByTestId("ruta-popup")).toHaveCount(0);
});

// Capturas: CAPTURAS_DIR=docs/diseno/ruta-knowunity npx playwright test ruta-knowunity -g capturas
test("capturas de la ruta por secciones y del pop-up", async ({ page }) => {
  const dir = process.env.CAPTURAS_DIR;
  test.skip(!dir, "solo con CAPTURAS_DIR");
  for (const [w, h, name] of [[390, 844, "movil"], [1440, 900, "escritorio"]] as const)
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await routeFixture(page);
      await page.goto(`/exams/${eid}/ruta`);
      await expect(page.getByTestId("barra-seccion")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/ruta-secciones-${name}-${scheme}.png` });
      await page.goto("/exams");
      await expect(page.getByTestId("tarjeta-examen-progreso")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/examenes-tarjeta-${name}-${scheme}.png` });
      await page.evaluate(() => {
        localStorage.removeItem("dream.route-prompt.v1");
        sessionStorage.clear();
      });
      await page.unroute("**/functions/v1/dream-api");
      await detail(page);
      await page.goto(`/exams/${eid}`);
      await expect(page.getByTestId("ruta-popup")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/popup-ruta-${name}-${scheme}.png` });
    }
});
