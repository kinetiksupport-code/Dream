import { test, expect, type Page } from "@playwright/test";
import { algebraExam, fixture, historyExam } from "./progress-fixture";
// Progreso with the new style (PROMPT_EXAMEN_ESTILO.md §6): bars fill with
// transform, numbers roll, cards stagger, the tab pill slides, focus is
// visible and reduced motion leaves fades only.
test.use({ serviceWorkers: "block" });

async function open(page: Page, reducedMotion: "reduce" | "no-preference") {
  await fixture(page, [historyExam, algebraExam]);
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/progress");
  await page
    .getByRole("progressbar", { name: "Preparación para el examen" })
    .waitFor();
}

/** Running CSS animations on the page: name and whether they move things. */
const animations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [];
      return {
        name: (a as CSSAnimation).animationName ?? "",
        moves: frames.some((k) => k.transform && k.transform !== "none"),
        props: [
          ...new Set(
            frames.flatMap((k) =>
              Object.keys(k).filter(
                (p) => !["offset", "easing", "composite", "computedOffset"].includes(p),
              ),
            ),
          ),
        ],
      };
    }),
  );

test("bars fill with transform and numbers roll to their value", async ({ page }) => {
  await open(page, "no-preference");
  // Ecuaciones is at 95 %: the fill keeps the full width and scales.
  const bar = page.getByRole("progressbar", {
    name: "Dominio de Ecuaciones",
    exact: true,
  });
  const fill = bar.locator("i");
  await expect
    .poll(async () => {
      const [outer, inner] = await Promise.all([
        bar.boundingBox(),
        fill.boundingBox(),
      ]);
      return outer && inner ? Math.round((inner.width / outer.width) * 100) : 0;
    })
    .toBe(95);
  const style = await fill.evaluate((el) => ({
    width: getComputedStyle(el).width,
    parent: getComputedStyle(el.parentElement as Element).width,
    transform: getComputedStyle(el).transform,
  }));
  expect(style.width).toBe(style.parent);
  expect(style.transform).toMatch(/^matrix\(0\.95/);

  // The readiness number rolls up to 52 % and is read once.
  const ring = page.getByRole("progressbar", { name: "Preparación para el examen" });
  await expect(ring.locator(".num-roll-in")).toHaveText("52 %");
  await expect(ring.locator(".num-roll .visually-hidden")).toHaveText("52 %");
  await expect(ring.locator(".num-roll-out")).toHaveCount(0, { timeout: 1000 });

  // Every animation on the page moves only transform and opacity.
  for (const a of await animations(page))
    expect(a.props.every((p) => p === "transform" || p === "opacity"), a.name).toBe(true);
});

test("cards stagger 40 ms apart and the tab pill slides under the tab", async ({
  page,
}) => {
  await open(page, "no-preference");
  const delays = await page
    .locator('[role="tabpanel"] > .stagger > *')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay));
  expect(delays.slice(0, 4)).toEqual(["0s", "0.04s", "0.08s", "0.12s"]);

  const tab = page.getByRole("tab", { name: "Simulacros" });
  await tab.click();
  const pill = page.locator('[role="tablist"] > span[aria-hidden="true"]');
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([pill.boundingBox(), tab.boundingBox()]);
      return a && b ? Math.round(Math.abs(a.x - b.x)) : 99;
    })
    .toBeLessThanOrEqual(1);
  expect(await pill.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
    "transform",
  );
});

test("focus is visible on tabs and result rows press", async ({ page }) => {
  await open(page, "no-preference");
  await page.getByRole("tab", { name: "Preparación" }).focus();
  await page.keyboard.press("ArrowRight");
  const focused = page.getByRole("tab", { name: "Simulacros" });
  await expect(focused).toBeFocused();
  const outline = await focused.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("link", { name: /Simulacro.*60\s%/ })).toHaveClass(
    /\bpress\b/,
  );
});

test("reduced motion: nothing moves, things only fade", async ({ page }) => {
  await open(page, "reduce");
  const running = await animations(page);
  expect(running.length).toBeGreaterThan(0);
  for (const a of running) expect(a.moves, a.name).toBe(false);
  // The bars still show their value.
  await expect(
    page.getByRole("progressbar", { name: "Dominio de Ecuaciones", exact: true }),
  ).toHaveAttribute("aria-valuenow", "95");
});
