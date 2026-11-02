// Encendido por fases (prompt de la ruta, apartado 6), con la web compilada
// con el flag APAGADO (como en producción): solo la cuenta que el servidor
// marca con study_steps ve la ruta nueva; el resto, la web de siempre.
// Ejecutar contra un build con NEXT_PUBLIC_DREAM_STUDY_STEPS_ENABLED=false.
import { test, expect } from "@playwright/test";
import { eid, routeFixture } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
test.skip(process.env.RUTA_BUILD !== "off", "solo contra un build con el flag apagado (RUTA_BUILD=off)");

const profile = (on: boolean) => () => ({
  profile: { email: "qa@example.test", display_name: "Alex" },
  service_ready: true,
  ...(on ? { study_steps: true } : {}),
});

test("cuenta de prueba: ve la ruta nueva, las tarjetas y el simulacro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page, { handlers: { profile: profile(true), cards_due: () => ({ cards: [], total: 0 }) } });
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.getByTestId("ruta-pasos")).toBeVisible();
  await page.goto("/exams/repaso");
  await expect(page.getByTestId("tarjetas-fin")).toContainText("Hoy no tienes tarjetas");
});

test("el resto de cuentas: la web de siempre y las pantallas nuevas no existen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeFixture(page, { handlers: { profile: profile(false) } });
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByTestId("ruta-pasos")).toHaveCount(0);
  for (const path of ["/exams/repaso", `/exams/${eid}/tarjetas`, `/exams/${eid}/simulacro?tipo=final`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  }
});
