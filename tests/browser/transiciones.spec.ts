import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Page transitions (PROMPT_EXAMEN_ESTILO.md §3): a link inside the Shell runs a
// View Transition on the page area (200–280 ms, transform + opacity, ease-out),
// Back reverses the direction, reduced motion only fades, the browser's Back
// and the scroll position keep working, and browsers without View
// Transitions get the CSS enter animation instead.
test.use({ serviceWorkers: "block" });

type Running = {
  pseudo: string;
  name: string;
  duration: number;
  easing: string;
  moves: boolean;
  props: string[];
  x: number[];
};

/** Wraps startViewTransition so the test can read its animations once ready. */
async function spyTransitions(page: Page) {
  await page.addInitScript(() => {
    const doc = document as unknown as {
      startViewTransition?: (
        arg: unknown,
      ) => { ready: Promise<void>; finished: Promise<void> };
    };
    const start = doc.startViewTransition?.bind(doc);
    if (!start) return;
    const w = window as unknown as { vts: Promise<unknown>[] };
    w.vts = [];
    doc.startViewTransition = (arg: unknown) => {
      const t = start(arg);
      w.vts.push(
        t.ready
          .then(() =>
            document.getAnimations().map((a) => {
              const e = a.effect as KeyframeEffect;
              const frames = e.getKeyframes();
              const timing = e.getComputedTiming();
              return {
                pseudo: e.pseudoElement ?? "",
                name: (a as CSSAnimation).animationName ?? "",
                duration: Number(timing.duration),
                // CSS animations carry their curve on the keyframes.
                easing: String(frames[0]?.easing ?? e.getTiming().easing),
                moves: frames.some(
                  (k) => k.transform && k.transform !== "none",
                ),
                props: [
                  ...new Set(
                    frames.flatMap((k) =>
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
                x: frames.map((k) => {
                  const m = String(k.transform ?? "").match(
                    /translateX\((-?[\d.]+)px\)|translate\((-?[\d.]+)px/,
                  );
                  return m ? Number(m[1] ?? m[2]) : 0;
                }),
              };
            }),
          )
          .catch(() => []),
      );
      return t;
    };
  });
}
const lastTransition = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { vts: Promise<unknown>[] };
    return (await w.vts.at(-1)) ?? null;
  }) as Promise<Running[] | null>;
const transitionCount = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { vts?: unknown[] }).vts?.length ?? -1,
  );

async function open(page: Page, path: string) {
  await mock(page, {});
  await page.goto(path);
  await page.locator(".route-view h1").first().waitFor();
}

const pageAnimations = (all: Running[]) =>
  all.filter((a) => /view-transition-(old|new)\(page\)/.test(a.pseudo));

test.describe("transiciones entre páginas", () => {
  test("un enlace del menú cambia de página con una View Transition corta", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await spyTransitions(page);
    await open(page, "/tasks");
    const before = await transitionCount(page);
    await page
      .getByRole("navigation", { name: "Principal" })
      .first()
      .getByRole("link", { name: "Apuntes" })
      .click();
    await expect(page).toHaveURL(/\/notes$/);
    expect(await transitionCount(page)).toBe(before + 1);
    const vt = pageAnimations((await lastTransition(page)) ?? []);
    const entering = vt.find((a) => a.pseudo.includes("new(page)"));
    expect(entering, "la página nueva entra animada").toBeTruthy();
    for (const a of vt) {
      expect(a.duration).toBeGreaterThanOrEqual(120);
      expect(a.duration).toBeLessThanOrEqual(280);
      // Only transform and opacity, never layout.
      for (const p of a.props) expect(["transform", "opacity"]).toContain(p);
    }
    expect(entering!.duration).toBeGreaterThanOrEqual(200);
    // Ease-out (strong curve) for what enters.
    expect(entering!.easing).toMatch(/cubic-bezier\(0\.23, 1, 0\.32, 1\)|ease-out/);
    // The chrome does not fade: only the page area animates.
    const root = ((await lastTransition(page)) ?? []).filter(
      (a) => a.pseudo.includes("(root)") && a.name !== "",
    );
    expect(root.filter((a) => a.moves)).toEqual([]);
    // The marker attribute is cleaned up when the transition ends.
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.pageTransition),
      )
      .toBeUndefined();
  });

  test("entrar en un detalle desliza hacia la izquierda y Atrás invierte la dirección", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await spyTransitions(page);
    await open(page, "/exams");
    await page.getByRole("link", { name: /Álgebra/ }).first().click();
    await expect(page).toHaveURL(/\/exams\/[\w-]+$/);
    const forward = pageAnimations((await lastTransition(page)) ?? []);
    const fIn = forward.find((a) => a.pseudo.includes("new(page)"))!;
    expect(fIn.moves).toBe(true);
    expect(fIn.x[0]).toBeGreaterThan(0); // comes from the right
    // Browser Back: the page enters from the left (CSS enter animation, the
    // traversal is never held back by a View Transition).
    await page.goBack();
    await expect(page).toHaveURL(/\/exams$/);
    await expect(page.locator(".route-view")).toHaveAttribute(
      "data-enter",
      "back",
    );
  });

  test("el botón Atrás del navegador y la posición de scroll siguen funcionando", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await open(page, "/settings");
    const scroller = page.locator(".workspace-main");
    await scroller.evaluate((el) => (el.scrollTop = 400));
    await page.waitForTimeout(100);
    const saved = await scroller.evaluate((el) => el.scrollTop);
    expect(saved).toBeGreaterThan(100);
    await page.getByRole("link", { name: "Tareas" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    // A new page starts at the top.
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await page.locator(".route-view h1").first().waitFor();
    // Back returns to where the student was.
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(saved - 40);
    await page.goForward();
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test("con movimiento reducido el cambio de página solo funde", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 860 });
    await spyTransitions(page);
    await open(page, "/exams");
    await page.getByRole("link", { name: /Álgebra/ }).first().click();
    await expect(page).toHaveURL(/\/exams\/[\w-]+$/);
    const vt = (await lastTransition(page)) ?? [];
    expect(vt.filter((a) => a.moves)).toEqual([]);
    for (const a of pageAnimations(vt))
      expect(a.duration).toBeLessThanOrEqual(150);
    await page.goBack();
    await expect(page).toHaveURL(/\/exams$/);
    const moving = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          ((a.effect as KeyframeEffect).getKeyframes() ?? []).some(
            (k) => k.transform && k.transform !== "none",
          ),
        )
        .map((a) => (a as CSSAnimation).animationName),
    );
    expect(moving).toEqual([]);
  });

  test("sin View Transitions la página entra con la animación CSS", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as { startViewTransition?: unknown })
        .startViewTransition;
    });
    await page.setViewportSize({ width: 1280, height: 860 });
    await open(page, "/exams");
    await page.getByRole("link", { name: /Álgebra/ }).first().click();
    await expect(page).toHaveURL(/\/exams\/[\w-]+$/);
    await expect(page.locator(".route-view")).toHaveAttribute(
      "data-enter",
      "forward",
    );
    const name = await page
      .locator(".route-view")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("page-enter-forward");
  });
});

// Evidence: GRABAR=<dir> records the navigation (desktop and phone).
const REC = process.env.GRABAR;
const NAME = process.env.GRABAR_NOMBRE ?? "transiciones";
test.describe("grabación", () => {
  test.skip(!REC, "Set GRABAR to record the video");
  for (const vp of [
    { name: "escritorio", width: 1280, height: 800 },
    { name: "movil", width: 390, height: 844 },
  ])
    test(`navegación ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        recordVideo: { dir: `${REC}/tmp`, size: vp },
        serviceWorkers: "block",
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      await open(page, "/chat");
      await page.waitForTimeout(700);
      const go = async (name: string) => {
        await page
          .getByRole("navigation", { name: "Principal" })
          .getByRole("link", { name, exact: true })
          .filter({ visible: true })
          .first()
          .click();
        await page.waitForTimeout(900);
      };
      await go("Tareas");
      if (vp.name === "movil") {
        await go("Más");
        await page
          .getByRole("link", { name: /Exámenes/ })
          .filter({ visible: true })
          .first()
          .click();
        await page.waitForTimeout(900);
      } else await go("Exámenes");
      await page.getByRole("link", { name: /Álgebra/ }).first().click();
      await page.waitForTimeout(1100);
      await page.goBack();
      await page.waitForTimeout(1000);
      await page.goBack();
      await page.waitForTimeout(1000);
      const video = page.video();
      await context.close();
      if (video) await video.saveAs(`${REC}/${NAME}-${vp.name}.webm`);
    });
});
