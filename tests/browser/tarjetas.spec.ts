// Tarjetas (Entrega 3): repaso con giro y 4 botones, teclado, sin conexión
// con cola sin duplicados, movimiento reducido, y gestión con CSV. dream-api
// simulado con la forma de las respuestas reales (study.ts).
import { test, expect, type Page } from "@playwright/test";
import { eid, routeFixture } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const due = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `77777777-7777-4777-8777-77777777770${i}`,
    exam_id: eid,
    unit_id: null,
    front: `¿Pregunta ${i + 1}?`,
    back: `Respuesta ${i + 1}`,
    due: "2026-10-15T10:00:00Z",
    stability: i ? 3 : 0,
    difficulty: i ? 5 : 0,
    reps: i ? 2 : 0,
    lapses: 0,
    state: i ? 2 : 0,
    last_review: i ? "2026-10-12T10:00:00Z" : null,
  }));

async function setup(page: Page, n = 3) {
  const calls = await routeFixture(page, {
    handlers: {
      cards_due: () => ({ cards: due(n), total: n }),
      card_review: () => ({ card: {}, duplicate: false }),
      cards_list: () => ({
        cards: [
          { id: "77777777-7777-4777-8777-777777777700", unit_id: null, front: "¿Año?", back: "1453", origin: "ai", due: "2026-10-17T10:00:00Z", suspended: false },
        ],
      }),
      card_create: () => ({ created: 1 }),
      cards_import: (b) => ({ created: (b.rows as unknown[]).length }),
      card_report: () => ({ ok: true }),
    },
  });
  return calls;
}
const reviews = (calls: Record<string, unknown>[]) => calls.filter((c) => c.action === "card_review");

test("repaso: girar, 4 botones con el intervalo, teclado y final «N repasadas · X para mañana»", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page);
  await page.goto("/exams/repaso");
  const card = page.getByRole("button", { name: /Pregunta\. Pulsa/ });
  await expect(card).toContainText("¿Pregunta 1?");
  await expect(page.getByRole("group", { name: "¿Cómo te ha ido?" })).toHaveCount(0);
  // Presupuesto (≤ 6): X, barra, contador, tarjeta; los botones salen al girar (4, en un grupo).
  await card.click();
  const group = page.getByRole("group", { name: "¿Cómo te ha ido?" });
  await expect(group.getByRole("button")).toHaveCount(4);
  await expect(group.getByRole("button", { name: /Otra vez/ })).toContainText("min");
  await group.getByRole("button", { name: /Bien/ }).click();
  await expect(page.getByRole("button", { name: /Pregunta\. Pulsa/ })).toContainText("¿Pregunta 2?");
  // Escritorio: Espacio gira; 1-4 puntúan.
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /Respuesta\. Pulsa/ })).toBeVisible();
  await page.keyboard.press("4");
  await page.keyboard.press("Space");
  await page.keyboard.press("1");
  await expect(page.getByTestId("tarjetas-fin")).toContainText("Repaso de hoy hecho");
  await expect(page.getByTestId("tarjetas-fin")).toContainText("3 repasadas");
  await expect.poll(() => reviews(calls).length).toBe(3);
  expect(new Set(reviews(calls).map((c) => c.review_id)).size).toBe(3);
  expect(reviews(calls).map((c) => c.rating)).toEqual([3, 4, 1]);
});

test("sin conexión: se sigue repasando, se avisa y se envía al volver sin duplicados", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page, 2);
  await page.goto("/exams/repaso");
  await expect(page.getByRole("button", { name: /Pregunta\. Pulsa/ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("Sin conexión. Sigue repasando")).toBeVisible();
  await page.getByRole("button", { name: /Pregunta\. Pulsa/ }).click();
  await page.getByRole("button", { name: /Bien/ }).click();
  await page.getByRole("button", { name: /Pregunta\. Pulsa/ }).click();
  await page.getByRole("button", { name: /Fácil/ }).click();
  await expect(page.getByTestId("tarjetas-fin")).toBeVisible();
  expect(reviews(calls)).toHaveLength(0);
  // La cola solo guarda ids, la nota y la hora: nunca el texto de la tarjeta.
  const stored = await page.evaluate(() => localStorage.getItem("dream.card-reviews.v1") ?? "");
  expect(stored).not.toContain("Pregunta");
  expect(stored).not.toContain("Respuesta");
  await context.setOffline(false);
  await expect.poll(() => reviews(calls).length).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dream.card-reviews.v1") ?? "[]").length)).toBe(0);
});

test("con movimiento reducido la tarjeta no gira: cambia de cara con un fundido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, 1);
  await page.goto("/exams/repaso");
  const card = page.getByRole("button", { name: /Pregunta\. Pulsa/ });
  await card.click();
  const transforms = await page.evaluate(() =>
    [...document.querySelectorAll("[data-card] > span")].map((el) => getComputedStyle(el).transform),
  );
  expect(transforms.every((t) => t === "none")).toBe(true);
});

test("tus tarjetas: crear, ocultar, importar CSV con vista previa y exportar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await setup(page);
  await page.goto(`/exams/${eid}/tarjetas`);
  await expect(page.getByText("¿Año?")).toBeVisible();
  await page.getByRole("button", { name: "Crear tarjeta" }).click();
  await page.getByLabel("Pregunta").fill("¿Quién?");
  await page.getByLabel("Respuesta").fill("Mehmed II");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Tarjeta creada.").first()).toBeVisible();
  expect(calls.find((c) => c.action === "card_create")).toMatchObject({ exam_id: eid, front: "¿Quién?", back: "Mehmed II" });
  await page.getByRole("button", { name: /ocultar del repaso/ }).click();
  await expect.poll(() => calls.some((c) => c.action === "card_report")).toBe(true);
  await page.getByRole("button", { name: "CSV" }).click();
  await page.getByLabel("Elegir archivo CSV").setInputFiles({
    name: "quizlet.tsv",
    mimeType: "text/tab-separated-values",
    buffer: Buffer.from("Uno\tOne\nDos\tTwo\nmala\n"),
  });
  await expect(page.getByRole("status").filter({ hasText: "2 tarjetas listas" })).toContainText("1 filas no valen");
  await page.getByRole("button", { name: "Importar 2" }).click();
  await expect.poll(() => calls.find((c) => c.action === "cards_import")?.rows).toEqual([
    { front: "Uno", back: "One" },
    { front: "Dos", back: "Two" },
  ]);
  await page.getByRole("button", { name: "CSV" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar 1 tarjeta" }).click()]);
  expect(download.suggestedFilename()).toBe("tarjetas-dream.csv");
});

// Capturas de evidencia: CAPTURAS_DIR=docs/diseno/ruta-pasos/despues npx playwright test tarjetas -g capturas
test("capturas de las tarjetas", async ({ page }) => {
  const dir = process.env.CAPTURAS_DIR;
  test.skip(!dir, "solo con CAPTURAS_DIR");
  for (const [w, h, name] of [[390, 844, "movil"], [1440, 900, "escritorio"]] as const)
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page, 2);
      await page.goto("/exams/repaso");
      await expect(page.getByRole("button", { name: /Pregunta\. Pulsa/ })).toBeVisible();
      await page.screenshot({ path: `${dir}/tarjetas-frente-${name}-${scheme}.png` });
      await page.getByRole("button", { name: /Pregunta\. Pulsa/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/tarjetas-reverso-${name}-${scheme}.png` });
      await page.getByRole("button", { name: /Bien/ }).click();
      await page.getByRole("button", { name: /Pregunta\. Pulsa/ }).click();
      await page.getByRole("button", { name: /Fácil/ }).click();
      await expect(page.getByTestId("tarjetas-fin")).toBeVisible();
      await page.screenshot({ path: `${dir}/tarjetas-fin-${name}-${scheme}.png` });
      await page.goto(`/exams/${eid}/tarjetas`);
      await page.getByRole("button", { name: "CSV" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/tarjetas-csv-${name}-${scheme}.png` });
    }
});
