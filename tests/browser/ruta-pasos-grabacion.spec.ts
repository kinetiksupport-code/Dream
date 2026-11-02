// Grabación de las microinteracciones de la ruta (Entrega 0b) para el PR:
// docs/diseno/ruta-pasos/grabaciones/<móvil|escritorio>-<claro|oscuro>.webm
import { test } from "@playwright/test";
import { readdirSync, renameSync, mkdirSync } from "node:fs";
import { eid, routeFixture, sid } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const out = process.env.GRABACION_DIR ?? "docs/diseno/ruta-pasos/grabaciones";

for (const size of [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
])
  for (const scheme of ["light", "dark"] as const)
    test(`grabación ${size.name} ${scheme}`, async ({ browser }) => {
      const dir = `test-results/grabacion-${size.name}-${scheme}`;
      const context = await browser.newContext({
        viewport: size,
        colorScheme: scheme,
        recordVideo: { dir, size },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      await routeFixture(page);
      const pause = (ms = 700) => page.waitForTimeout(ms);
      // 17 · el camino entra escalonado; 12 · el nodo actual respira
      await page.goto(`/exams/${eid}/ruta?hecho=55555555-5555-4555-8555-555555555502`);
      await pause(1500);
      // 16 · la ficha se hunde y rebota; 4 · la hoja sube
      const node = page.getByRole("button", { name: /Los reinos cristianos/ });
      await node.hover();
      await page.mouse.down();
      await pause(250);
      await page.mouse.up();
      await pause(900);
      await page.getByRole("button", { name: "Cerrar" }).click();
      await pause();
      // 24 · pestañas; 3 · menú «⋯»
      await page.getByRole("tab", { name: "Progreso" }).first().click();
      await pause();
      await page.getByRole("tab", { name: "Ruta" }).first().click();
      await pause();
      await page.getByRole("button", { name: "Más opciones" }).first().click();
      await pause();
      await page.keyboard.press("Escape");
      // 13 · ↓ ir a la actual; 18 · la gema se dibuja
      await page.getByRole("button", { name: /lecciones más/ }).click();
      await page.evaluate(() => (document.querySelector<HTMLElement>(".workspace-main") ?? document.scrollingElement)?.scrollBy({ top: 1600, behavior: "smooth" }));
      await pause(1600);
      await page.getByRole("button", { name: "Ir a la lección actual" }).click();
      await pause(1200);
      // 7 · pregunta: barra y contador; 9 · salir
      await page.goto(`/exams/${eid}/sessions/${sid}`);
      await pause(900);
      await page.getByRole("button", { name: "Siguiente" }).click();
      await pause(900);
      await page.getByRole("button", { name: /Salir del/ }).click();
      await pause(900);
      await page.getByRole("button", { name: "Quedarme" }).click();
      await pause(600);
      await context.close();
      mkdirSync(out, { recursive: true });
      const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
      if (file) renameSync(`${dir}/${file}`, `${out}/${size.name}-${scheme === "light" ? "claro" : "oscuro"}.webm`);
    });
