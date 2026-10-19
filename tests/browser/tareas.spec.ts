import { test, expect } from "@playwright/test";
import { eid, LONG, open, sample, unit } from "./tareas-fixture";
// Tareas: long titles on phones, row states (hover, press, focus), loading
// skeleton, empty state and «Tarea hecha · Deshacer» (docs/diseno/tareas).
test.use({ serviceWorkers: "block" });

for (const width of [360, 390, 430])
  test(`long titles wrap inside the row at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, sample);
    const title = page.getByText(LONG);
    await title.waitFor();
    const layout = await page.evaluate((long) => {
      const el = [...document.querySelectorAll("li span")].find(
        (s) => s.textContent === long,
      )!;
      const row = el.closest("li")!;
      const action = row.querySelector("a")!;
      const r = el.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      const ar = action.getBoundingClientRect();
      const roots = [
        document.scrollingElement,
        document.querySelector(".workspace-main"),
      ].filter(Boolean) as Element[];
      return {
        sideways: roots.some((x) => x.scrollWidth > x.clientWidth + 1),
        inside: r.left >= rr.left - 1 && r.right <= rr.right + 1,
        lines: Math.round(
          r.height / parseFloat(getComputedStyle(el).lineHeight),
        ),
        actionBelow: ar.top >= r.bottom - 1,
        actionAlignedWithTitle: Math.abs(ar.left + 12 - r.left) <= 1,
        noWordSplit: !/\w-\n/.test((el as HTMLElement).innerText),
      };
    }, LONG);
    expect(layout.sideways).toBe(false);
    expect(layout.inside).toBe(true);
    expect(layout.actionBelow).toBe(true);
    expect(layout.actionAlignedWithTitle).toBe(true);
    // Full width for the text: at most 4 lines even at 360 px.
    expect(layout.lines).toBeLessThanOrEqual(4);
    // Meta wraps between parts: «Examen el 27 nov» stays on one line.
    const date = page
      .locator("li")
      .first()
      .getByText(/Examen el/);
    const box = await date.boundingBox();
    const lh = await date.evaluate((s) =>
      parseFloat(getComputedStyle(s).lineHeight),
    );
    expect(box!.height).toBeLessThan(lh * 1.5);
  });

test("desktop keeps «Resolver con Dream» on the row's right", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, sample);
  const row = page.locator("li").filter({ hasText: "Factorización" });
  const action = row.getByRole("link", { name: /Resolver con Dream/ });
  const title = row.getByText("Factorización");
  const [a, t] = [await action.boundingBox(), await title.boundingBox()];
  expect(Math.abs(a!.y + a!.height / 2 - (t!.y + t!.height / 2))).toBeLessThan(
    16,
  );
  expect(a!.x).toBeGreaterThan(t!.x + t!.width);
});

test("rows: hover layer, press .97, visible focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, sample);
  const label = page.locator("label").filter({ hasText: "Factorización" });
  await label.waitFor();
  const bg = () => label.evaluate((el) => getComputedStyle(el).backgroundColor);
  const rest = await bg();
  await label.hover();
  await page.waitForTimeout(250);
  const hovered = await bg();
  expect(hovered).not.toBe(rest);

  await page.mouse.down();
  await page.waitForTimeout(250);
  const pressed = await label.evaluate((el) => getComputedStyle(el).transform);
  expect(pressed).toMatch(/matrix\(0\.97/);
  // Release outside so the press does not tick the box.
  await page.mouse.move(5, 5);
  await page.mouse.up();

  const box = page.getByRole("checkbox", { name: /Factorización/ });
  await page.keyboard.press("Tab");
  await box.focus();
  const ring = await box.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${parseFloat(s.outlineWidth)}`;
  });
  expect(ring).toBe("solid 2");
  // Motion only on transform, opacity and colour.
  const props = await label.evaluate(
    (el) => getComputedStyle(el).transitionProperty,
  );
  expect(props.split(", ").sort()).toEqual(
    ["background-color", "color", "transform"].sort(),
  );
});

test("reduced motion: pressing a row does not move it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, sample);
  const label = page.locator("label").filter({ hasText: "Factorización" });
  await label.hover();
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await label.evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
  await page.mouse.move(5, 5);
  await page.mouse.up();
});

test("loading shows the list's shape, then the list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { release } = await open(page, sample, { hold: true });
  const status = page.getByRole("status", { name: "Cargando tareas" });
  await expect(status).toBeVisible();
  expect(await status.locator("> span").count()).toBe(4); // heading + 3 rows
  release();
  await expect(page.getByRole("heading", { name: "Pendientes" })).toBeVisible();
  await expect(status).toHaveCount(0);
});

test("empty state: inline illustration hidden from AT and one clear action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, []);
  await expect(
    page.getByRole("heading", { name: "Aún no tienes tareas" }),
  ).toBeVisible();
  const art = page.locator(".empty-state svg").first();
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("link", { name: "Preparar un examen" }),
  ).toHaveAttribute("href", "/exams/new");
});

test("marking a task done: icon + text, toast in aria-live, undo, then saved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { calls } = await open(page, sample);
  const box = page.getByRole("checkbox", { name: /Factorización/ });
  await box.check();
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText("Tarea hecha.");
  const row = page.locator("li").filter({ hasText: "Factorización" });
  await expect(row).toContainText("Hecha");
  await expect(row.locator("svg")).toBeVisible();

  // Undo: back to pending, nothing saved, focus back on the box.
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(box).not.toBeChecked();
  await expect(box).toBeFocused();
  await expect(live).toBeEmpty();
  expect(calls.some((c) => c.action === "exam_unit_complete")).toBe(false);

  // Check again and close the toast: saved now, row moves to «Hechas».
  await box.check();
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect
    .poll(() => calls.filter((c) => c.action === "exam_unit_complete").length)
    .toBe(1);
  expect(calls.find((c) => c.action === "exam_unit_complete")).toMatchObject({
    exam_id: eid,
    unit_id: "77777777-7777-4777-8777-777777777771",
  });
  const done = page.locator("section", {
    has: page.getByRole("heading", { name: "Hechas" }),
  });
  await expect(done).toContainText("Factorización");
  await expect(
    done.locator("li").filter({ hasText: "Factorización" }),
  ).toContainText("Hecha");
});

test("the undo window saves on its own after a few seconds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const { calls } = await open(page, sample);
  await page.getByRole("checkbox", { name: /Signos/ }).check();
  await expect
    .poll(() => calls.filter((c) => c.action === "exam_unit_complete").length, {
      timeout: 8000,
    })
    .toBe(1);
  await expect(page.locator('[aria-live="polite"]')).toBeEmpty();
});

test("a failed save brings the task back with «Reintentar»", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { calls } = await open(page, sample, { failSave: true });
  const box = page.getByRole("checkbox", { name: /Factorización/ });
  await box.check();
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  const alert = page.locator(".toast-error");
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText("No se pudo guardar «Factorización»");
  await expect(box).not.toBeChecked();
  // «Reintentar» opens a new undo window and replaces the error.
  await alert.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText("Tarea hecha.")).toBeVisible();
  await expect(box).toBeChecked();
  await expect(alert).toHaveCount(0);
  expect(calls.filter((c) => c.action === "exam_unit_complete").length).toBe(1);
});

test("estilo: pencil sticker, staggered list, spring tick and pills", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, sample);
  await page.getByRole("heading", { name: "Pendientes" }).waitFor();
  // One decorative sticker: yellow, dark ink, hidden from AT.
  const panel = page.getByRole("region", { name: "Resolver un ejercicio" });
  const sticker = panel.locator('[aria-hidden="true"]').first();
  await expect(sticker).toBeVisible();
  await expect(sticker).toHaveCSS("background-color", "rgb(255, 194, 26)");
  await expect(sticker).toHaveCSS("color", "rgb(8, 11, 20)");
  // Pending rows rise one after another, 40 ms apart.
  const delays = await page
    .getByRole("list")
    .first()
    .evaluate((ul) =>
      [...ul.children].map((li) => {
        const s = getComputedStyle(li);
        return `${s.animationName} ${s.animationDelay}`;
      }),
    );
  expect(delays).toEqual(["rise 0s", "rise 0.04s", "rise 0.08s"]);
  // The action is a pill with a visible focus ring.
  const action = page.getByRole("link", {
    name: "Resolver con Dream: Factorización",
  });
  await expect(action).toHaveCSS("border-radius", "999px");
  await action.focus();
  await expect(action).toHaveCSS("outline-style", "solid");
  // The tick lands with the soft spring (250 ms on transform).
  const tick = await page
    .getByRole("checkbox", { name: /Factorización/ })
    .evaluate((el) => {
      const s = getComputedStyle(el.nextElementSibling as Element);
      return `${s.transitionProperty} ${s.transitionDuration}`;
    });
  expect(tick).toBe("opacity, transform 0.16s, 0.25s");
});

test("estilo: phone hides the sticker; reduced motion only fades", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, [unit(0, "Factorización", "completed")]);
  await page.getByRole("heading", { name: "Pendientes" }).waitFor();
  const panel = page.getByRole("region", { name: "Resolver un ejercicio" });
  await expect(panel.locator('[aria-hidden="true"]').first()).toBeHidden();
  // Everything done: the lime sticker next to «Lo tienes todo al día.».
  const allDone = page.getByText("Lo tienes todo al día.");
  await expect(allDone).toBeVisible();
  const icon = allDone.locator('[aria-hidden="true"]').first();
  await expect(icon).toHaveCSS("background-color", "rgb(200, 245, 96)");
  expect(await icon.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "fade",
  );
});
