import { test, expect } from "@playwright/test";
import { HISTORY, history } from "./examenes-historial-fixture";
// Pantalla Exámenes (PR 2, §4): secciones, tarjetas, acciones con Deshacer,
// borradores y el objeto que viaja al detalle.
test.use({ serviceWorkers: "block" });

type Call = { action: string; body: Record<string, unknown> };

test("sections: Próximos by date (drafts without date last) and Anteriores", async ({ page }) => {
  await history(page);
  await page.goto("/exams");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible();
  const upcoming = page.getByRole("region", { name: /Próximos/ }).locator("h3");
  await expect(upcoming).toHaveText([
    "Comentario de texto",
    "Álgebra · primer trimestre",
    "La célula",
    "Examen sin nombre",
  ]);
  const previous = page.getByRole("region", { name: /Anteriores/ }).locator("h3");
  await expect(previous).toHaveText(["Unidad 3 · Revolución industrial", "Present perfect"]);
  // Every status has words, not only colour.
  for (const [title, label] of [
    ["Comentario de texto", "Preparando"],
    ["Álgebra · primer trimestre", "Listo"],
    ["La célula", "Algo falló"],
    ["Examen sin nombre", "Sin terminar"],
    ["Unidad 3 · Revolución industrial", "Hecho"],
  ])
    await expect(page.getByRole("link", { name: title }).locator(".sticker")).toHaveText(label);
  // Each card shows its subject object (decorative, fixed size).
  const img = page.getByRole("link", { name: /Álgebra/ }).locator(".subject-object img");
  await expect(img).toHaveAttribute("srcset", "/subjects/abacus-96.webp 96w, /subjects/abacus-192.webp 192w");
  await expect(img).toHaveAttribute("alt", "");
  await expect(img).toHaveAttribute("width", "56");
});

test("a draft opens the wizard where it was; others open their detail", async ({ page }) => {
  await history(page);
  await page.goto("/exams");
  await expect(page.getByRole("link", { name: /Examen sin nombre/ })).toHaveAttribute(
    "href",
    `/exams/new?id=${HISTORY[2].id}`,
  );
  await expect(page.getByRole("link", { name: /La célula/ })).toHaveAttribute(
    "href",
    `/exams/${HISTORY[3].id}`,
  );
  await expect(page.getByRole("link", { name: "Crear examen" })).toHaveAttribute("href", "/exams/new");
});

test("delete asks first, hides the card, Deshacer brings it back without calling the server", async ({ page }) => {
  const calls: Call[] = [];
  await history(page, { calls });
  await page.goto("/exams");
  await page.getByRole("button", { name: "Más opciones de La célula" }).click();
  const sheet = page.getByRole("dialog", { name: "La célula" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Borrar examen" }).click();
  const confirm = page.getByRole("dialog", { name: /¿Borrar «La célula»\?/ });
  await expect(confirm).toContainText("unos segundos para deshacerlo");
  await confirm.getByRole("button", { name: "Sí, borrar" }).click();
  await expect(page.getByRole("link", { name: /La célula/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByRole("link", { name: /La célula/ })).toBeVisible();
  await page.waitForTimeout(5600);
  expect(calls.filter((c) => c.action === "exam_delete")).toEqual([]);
});

test("delete becomes real when the toast runs out (or on a second delete)", async ({ page }) => {
  const calls: Call[] = [];
  await history(page, { calls });
  await page.goto("/exams");
  for (const title of ["La célula", "Present perfect"]) {
    await page.getByRole("button", { name: `Más opciones de ${title}` }).click();
    await page.getByRole("button", { name: "Borrar examen" }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();
  }
  // The first one is committed as soon as the second starts.
  await expect
    .poll(() => calls.filter((c) => c.action === "exam_delete").map((c) => c.body.exam_id))
    .toEqual([HISTORY[3].id]);
  await expect
    .poll(() => calls.filter((c) => c.action === "exam_delete").length, { timeout: 8000 })
    .toBe(2);
  await expect(page.getByRole("link", { name: /Present perfect/ })).toHaveCount(0);
});

test("a failed delete puts the card back and offers to retry", async ({ page }) => {
  await history(page, { failDelete: true });
  await page.goto("/exams");
  await page.getByRole("button", { name: "Más opciones de La célula" }).click();
  await page.getByRole("button", { name: "Borrar examen" }).click();
  await page.getByRole("button", { name: "Sí, borrar" }).click();
  await expect(page.getByText("No se pudo borrar el examen.")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("link", { name: /La célula/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("«Marcar como hecho» moves the exam to Anteriores", async ({ page }) => {
  const calls: Call[] = [];
  await history(page, { calls });
  await page.goto("/exams");
  await page.getByRole("button", { name: "Más opciones de Álgebra · primer trimestre" }).click();
  await page.getByRole("button", { name: "Marcar como hecho" }).click();
  await expect(
    page.getByRole("region", { name: /Anteriores/ }).getByRole("link", { name: /Álgebra/ }),
  ).toBeVisible();
  expect(calls.map((c) => c.action)).toContain("exam_complete");
  // Drafts can't be marked as done.
  await page.getByRole("button", { name: "Más opciones de Examen sin nombre" }).click();
  const sheet = page.getByRole("dialog", { name: "Examen sin nombre" });
  await expect(sheet.getByRole("button", { name: "Borrar examen" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Marcar como hecho" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Más opciones de Examen sin nombre" })).toBeFocused();
});

test("the subject object travels to the detail (shared View Transition name)", async ({ page }) => {
  await history(page);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    if (b.action !== "exam_get") return route.fallback();
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      json: {
        exam: {
          ...HISTORY[0],
          exam_date: HISTORY[0].exam_date,
          conversation_id: null,
          plan_error: null,
          materials: [],
          sessions: [],
          units: [],
        },
      },
    });
  });
  await page.goto("/exams");
  const link = page.getByRole("link", { name: /Álgebra/ });
  await link.click();
  // While loading, the skeleton already holds the object in its place.
  const named = page.locator(".subject-object").filter({ has: page.locator("img[src*=abacus]") });
  await expect(page.locator("[aria-busy=true] .subject-object")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Álgebra · primer trimestre", level: 1 })).toBeVisible();
  expect(await named.first().evaluate((el) => (el as HTMLElement).style.viewTransitionName)).toBe(
    "exam-object",
  );
});

for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])
  test(`no sideways scroll and 44 px targets at ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await history(page);
    await page.goto("/exams");
    await page.getByRole("heading", { name: "Exámenes", level: 1 }).waitFor();
    const over = await page.evaluate(() =>
      [document.scrollingElement, document.querySelector(".workspace-main")]
        .filter(Boolean)
        .some((r) => r!.scrollWidth > r!.clientWidth + 1),
    );
    expect(over).toBe(false);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll(".workspace-main a[href], .workspace-main button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.height < 44 || r.width < 44);
        })
        .map((el) => el.textContent?.trim().slice(0, 30)),
    );
    expect(small).toEqual([]);
  });
