import { test, expect, type Page } from "@playwright/test";
import { mock, SCREENS } from "./design-fixture";
// design:check in the browser (DISENO_EVIDENCIA.md). Fails when an interactive
// element has no visible focus, UI motion runs longer than 400 ms, reduced
// motion still moves things, or a phone-width layout scrolls sideways.
test.use({ serviceWorkers: "block" });

const screens = SCREENS.filter((s) => s.name !== "chat-esperando");

async function open(page: Page, name: string) {
  const screen = SCREENS.find((s) => s.name === name)!;
  if (screen.signedOut)
    await page.addInitScript(() =>
      localStorage.setItem("dream-storage-notice-v1", "1"),
    );
  else await mock(page, { profile: screen.profile });
  await page.goto(screen.path);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  if (screen.ready) await screen.ready(page).catch(() => {});
}

/** Animations that are not looping indicators and last longer than 400 ms. */
const slowAnimations = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => {
        const t = a.effect?.getTiming();
        const name =
          (a as CSSAnimation).animationName ??
          (a as CSSTransition).transitionProperty ??
          "anim";
        const target = (a.effect as KeyframeEffect | null)?.target;
        return {
          name,
          duration: Number(t?.duration ?? 0),
          iterations: t?.iterations ?? 1,
          where: target ? (target as Element).className?.toString?.() : "",
        };
      })
      .filter((a) => a.iterations !== Infinity && a.duration > 400),
  );

/** Running animations that move things (transform), for reduced motion. */
const movingAnimations = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running" || a.pending)
      .filter((a) =>
        ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
          (k) => k.transform && k.transform !== "none",
        ),
      )
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as
          Element | undefined;
        return `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty} on ${target?.className?.toString?.() ?? target?.tagName}`;
      }),
  );

for (const screen of screens) {
  test(`${screen.name}: every interactive element shows keyboard focus`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await open(page, screen.name);
    await page.keyboard.press("Tab"); // keyboard modality → :focus-visible
    const missing = await page.evaluate(async () => {
      const selector =
        'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== "hidden" &&
          s.display !== "none"
        );
      };
      const look = (el: Element) => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}|${s.borderColor}`;
      };
      const out: string[] = [];
      for (const el of [...document.querySelectorAll(selector)].filter(
        visible,
      )) {
        (document.activeElement as HTMLElement | null)?.blur();
        // A text field may show focus on its box (:focus-within), so look at
        // the element, its ::after ring and up to three ancestors.
        const chain = [el];
        for (
          let p = el.parentElement;
          p && chain.length < 4;
          p = p.parentElement
        )
          chain.push(p);
        const snap = () =>
          chain
            .map((n) => look(n) + "|" + getComputedStyle(n, "::after").opacity)
            .join("~");
        await new Promise((r) => setTimeout(r, 260)); // let a fade-out finish
        const before = snap();
        (el as HTMLElement).focus();
        if (document.activeElement !== el) continue; // not focusable here
        const s = getComputedStyle(el);
        await new Promise((r) => setTimeout(r, 260)); // let a fade finish
        const ring =
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          snap() !== before;
        if (!ring)
          out.push(
            `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}»`,
          );
      }
      return out;
    });
    expect(missing).toEqual([]);
  });

  test(`${screen.name}: motion is short and reduced motion does not move`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1280, height: 860 });
    await open(page, screen.name);
    const press = page.locator(".press:visible").first();
    if (await press.count()) await press.hover().catch(() => {});
    expect(await slowAnimations(page)).toEqual([]);

    const reduced = await page.context().newPage();
    await reduced.emulateMedia({ reducedMotion: "reduce" });
    await reduced.setViewportSize({ width: 1280, height: 860 });
    await open(reduced, screen.name);
    expect(await movingAnimations(reduced)).toEqual([]);
    const target = reduced.locator(".press:visible").first();
    if (await target.count()) {
      await target.hover().catch(() => {});
      await reduced.mouse.down();
      expect(await movingAnimations(reduced)).toEqual([]);
      await reduced.mouse.up();
    }
    await reduced.close();
  });
}

for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
])
  test(`no sideways scroll at ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    const wide: string[] = [];
    for (const screen of screens) {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await open(page, screen.name);
      const over = await page.evaluate(() => {
        const roots = [
          document.scrollingElement,
          document.querySelector(".workspace-main"),
        ].filter(Boolean) as Element[];
        return roots.some((r) => r.scrollWidth > r.clientWidth + 1);
      });
      if (over) wide.push(screen.name);
    }
    expect(wide).toEqual([]);
  });

test("theme choice wins over the system: Claro stays light on a dark system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "ajustes");
  await page.getByRole("button", { name: "Claro" }).click();
  const state = () =>
    page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
    }));
  expect(await state()).toEqual({ theme: "light", bg: "rgb(255, 255, 255)" });
  await page.reload();
  expect(await state()).toEqual({ theme: "light", bg: "rgb(255, 255, 255)" });
  await expect(page.getByRole("button", { name: "Claro" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the font stack resolves to the self-hosted Inter (not the browser default)", async ({
  page,
}) => {
  await open(page, "login");
  // The original bug: --font-stack was empty, so Android fell back to Roboto.
  // This machine has Inter installed locally, so assert the stack and the
  // self-hosted @font-face, not which file the renderer picked.
  const font = await page.evaluate(() => ({
    stack: getComputedStyle(document.body).fontFamily,
    faces: [...document.fonts].map((f) => f.family),
  }));
  expect(font.stack).toMatch(/Inter/);
  expect(font.stack).not.toMatch(/Roboto|Segoe/);
  expect(font.faces).toContain("Inter");
});
