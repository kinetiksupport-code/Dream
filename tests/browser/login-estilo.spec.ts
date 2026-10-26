import { test, expect, type Page } from "@playwright/test";
import { mock, SCREENS } from "./design-fixture";
// Login and registration with the new style (PROMPT_EXAMEN_ESTILO.md §2, §6):
// saturated blue on the key screen, the Orb on a yellow sticker, italic
// headlines, a short staggered entry that never delays the Google button,
// and fades only with reduced motion.
test.use({ serviceWorkers: "block" });

const signedOut = (page: Page) =>
  page.addInitScript(() =>
    localStorage.setItem("dream-storage-notice-v1", "1"),
  );

const keyframeProps = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation)
      .map((a) => ({
        name: (a as CSSAnimation).animationName,
        loop: (a.effect as KeyframeEffect).getTiming().iterations === Infinity,
        moves: ((a.effect as KeyframeEffect).getKeyframes() ?? []).some(
          (k) => k.transform && k.transform !== "none",
        ),
        props: [
          ...new Set(
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .flatMap((k) =>
                Object.keys(k).filter(
                  (p) =>
                    ![
                      "offset",
                      "easing",
                      "composite",
                      "computedOffset",
                    ].includes(p),
                ),
              ),
          ),
        ],
      })),
  );

test("desktop: blue brand panel, mascot sticker and italic pitch", async ({
  page,
}) => {
  await signedOut(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  const panel = page.getByRole("region", { name: "Dream" });
  // --pop-blue #1e40d8 with white ink (7.55:1).
  expect(
    await panel.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(30, 64, 216)");
  expect(await panel.evaluate((el) => getComputedStyle(el).color)).toBe(
    "rgb(255, 255, 255)",
  );
  await expect(panel.getByText("Entiende lo que estudias.")).toHaveCSS(
    "font-style",
    "italic",
  );
  const mascot = panel.locator(".sticker");
  await expect(mascot).toHaveCount(1);
  expect(
    await mascot.evaluate((el) => el.closest("[aria-hidden='true']") !== null),
  ).toBe(true);
  for (const a of await keyframeProps(page))
    expect(
      a.props.every((p) => p === "transform" || p === "opacity"),
      a.name,
    ).toBe(true);
});

test("phone: the whole screen is blue and the texts keep AA ink", async ({
  page,
}) => {
  await signedOut(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const main = page.locator("main");
  expect(
    await main.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(30, 64, 216)");
  for (const name of ["Términos y condiciones", "Volver al inicio"])
    expect(
      await page
        .getByRole("link", { name })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe("rgb(255, 255, 255)");
  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar en Dream" }),
  ).toHaveCSS("font-style", "italic");
  // The Google button enters with the rest (prompt «bienvenida» §3.3), but
  // only with opacity and a small rise: it can be pressed from the first frame.
  const google = page.getByRole("button", { name: "Continuar con Google" });
  expect(await google.evaluate((el) => getComputedStyle(el).animationName)).toMatch(/riseIn/);
  await expect(google).toBeEnabled();
});

test("registration: mascot, italic heading and the 3D «Empezar»", async ({
  page,
}) => {
  const screen = SCREENS.find((s) => s.name === "login-registro")!;
  await mock(page, { profile: screen.profile });
  await page.goto("/chat");
  const heading = page.getByRole("heading", { name: /Hola! Soy Dream/ });
  await expect(heading).toHaveCSS("font-style", "italic");
  const submit = page.getByRole("button", { name: "Empezar" });
  await expect(submit).toHaveClass(/button-3d/);
  // Pressed: the face sinks (transform only).
  await page.waitForTimeout(400);
  const box = (await submit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const face = await submit
    .locator(".button-3d-face")
    .evaluate((el) => getComputedStyle(el).transform);
  expect(face).toMatch(/^matrix\(1, 0, 0, 1, 0, 3\)/);
  await page.mouse.move(0, 0);
  await page.mouse.up();
});

test("reduced motion: login and registration only fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedOut(page);
  await page.goto("/login");
  for (const a of await keyframeProps(page))
    if (!a.loop) expect(a.moves, a.name).toBe(false);
  const screen = SCREENS.find((s) => s.name === "login-registro")!;
  await mock(page, { profile: screen.profile });
  await page.goto("/chat");
  await page.getByRole("heading", { name: /Hola! Soy Dream/ }).waitFor();
  for (const a of await keyframeProps(page))
    if (!a.loop) expect(a.moves, a.name).toBe(false);
});
