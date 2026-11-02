// Ruta rediseñada (Entrega 0): presupuesto de elementos (0.4), recorrido
// ruta → «Continuar», hoja del nodo, menú «⋯», simulacro a pantalla completa
// y movimiento reducido. Con la API simulada (ruta-pasos-fixture.ts).
// Requiere un build con NEXT_PUBLIC_DREAM_STUDY_STEPS_ENABLED=true (o una
// vista previa de Vercel, donde está encendido).
import { test, expect, type Page } from "@playwright/test";
import { eid, routeFixture, sid } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });

/**
 * Elementos interactivos visibles a la vez dentro de la ventana, sin contar
 * la navegación de la app ni el aviso de IA. Un grupo de controles hermanos
 * (pestañas, respuestas de opción, la fila Anterior/Siguiente) cuenta como 1,
 * como en la lámina Reglas de Claude Design.
 */
async function budget(page: Page) {
  return page.evaluate(() => {
    const groups = new Set<Element>();
    let count = 0;
    const list = document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [role='tab'], [role='progressbar'], [role='timer'], .question-prompt",
    );
    for (const el of list) {
      if (el.closest(".sidebar, .tabbar, .topbar, .skip-link, .toast-position")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if (el.closest("[aria-hidden='true']")) continue;
      const group = el.closest("[role='tablist'], fieldset, footer");
      if (group) {
        if (groups.has(group)) continue;
        groups.add(group);
      }
      count++;
    }
    return count;
  });
}

const sizes = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

for (const size of sizes) {
  test(`presupuesto de elementos ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await routeFixture(page);
    await page.goto(`/exams/${eid}/ruta`);
    await expect(page.getByTestId("ruta-pasos")).toBeVisible();
    const ruta = await budget(page);
    expect(ruta, `ruta: ${ruta}`).toBeLessThanOrEqual(12);

    await page.goto(`/exams/${eid}/sessions/${sid}`);
    await expect(page.getByTestId("step-frame")).toBeVisible();
    const pregunta = await budget(page);
    expect(pregunta, `pregunta: ${pregunta}`).toBeLessThanOrEqual(7);
    test.info().annotations.push({ type: "recuento", description: `${size.width}px · ruta ${ruta} · pregunta ${pregunta}` });
  });
}

test("ruta: lo hecho plegado, el actual, «A continuación» y la hoja del nodo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  const path = page.getByRole("list", { name: "Tu camino" });
  // Lo hecho, plegado en una línea que se despliega.
  const done = page.getByRole("button", { name: /3 lecciones hechas/ });
  await expect(done).toHaveAttribute("aria-expanded", "false");
  await expect(path.getByRole("button", { name: /hecha$/ })).toHaveCount(0);
  await done.click();
  await expect(path.getByRole("button", { name: /hecha$/ })).toHaveCount(3);
  // Sin anillos «sin datos aún», sin fechas ni minutos en el camino.
  await expect(page.getByText("sin datos aún")).toHaveCount(0);
  await expect(path.getByText(/min$/)).toHaveCount(0);
  // Una sola acción rellena: «Continuar».
  const next = page.getByRole("region", { name: /Al-Ándalus/ });
  await expect(next.getByText("A continuación · Test")).toBeVisible();
  await expect(page.locator(".primary:visible")).toHaveCount(1);
  // El detalle va en la hoja.
  await path.getByRole("button", { name: /Los reinos cristianos/ }).click();
  const sheet = page.getByTestId("route-sheet");
  await expect(sheet.getByRole("heading", { name: "Los reinos cristianos" })).toBeVisible();
  await expect(sheet.getByText(/15\s*min/)).toBeVisible();
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet).toHaveCount(0);
});

test("ruta: menú «⋯» sin Compartir ni Duelo, y la pestaña Progreso", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Más opciones" }).first().click();
  const menu = page.getByRole("menu", { name: "Más opciones" });
  await expect(menu.getByRole("menuitem", { name: /Mi examen/ })).toBeVisible();
  await expect(menu.getByText(/Compartir|Duelo/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.getByRole("tab", { name: "Progreso" }).first().click();
  await expect(page.getByRole("tab", { name: "Progreso" }).first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: /A continuación/ })).toHaveCount(0);
});

test("«Continuar» de un test crea la sesión y abre la pregunta a pantalla completa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await routeFixture(page, {
    handlers: {
      exam_session_create: (b) => ({ session: { id: sid, exam_id: eid, mode: b.mode } }),
    },
  });
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/sessions/${sid}`);
  expect(calls.find((c) => c.action === "exam_session_create")).toMatchObject({ mode: "practice", unit_id: expect.any(String) });
  const frame = page.getByTestId("step-frame");
  await expect(frame.getByRole("progressbar", { name: "Simulacro" })).toHaveAttribute("aria-valuenow", "3");
  // Sin panel lateral, sin «Sin pistas, sin presión» ni «Respuestas guardadas».
  await expect(page.getByText("Sin pistas, sin presión.")).toHaveCount(0);
  await expect(page.getByText("Respuestas guardadas")).toHaveCount(0);
  await expect(page.getByText("Tu simulacro")).toHaveCount(0);
  // El reloj, en minutos (sin segundos hasta el último).
  await expect(frame.getByRole("timer")).toHaveText(/^\d+ min$/);
  // El navegador de preguntas, en una hoja.
  await frame.getByRole("button", { name: /Preguntas: 3 de 10/ }).click();
  await expect(page.getByRole("heading", { name: "Preguntas" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  // Salir pide confirmación y «Quedarme» es la principal.
  await frame.getByRole("button", { name: "Salir del simulacro" }).click();
  await expect(page.getByRole("heading", { name: "¿Salir?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quedarme" })).toBeFocused();
  await page.getByRole("button", { name: "Quedarme" }).click();
  await expect(page.getByRole("heading", { name: "¿Salir?" })).toHaveCount(0);
});

test("con movimiento reducido, nada se desplaza ni escala en la ruta", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.getByTestId("ruta-pasos")).toBeVisible();
  const moving = await page.evaluate(() =>
    document.getAnimations().filter((a) => {
      const frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      return frames.some((f) => typeof f.transform === "string" && f.transform !== "none");
    }).length,
  );
  expect(moving).toBe(0);
});
