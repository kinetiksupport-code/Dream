// Capturas de «Juega mientras esperas» (Entrega 0c).
import { test } from "@playwright/test";
import { eid, routeFixture, session, sid } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const dir = process.env.CAPTURAS_DIR ?? "docs/diseno/ruta-pasos/despues";

for (const size of [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
])
  for (const scheme of ["light", "dark"] as const)
    test(`juegos ${size.name} ${scheme}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await routeFixture(page, {
        handlers: { exam_session_get: () => ({ session: { ...session("practice"), test_id: null, status: "generating" } }) },
      });
      await page.goto(`/exams/${eid}/sessions/${sid}`);
      await page.getByTestId("preparando").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/espera-${size.name}-${scheme}.png` });
      await page.getByRole("button", { name: "Juega mientras esperas" }).click();
      await page.getByRole("tab", { name: "Snake" }).click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${dir}/juego-${size.name}-${scheme}.png` });
    });
