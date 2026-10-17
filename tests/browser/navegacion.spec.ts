import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Navegación: sliding active pill (sidebar on Y, tab bar on X), item states,
// reduced motion, keyboard, and the tab bar never covering the end of a page.
test.use({ serviceWorkers: "block" });

/** Records every transition that starts on a .nav-indicator. */
async function open(page: Page, path: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pill: string[] };
    w.__pill = [];
    document.addEventListener(
      "transitionrun",
      (e) => {
        if ((e.target as Element).classList?.contains("nav-indicator"))
          w.__pill.push(e.propertyName);
      },
      true,
    );
  });
  await mock(page);
  await page.goto(path);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}
const pillRuns = (page: Page) =>
  page.evaluate(() => (window as unknown as { __pill: string[] }).__pill);
const pill = (page: Page, nav: string) => page.locator(`${nav} .nav-indicator`);
const transformOf = (page: Page, nav: string) =>
  pill(page, nav).evaluate((el) => (el as HTMLElement).style.transform);
/** Moving (transform) animations currently on the pill. */
const sliding = (page: Page, nav: string) =>
  pill(page, nav).evaluate(
    (el) =>
      el
        .getAnimations()
        .filter(
          (a) => (a as CSSTransition).transitionProperty === "transform",
        ).length,
  );
async function expectPillOn(page: Page, nav: string, name: string) {
  const link = page.locator(nav).getByRole("link", { name, exact: true });
  await expect(link).toHaveAttribute("aria-current", "page");
  const [a, b] = await Promise.all([
    pill(page, nav).boundingBox(),
    link.boundingBox(),
  ]);
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(1.5);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(1.5);
}

test.describe("barra lateral (escritorio)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("no anima en la primera carga y se desliza al cambiar de sección", async ({
    page,
  }) => {
    await open(page, "/chat");
    await expectPillOn(page, ".sidebar", "Inicio");
    await page.waitForTimeout(300);
    expect(await pillRuns(page)).toEqual([]); // first paint: no slide
    const before = await transformOf(page, ".sidebar");
    const links = page.locator(".sidebar .nav-link");
    const layout = await links.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().toJSON()),
    );

    await page
      .locator(".sidebar")
      .getByRole("link", { name: "Tareas", exact: true })
      .click();
    await expect
      .poll(() => pillRuns(page), { timeout: 2000 })
      .toContain("transform");
    await page.waitForTimeout(300);
    await expectPillOn(page, ".sidebar", "Tareas");
    const after = await transformOf(page, ".sidebar");
    expect(after).not.toBe(before);
    expect(after).toMatch(/translateY\((\d+)px\)/);
    // No layout jumps: the items stay exactly where they were.
    expect(
      await links.evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect().toJSON()),
      ),
    ).toEqual(layout);
    // The active pill is the only active background (no double fill).
    expect(
      await page
        .locator('.sidebar [aria-current="page"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
  });

  test("movimiento reducido: cambia sin desplazarse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/chat");
    await expectPillOn(page, ".sidebar", "Inicio");
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "Ajustes", exact: true })
      .click();
    await expect(
      page.locator(".sidebar").getByRole("link", { name: "Ajustes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(await sliding(page, ".sidebar")).toBe(0);
    await expectPillOn(page, ".sidebar", "Ajustes"); // already there
    expect(await pillRuns(page)).not.toContain("transform");
  });

  test("teclado: foco visible y sin animación al navegar", async ({ page }) => {
    await open(page, "/chat");
    await page.keyboard.press("Tab"); // keyboard modality → :focus-visible
    const link = page
      .locator(".sidebar")
      .getByRole("link", { name: "Tareas", exact: true });
    await link.focus();
    const ring = await link.evaluate((e) => {
      const s = getComputedStyle(e);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(ring).toBe("solid 2px");
    await page.keyboard.press("Enter");
    await expect(link).toHaveAttribute("aria-current", "page");
    expect(await sliding(page, ".sidebar")).toBe(0);
    await expectPillOn(page, ".sidebar", "Tareas");
    expect(await pillRuns(page)).not.toContain("transform");
  });

  test("estados: hover suave, pulsado con icono, activo anunciado", async ({
    page,
  }) => {
    await open(page, "/chat");
    const link = page
      .locator(".sidebar")
      .getByRole("link", { name: "Apuntes", exact: true });
    const bg = () => link.evaluate((e) => getComputedStyle(e).backgroundColor);
    const rest = await bg();
    await link.hover();
    await page.waitForTimeout(250);
    const hover = await bg();
    expect(hover).not.toBe(rest);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const pressed = await link.evaluate((e) => ({
      item: getComputedStyle(e).transform,
      icon: getComputedStyle(e.querySelector("svg")!).transform,
      bg: getComputedStyle(e).backgroundColor,
    }));
    expect(pressed.item).toBe("matrix(0.97, 0, 0, 0.97, 0, 0)");
    expect(pressed.icon).toBe("matrix(1, 0, 0, 1, 0, 1)");
    expect(pressed.bg).not.toBe(hover);
    await page.mouse.up();
    await expect(link).toHaveAttribute("aria-current", "page");
  });
});

test.describe("barra inferior (móvil)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("el indicador se mueve en X al cambiar de pestaña, no al cargar", async ({
    page,
  }) => {
    await open(page, "/chat");
    await expectPillOn(page, ".tabbar", "Inicio");
    await page.waitForTimeout(300);
    expect(await pillRuns(page)).toEqual([]);
    const before = await transformOf(page, ".tabbar");
    await page
      .locator(".tabbar")
      .getByRole("link", { name: "Tareas", exact: true })
      .tap();
    await expect
      .poll(() => pillRuns(page), { timeout: 2000 })
      .toContain("transform");
    await page.waitForTimeout(300);
    await expectPillOn(page, ".tabbar", "Tareas");
    const after = await transformOf(page, ".tabbar");
    const x = (t: string) => Number(t.match(/translateX\(([\d.]+)px\)/)![1]);
    const y = (t: string) => t.match(/translateY\(([\d.]+)px\)/)![1];
    expect(x(after)).toBeGreaterThan(x(before));
    expect(y(after)).toBe(y(before)); // slides sideways only
  });

  test("Más sigue activa en sus secciones (Ajustes)", async ({ page }) => {
    await open(page, "/settings");
    await expectPillOn(page, ".tabbar", "Más");
  });
});

test("Más: filas con hover, pulsado y foco; la flecha se desplaza 2 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/more");
  const row = page.locator(".group-link", { hasText: "Exámenes" });
  const chevron = row.locator("svg").last();
  const t = () => chevron.evaluate((e) => getComputedStyle(e).transform);
  expect(await t()).toBe("none");
  await row.hover();
  await page.waitForTimeout(200);
  expect(await t()).toBe("matrix(1, 0, 0, 1, 2, 0)");
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect(await row.evaluate((e) => getComputedStyle(e).transform)).toBe(
    "matrix(0.98, 0, 0, 0.98, 0, 0)",
  );
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press("Tab");
  await row.focus();
  expect(
    await row.evaluate((e) => {
      const s = getComputedStyle(e);
      return `${s.outlineStyle} ${s.outlineOffset}`;
    }),
  ).toBe("solid -2px"); // inside the rounded group, never clipped

  const reduced = await page.context().newPage();
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await open(reduced, "/more");
  const r = reduced.locator(".group-link", { hasText: "Exámenes" });
  await r.hover();
  await reduced.waitForTimeout(200);
  expect(
    await r.locator("svg").last().evaluate((e) => getComputedStyle(e).transform),
  ).toBe("none");
  await reduced.close();
});

for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
])
  test(`${vp.width}×${vp.height}: nada queda tapado al final de Ajustes y Tareas`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    for (const path of ["/settings", "/tasks"]) {
      await open(page, path);
      await page.locator(".route-view h1").first().waitFor();
      const r = await page.evaluate(async () => {
        const main = document.querySelector(".workspace-main")!;
        main.scrollTop = main.scrollHeight;
        await new Promise((ok) => setTimeout(ok, 150));
        const bar = document.querySelector(".tabbar")!;
        const barShown = getComputedStyle(bar).display !== "none";
        const limit = barShown
          ? bar.getBoundingClientRect().top
          : window.innerHeight;
        const page = document.querySelector(".route-view > *")!;
        const bottom = Math.max(
          ...[...page.querySelectorAll("*")]
            .map((e) => e.getBoundingClientRect())
            .filter((b) => b.height > 1 && b.width > 1) // skip .visually-hidden
            .map((b) => b.bottom),
        );
        const tabs = [...document.querySelectorAll(".tab")].map((t) => {
          const b = t.getBoundingClientRect();
          return {
            w: b.width,
            h: b.height,
            font: getComputedStyle(t.querySelector(".nav-label")!).fontSize,
          };
        });
        const side = document.querySelector(".sidebar");
        return {
          bottom,
          limit,
          barShown,
          tabs,
          sidebarFits: side
            ? side.scrollHeight <= side.clientHeight + 1
            : true,
        };
      });
      expect(r.bottom, `${path}: último elemento visible`).toBeLessThanOrEqual(
        r.limit + 0.5,
      );
      if (r.barShown)
        for (const t of r.tabs) {
          expect(t.w).toBeGreaterThanOrEqual(44);
          expect(t.h).toBeGreaterThanOrEqual(44);
          expect(t.font).toBe("11px"); // Claude Design
        }
      else expect(r.sidebarFits, "la barra lateral cabe sin scroll").toBe(true);
    }
  });
