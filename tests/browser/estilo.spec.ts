import { test, expect, type Page } from "@playwright/test";
// Primitives of the new style on the style lab (app/estilo). The lab only
// exists when the server runs with DREAM_STYLE_LAB=1; otherwise these skip.
// CAPTURAS_DIR=<dir> also saves screenshots, GRABAR=<dir> a short video.
test.use({ serviceWorkers: "block" });

async function openLab(page: Page) {
  const res = await page.goto("/estilo");
  test.skip(res?.status() === 404, "Start the server with DREAM_STYLE_LAB=1");
  await page.getByRole("heading", { level: 1 }).waitFor();
}
const moving = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect).target as Element | null;
          return !!t?.closest(sel);
        })
        .filter((a) =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .some((k) => k.transform && k.transform !== "none"),
        )
        .map((a) => (a as CSSAnimation).animationName),
    selector,
  );

test("the number rolls up when it grows and reads one value", async ({
  page,
}) => {
  await openLab(page);
  const card = page.locator("section").filter({ hasText: "Nota objetivo" });
  await card.getByRole("button", { name: "Subir" }).click();
  expect(await moving(page, ".num-roll")).toEqual(
    expect.arrayContaining(["num-in-up", "num-out-up"]),
  );
  await expect(card.locator(".visually-hidden").first()).toHaveText(
    "8,5 sobre 10",
  );
  await card.getByRole("button", { name: "Bajar" }).click();
  expect(await moving(page, ".num-roll")).toEqual(
    expect.arrayContaining(["num-in-down"]),
  );
  // The old value leaves the DOM once its animation ends.
  await expect(card.locator(".num-roll-out")).toHaveCount(0);
});

test("the Orb hops on success and shakes on error", async ({ page }) => {
  await openLab(page);
  await page.getByRole("button", { name: "Acierto" }).click();
  expect(await moving(page, ".orb-success")).toContain("orb-hop");
  await page.getByRole("button", { name: "Fallo" }).click();
  expect(await moving(page, ".orb-error")).toContain("orb-shake");
});

test("phone: the bottom sheet rises and a flick on the grabber closes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  await page.getByRole("button", { name: "Abrir hoja" }).click();
  const sheet = page.getByRole("dialog", { name: "¿Salir?" });
  await expect(sheet).toBeVisible();
  expect(await moving(page, ".bottom-sheet")).toContain("sheet-up");
  await page.waitForTimeout(300);
  const grab = await page.locator(".sheet-grabber").boundingBox();
  expect(grab!.height).toBeGreaterThanOrEqual(44); // touch target
  // A short, fast flick down (velocity > 0.11 px/ms) closes it.
  await page.mouse.move(grab!.x + grab!.width / 2, grab!.y + 20);
  await page.mouse.down();
  await page.mouse.move(grab!.x + grab!.width / 2, grab!.y + 80, { steps: 2 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
});

test("phone: a small slow drag snaps the sheet back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  await page.getByRole("button", { name: "Abrir hoja" }).click();
  const sheet = page.getByRole("dialog", { name: "¿Salir?" });
  await page.waitForTimeout(300);
  const grab = (await page.locator(".sheet-grabber").boundingBox())!;
  await page.mouse.move(grab.x + 100, grab.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(grab.x + 100, grab.y + 40, { steps: 4 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-drag", "rest");
  // Escape still closes it (keyboard way out).
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("reduced motion: primitives only fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  await page.getByRole("button", { name: "Subir" }).click();
  await page.getByRole("button", { name: "Acierto" }).click();
  await page.getByRole("button", { name: "Repetir entrada" }).click();
  await page.getByRole("button", { name: "Abrir hoja" }).click();
  expect(await moving(page, "body")).toEqual([]);
});

const OUT = process.env.CAPTURAS_DIR;
test.describe("capturas", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  for (const vp of [
    { name: "movil", width: 390, height: 844 },
    { name: "escritorio", width: 1280, height: 900 },
  ])
    for (const scheme of ["light", "dark"] as const)
      test(`estilo ${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.emulateMedia({ colorScheme: scheme });
        await openLab(page);
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `${OUT}/estilo-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
          fullPage: true,
        });
      });
  test("estilo reducido", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLab(page);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${OUT}/estilo-movil-reducido.png`,
      fullPage: true,
    });
  });
  test("hoja inferior movil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page);
    await page.getByRole("button", { name: "Abrir hoja" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/estilo-hoja-movil-claro.png` });
  });
});

const REC = process.env.GRABAR;
test("grabación de las primitivas", async ({ browser }) => {
  test.skip(!REC, "Set GRABAR to record the video");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: `${REC}/tmp`, size: { width: 390, height: 844 } },
    serviceWorkers: "block",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await openLab(page);
  await page.waitForTimeout(1200);
  const press = async (name: string, wait = 600) => {
    const b = page.getByRole("button", { name }).first();
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await page.waitForTimeout(wait);
  };
  for (const n of ["Subir", "Subir", "Bajar", "Un día menos"]) await press(n);
  await press("Acierto", 800);
  await press("Fallo", 800);
  const pill = page.locator(".button-3d").nth(1);
  await pill.scrollIntoViewIfNeeded();
  const box = (await pill.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await press("Repetir entrada", 1000);
  await press("Abrir hoja", 900);
  const grab = (await page.locator(".sheet-grabber").boundingBox())!;
  await page.mouse.move(grab.x + 180, grab.y + 20);
  await page.mouse.down();
  await page.mouse.move(grab.x + 180, grab.y + 120, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${REC}/estilo-primitivas.webm`);
});
