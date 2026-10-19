import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Ajustes with the new style (PROMPT_EXAMEN_ESTILO.md §2, §6): italic
// headline, sections that rise 40 ms apart, a decorative initial sticker and
// the chosen theme's icon in its tone. Reduced motion: fades only.
test.use({ serviceWorkers: "block" });

async function open(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ reducedMotion, colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await mock(page);
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Ajustes", level: 1 }).waitFor();
}

test("headline, staggered sections and only transform/opacity", async ({
  page,
}) => {
  await open(page, "no-preference");
  const h1 = page.getByRole("heading", { name: "Ajustes", level: 1 });
  expect(await h1.evaluate((el) => getComputedStyle(el).fontStyle)).toBe(
    "italic",
  );
  const delays = await page
    .locator(".page-settings > section")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay));
  expect(delays.slice(0, 3)).toEqual(["0.04s", "0.08s", "0.12s"]);
  // Keyframe animations only (colour transitions are allowed by design:check).
  const props = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation)
      .flatMap((a) =>
        ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).flatMap(
          (k) =>
            Object.keys(k).filter(
              (p) =>
                !["offset", "easing", "composite", "computedOffset"].includes(
                  p,
                ),
            ),
        ),
      ),
  );
  for (const p of props) expect(["transform", "opacity"]).toContain(p);
});

test("the initial sticker is decorative and the theme icon takes its tone", async ({
  page,
}) => {
  await open(page, "no-preference");
  const sticker = page.locator(".page-settings .sticker");
  await expect(sticker).toHaveText("A");
  expect(
    await sticker.evaluate((el) => el.closest("[aria-hidden='true']") !== null),
  ).toBe(true);
  const icon = (name: string) =>
    page
      .getByRole("button", { name })
      .locator("svg")
      .evaluate((el) => getComputedStyle(el).color);
  const idle = await icon("Claro");
  await page.getByRole("button", { name: "Claro" }).click();
  await expect.poll(() => icon("Claro")).not.toBe(idle);
  // --pop-orange (#f05a1e) on the light pill.
  await expect.poll(() => icon("Claro")).toBe("rgb(240, 90, 30)");
});

test("reduced motion: sections fade in without moving", async ({ page }) => {
  await open(page, "reduce");
  const running = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? "",
      moves: ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
        (k) => k.transform && k.transform !== "none",
      ),
    })),
  );
  for (const a of running) expect(a.moves, a.name).toBe(false);
});
