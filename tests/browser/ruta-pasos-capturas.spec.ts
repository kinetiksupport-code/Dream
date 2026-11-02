// Capturas de la ruta, la lección y el simulacro (docs/diseno/ruta-pasos).
// FASE=antes|despues decide la carpeta. Viewport fijo (lo que se ve sin
// desplazar), porque el presupuesto de elementos cuenta lo visible a la vez.
import { test } from "@playwright/test";
import { eid, routeFixture, sid } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const dir = process.env.CAPTURAS_DIR ?? `docs/diseno/ruta-pasos/${process.env.FASE ?? "despues"}`;
const sizes = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
] as const;

for (const size of sizes)
  for (const scheme of ["light", "dark"] as const)
    test(`capturas ${size.name} ${scheme}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await routeFixture(page);
      const shot = async (name: string) => {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${dir}/${name}-${size.name}-${scheme}.png` });
      };
      await page.goto(`/exams/${eid}/ruta`);
      await page.getByRole("heading", { name: "Examen de la Edad Media" }).first().waitFor();
      await shot("ruta");
      await page.goto(`/exams/${eid}/sessions/${sid}`);
      await page.getByText("Santa Sofía").first().waitFor();
      await shot("simulacro");
      if (process.env.FASE !== "antes") {
        await page.goto(`/exams/${eid}/study/55555555-5555-4555-8555-555555555503`);
        await page.getByRole("heading", { name: "Etapas históricas y Constantinopla" }).first().waitFor();
        await shot("leccion");
      }
    });
