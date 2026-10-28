import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Ajustes: theme cross-fade, easy reading switch, confirmation dialogs, toast
// and the bottom padding above the phone tab bar (docs/diseno/ajustes).
test.use({ serviceWorkers: "block" });

async function open(page: Page, viewport = { width: 1280, height: 860 }) {
  await page.setViewportSize(viewport);
  await mock(page);
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Ajustes" }).waitFor();
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

/** Every running animation, including View Transition pseudo-elements. */
const animations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect | null;
      return {
        name: (a as CSSAnimation).animationName ?? "",
        pseudo: effect?.pseudoElement ?? "",
        duration: Number(effect?.getTiming().duration ?? 0),
        moves: (effect?.getKeyframes() ?? []).some(
          (k) => k.transform && k.transform !== "none",
        ),
        props: [
          ...new Set(
            (effect?.getKeyframes() ?? []).flatMap((k) =>
              Object.keys(k).filter(
                (p) => !["offset", "easing", "composite", "computedOffset"].includes(p),
              ),
            ),
          ),
        ],
      };
    }),
  );

/** Clicks a theme and returns the View Transition's animations once ready. */
async function themeTransition(page: Page, label: string) {
  await page.evaluate(() => {
    const doc = document as Document & {
      startViewTransition: (cb: () => void) => { ready: Promise<void> };
    };
    const start = doc.startViewTransition.bind(doc);
    doc.startViewTransition = (cb) => {
      const t = start(cb);
      (window as unknown as { vt: Promise<unknown> }).vt = t.ready.then(() =>
        document.getAnimations().map((a) => {
          const e = a.effect as KeyframeEffect;
          return {
            pseudo: e.pseudoElement ?? "",
            duration: Number(e.getTiming().duration),
            moves: e
              .getKeyframes()
              .some((k) => k.transform && k.transform !== "none"),
          };
        }),
      );
      return t;
    };
  });
  await page.getByRole("button", { name: label }).click();
  return (await page.evaluate(
    () => (window as unknown as { vt: Promise<unknown> }).vt,
  )) as { pseudo: string; duration: number; moves: boolean }[];
}

test.describe("tema", () => {
  test("cambiar de tema funde la página sin mover nada", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    const running = await themeTransition(page, "Oscuro");
    const vt = running.filter((a) => a.pseudo.startsWith("::view-transition"));
    expect(vt.length).toBeGreaterThan(0);
    for (const a of vt) {
      expect(a.moves, `${a.pseudo} no debe mover`).toBe(false);
      expect(a.duration).toBeLessThanOrEqual(250);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    await expect(page.getByRole("button", { name: "Oscuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("con movimiento reducido el cambio de tema solo funde", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await open(page);
    const running = await themeTransition(page, "Oscuro");
    expect(running.some((a) => a.pseudo.includes("view-transition"))).toBe(true);
    expect(running.filter((a) => a.moves)).toEqual([]);
  });

  test("elegir Claro con el sistema en oscuro deja la página clara", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await page.getByRole("button", { name: "Claro" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      )
      .toBe("rgb(255, 255, 255)");
    await page.reload();
    await page.getByRole("heading", { name: "Ajustes" }).waitFor();
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("light");
  });
});

test("la píldora del tema se desliza con transform y no salta al cargar", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await open(page);
  const pill = page.locator(".segmented-indicator");
  const x = () => pill.evaluate((el) => el.getBoundingClientRect().x);
  // On load the pill already sits under "Sistema", with no running animation.
  const sistema = page.getByRole("button", { name: "Sistema" });
  expect(Math.abs((await x()) - (await sistema.boundingBox())!.x)).toBeLessThan(1);
  expect(await pill.evaluate((el) => el.getAnimations().length)).toBe(0);
  // Record the pill's transitions as they start (the View Transition runs
  // the theme change a frame later).
  await pill.evaluate((el) => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    el.addEventListener("transitionrun", (e) =>
      seen.push((e as TransitionEvent).propertyName),
    );
  });
  await page.getByRole("button", { name: "Claro" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { seen: string[] }).seen))
    .toContain("transform");
  const moving = await page.evaluate(
    () => (window as unknown as { seen: string[] }).seen,
  );
  expect(moving).toContain("transform");
  expect(moving).not.toContain("left");
  expect(moving).not.toContain("width");
  await page.waitForTimeout(300);
  const claro = page.getByRole("button", { name: "Claro" });
  expect(Math.abs((await x()) - (await claro.boundingBox())!.x)).toBeLessThan(1);
});

test.describe("acciones que no se pueden hacer ahora", () => {
  test("sin conexión, Borrar historial y Eliminar cuenta explican por qué", async ({
    page,
    context,
  }) => {
    await open(page);
    await context.setOffline(true);
    const why = page.getByText("Sin conexión. Podrás borrar el historial");
    await expect(why).toBeVisible();
    for (const name of ["Borrar historial", "Eliminar mi cuenta"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toHaveAttribute("aria-disabled", "true");
      // Still focusable, and the reason is its description.
      await button.focus();
      await expect(button).toBeFocused();
      await expect(button).toHaveAccessibleDescription(/Sin conexión/);
      // Playwright treats aria-disabled as not enabled; click anyway.
      await button.click({ force: true });
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    }
    // The reason has an icon and readable text, not just the dimmed button.
    expect(
      await why.evaluate((el) => ({
        icon: !!el.querySelector("svg"),
        opacity: getComputedStyle(el).opacity,
      })),
    ).toEqual({ icon: true, opacity: "1" });
    await context.setOffline(false);
    await expect(why).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Borrar historial" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  test("sin conversaciones, Borrar historial dice que no hay nada que borrar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mock(page);
    await page.route("**/functions/v1/dream-api", async (route) => {
      if (route.request().postDataJSON()?.action === "conversations")
        return route.fulfill({ json: { items: [] } });
      return route.fallback();
    });
    await page.goto("/settings");
    const button = page.getByRole("button", { name: "Borrar historial" });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription(
      "No tienes conversaciones guardadas. No hay historial que borrar.",
    );
    await expect(
      page.getByRole("button", { name: "Eliminar mi cuenta" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("lectura fácil", () => {
  test("el interruptor es accesible, pone Lexend y solo guarda la preferencia", async ({
    page,
  }) => {
    await open(page);
    const sw = page.getByRole("switch", { name: /Lectura fácil/ });
    await expect(sw).toHaveAttribute("aria-checked", "false");
    const thumb = () =>
      sw.evaluate((el) => {
        const s = getComputedStyle(el, "::after");
        return { transform: s.transform, icon: s.backgroundImage };
      });
    expect((await thumb()).icon).toBe("none");

    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(260);
    const on = await thumb();
    // Thumb moves with transform; the check icon means state is not colour only.
    expect(on.transform).toMatch(/matrix\(1, 0, 0, 1, 20, 0\)/);
    expect(on.icon).toContain("svg");
    const state = await page.evaluate(() => ({
      reading: document.documentElement.dataset.reading,
      font: getComputedStyle(document.body).fontFamily,
      lineHeight: getComputedStyle(document.body).lineHeight,
      stored: Object.keys(localStorage).filter((k) => k.startsWith("dream-")),
      value: localStorage.getItem("dream-reading"),
    }));
    expect(state.reading).toBe("easy");
    expect(state.font).toMatch(/Lexend/);
    expect(state.value).toBe("easy");
    // Only preferences live in localStorage, never content. The theme is
    // saved only when the student picks one (docs/cookies-inventario.md).
    expect(state.stored.sort()).toEqual(
      ["dream-reading", "dream-storage-notice-v1"].sort(),
    );

    await page.reload();
    await page.getByRole("heading", { name: "Ajustes" }).waitFor();
    expect(
      await page.evaluate(() => document.documentElement.dataset.reading),
    ).toBe("easy");
    await expect(
      page.getByRole("switch", { name: /Lectura fácil/ }),
    ).toHaveAttribute("aria-checked", "true");

    await page.getByRole("switch", { name: /Lectura fácil/ }).click();
    expect(
      await page.evaluate(() => ({
        reading: document.documentElement.dataset.reading ?? null,
        value: localStorage.getItem("dream-reading"),
      })),
    ).toEqual({ reading: null, value: null });
  });

  test("estados del interruptor: foco, pulsado, desactivado y área táctil", async ({
    page,
  }) => {
    await open(page);
    const sw = page.getByRole("switch", { name: /Lectura fácil/ });
    // Focus ring from the keyboard.
    await page.keyboard.press("Tab");
    await sw.focus();
    const outline = await sw.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(outline).toBe("solid 2px");
    // Pressed: the thumb shrinks a little (transform only).
    const box = (await sw.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(220);
    const pressed = await sw.evaluate(
      (el) => getComputedStyle(el, "::after").transform,
    );
    expect(pressed).toMatch(/matrix\(0\.94/);
    await page.mouse.up();
    // ≥44 px touch area: points just outside the 31 px track still hit it.
    const hits = await sw.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const top = document.elementFromPoint(cx, r.top - 6);
      const bottom = document.elementFromPoint(cx, r.bottom + 6);
      return [top === el, bottom === el, r.height + 14 >= 44];
    });
    expect(hits).toEqual([true, true, true]);
    // Disabled: the consent switches with no service configured.
    const disabled = page.locator(".switch:disabled").first();
    if (await disabled.count())
      expect(
        await disabled.evaluate((el) => getComputedStyle(el).opacity),
      ).toBe("0.5");
  });
});

test.describe("diálogos y avisos", () => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 1280, height: 860 },
  ])
    test(`Borrar historial sale centrado y devuelve el foco (${vp.width} px)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await open(page, vp);
      const trigger = page.getByRole("button", { name: "Borrar historial" });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog", {
        name: "¿Borrar todo el historial?",
      });
      await expect(dialog).toBeVisible();
      const entry = (await animations(page)).find(
        (a) => a.name === "modal-pop",
      );
      expect(entry?.duration).toBe(200);
      const from = await dialog.evaluate(
        (el) => el.getAnimations()[0]?.effect &&
          (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0],
      );
      expect(String(from?.transform)).toMatch(/scale\(0\.95\)/);
      expect(Number(from?.opacity)).toBe(0);
      await page.waitForTimeout(260);
      const r = (await dialog.boundingBox())!;
      const centre = r.y + r.height / 2;
      expect(Math.abs(centre - vp.height / 2)).toBeLessThan(4);
      await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });

  test("Eliminar mi cuenta: diálogo centrado, Cancelar devuelve el foco", async ({
    page,
  }) => {
    await open(page, { width: 390, height: 844 });
    const trigger = page.getByRole("button", { name: "Eliminar mi cuenta" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "¿Eliminar tu cuenta?" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("textbox")).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: "Eliminar cuenta" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Borrar historial confirma con un aviso en una región aria-live", async ({
    page,
  }) => {
    await open(page);
    const trigger = page.getByRole("button", { name: "Borrar historial" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", {
      name: "¿Borrar todo el historial?",
    });
    await dialog.getByRole("button", { name: "Borrar historial" }).click();
    await expect(dialog).toBeHidden();
    const toast = page.getByRole("status").filter({ hasText: "Historial borrado." });
    await expect(toast).toBeVisible();
    expect(
      await toast.evaluate(
        (el) => el.closest("[aria-live]")?.getAttribute("aria-live"),
      ),
    ).toBe("polite");
    await expect(trigger).toBeFocused();
    await page.getByRole("button", { name: "Cerrar aviso" }).click();
    await expect(toast).toBeHidden();
  });

  test("con movimiento reducido el diálogo solo funde", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await page.getByRole("button", { name: "Borrar historial" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    const moving = (await animations(page)).filter((a) => a.moves);
    expect(moving).toEqual([]);
  });
});

test.describe("móvil", () => {
  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ])
    test(`la barra inferior no tapa el último elemento (${vp.width}×${vp.height})`, async ({
      page,
    }) => {
      await open(page, vp);
      const gap = await page.evaluate(() => {
        const main = document.querySelector(".workspace-main")!;
        main.scrollTop = main.scrollHeight;
        const sections = document.querySelectorAll(".page-settings > section");
        const last = sections[sections.length - 1].getBoundingClientRect();
        const bar = document.querySelector(".tabbar");
        const barTop =
          bar && getComputedStyle(bar).display !== "none"
            ? bar.getBoundingClientRect().top
            : window.innerHeight;
        return barTop - last.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(16);
    });
});

// Evidence for docs/diseno/ajustes (only with CAPTURAS_DIR).
const OUT = process.env.CAPTURAS_DIR;
test.describe("capturas de Ajustes", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  for (const scheme of ["light", "dark"] as const)
    for (const vp of [
      { name: "movil", width: 390, height: 844 },
      { name: "escritorio", width: 1440, height: 900 },
    ])
      test(`ajustes extra ${vp.name} ${scheme}`, async ({ page, context }) => {
        const tag = `${vp.name}-${scheme === "light" ? "claro" : "oscuro"}`;
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, vp);
        await page.evaluate(() => {
          const main = document.querySelector(".workspace-main")!;
          main.scrollTop = main.scrollHeight;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/ajustes-final-${tag}.png` });
        // Privacy actions that can't run offline, with the reason below.
        await context.setOffline(true);
        const privacy = page.locator("section.group").filter({
          has: page.getByRole("heading", { name: "Privacidad", exact: true }),
        });
        await privacy.getByText("Sin conexión").waitFor();
        await privacy.screenshot({ path: `${OUT}/ajustes-sin-conexion-${tag}.png` });
        await context.setOffline(false);
        // Keyboard focus on the easy-reading switch.
        const sw = page.getByRole("switch", { name: /Lectura fácil/ });
        await sw.scrollIntoViewIfNeeded();
        await page.keyboard.press("Tab");
        await sw.focus();
        await sw
          .locator("xpath=ancestor::section[1]")
          .screenshot({ path: `${OUT}/ajustes-interruptor-foco-${tag}.png` });
        await page.getByRole("button", { name: "Borrar historial" }).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/ajustes-dialogo-${tag}.png` });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: "Borrar historial" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Borrar historial" })
          .click();
        await page.getByRole("switch", { name: /Lectura fácil/ }).click();
        await page.evaluate(() => {
          document.querySelector(".workspace-main")!.scrollTop = 0;
        });
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `${OUT}/ajustes-lectura-facil-aviso-${tag}.png`,
        });
      });
});

// Short recording of the micro-interactions (only with GRABACION_DIR).
const REC = process.env.GRABACION_DIR;
test.describe("grabación de Ajustes", () => {
  test.skip(!REC, "Set GRABACION_DIR to record");
  test("microinteracciones de Ajustes", async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: REC!, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, { width: 1280, height: 800 });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Oscuro" }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Claro" }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Sistema" }).click();
    await page.waitForTimeout(700);
    const sw = page.getByRole("switch", { name: /Lectura fácil/ });
    await sw.click();
    await page.waitForTimeout(1000);
    await sw.click();
    await page.waitForTimeout(700);
    await page.keyboard.press("Tab");
    await sw.focus();
    await page.waitForTimeout(700);
    const account = page.getByRole("button", { name: "Eliminar mi cuenta" });
    await account.scrollIntoViewIfNeeded();
    await account.click();
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Borrar historial" }).click();
    await page.waitForTimeout(900);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Borrar historial" })
      .click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Cerrar aviso" }).click();
    await page.waitForTimeout(800);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(`${REC}/ajustes.webm`);
  });
});
