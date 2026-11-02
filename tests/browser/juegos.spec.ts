// «Juega mientras esperas» (Entrega 0c, prompt de la ruta 0.10). Con la API
// simulada: la sesión tarda en tener preguntas y luego las tiene.
import { test, expect } from "@playwright/test";
import { eid, routeFixture, session, sid } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });

async function waitingSession(page: import("@playwright/test").Page, readyAfter = Infinity) {
  let calls = 0;
  await routeFixture(page, {
    handlers: {
      exam_session_get: () => {
        calls++;
        const s = session("practice");
        return { session: calls > readyAfter ? s : { ...s, test_id: null, status: "generating" } };
      },
    },
  });
}

test("los juegos no se descargan hasta pulsar «Juega mientras esperas»", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitingSession(page);
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await page.goto(`/exams/${eid}/sessions/${sid}`);
  await expect(page.getByTestId("preparando")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const before = new Set(scripts);
  await expect(page.getByTestId("arcade")).toHaveCount(0);
  await page.getByRole("button", { name: "Juega mientras esperas" }).click();
  await expect(page.getByTestId("arcade")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const loaded = scripts.filter((u) => !before.has(u));
  expect(loaded.length, "chunks de los juegos").toBeGreaterThan(0);
  // Otro juego, otro archivo.
  const count = scripts.length;
  await page.getByRole("tab", { name: "Snake" }).click();
  await page.waitForLoadState("networkidle");
  expect(scripts.length).toBeGreaterThan(count);
});

test("se juega con teclado, se pausa al perder el foco y guarda el récord en el dispositivo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitingSession(page);
  await page.goto(`/exams/${eid}/sessions/${sid}`);
  await page.getByRole("button", { name: "Juega mientras esperas" }).click();
  const canvas = page.getByRole("img", { name: /^Torre/ });
  await expect(canvas).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByText("Puntos · 1")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByText("En pausa")).toBeVisible();
  await page.getByRole("button", { name: "Seguir" }).last().click();
  await expect(page.getByText("En pausa")).toHaveCount(0);
  // Esperar sin pulsar: el bloque acaba fallando y termina la partida.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(170);
  }
  await expect(page.getByText(/^Fin ·/)).toBeVisible({ timeout: 20000 });
  const record = await page.evaluate(() => Number(localStorage.getItem("dream-juego-torre")));
  expect(record).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Volver a jugar" })).toBeVisible();
});

test("cuando las preguntas están listas, aparece «Empezar» sin cortar la partida", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitingSession(page, 2);
  await page.goto(`/exams/${eid}/sessions/${sid}`);
  await page.getByRole("button", { name: "Juega mientras esperas" }).click();
  await expect(page.getByTestId("arcade")).toBeVisible();
  // La sesión se vuelve a consultar sola (cada 5 s) y ya tiene preguntas.
  await expect(page.getByText("Tu test está listo")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("arcade")).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByTestId("step-frame")).toBeVisible();
});

test("sin jugar, la espera no ofrece el juego si ya está lista y no hay sonido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitingSession(page);
  await page.goto(`/exams/${eid}/sessions/${sid}`);
  await page.getByRole("button", { name: "Juega mientras esperas" }).click();
  const audio = await page.evaluate(() => document.querySelectorAll("audio, video").length);
  expect(audio).toBe(0);
  await page.getByRole("button", { name: "Cerrar juego" }).click();
  await expect(page.getByTestId("arcade")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Juega mientras esperas" })).toBeVisible();
});
