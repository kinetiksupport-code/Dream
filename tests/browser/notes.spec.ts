import { test, expect, type Page } from "@playwright/test";
import { mock, withNotes } from "./design-fixture";
// Apuntes microinteractions (Claude Design: Apuntes.dc.html): card hover,
// press and focus; upload idle / dragging / uploading / error; loading
// skeleton and empty state; reduced motion. With CAPTURAS_DIR set, it also
// saves the states as screenshots for docs/diseno/apuntes/.
test.use({ serviceWorkers: "block" });
const OUT = process.env.CAPTURAS_DIR;

async function open(page: Page, kind: "full" | "empty" = "full") {
  await mock(page);
  await withNotes(page, kind);
  await page.goto("/notes");
  if (kind === "full") await page.getByText("Fotos de la pizarra").waitFor();
  else await page.getByText("Aún no tienes apuntes").waitFor();
}
const shot = async (page: Page, name: string) => {
  if (OUT) await page.screenshot({ path: `${OUT}/apuntes-${name}.png` });
};
const card = (page: Page) => page.locator("article").first();
const transformOf = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).transform);

/** Drag files over the page: dispatches real DragEvents with a DataTransfer. */
async function dragFiles(
  page: Page,
  type: "dragenter" | "dragleave" | "drop",
  names: string[],
) {
  await page.evaluate(
    ([type, names]) => {
      const dt = new DataTransfer();
      for (const n of names as string[])
        dt.items.add(
          new File(["%PDF-1.4 apuntes"], n, { type: "application/pdf" }),
        );
      const target = document.querySelector("main .page") ?? document.body;
      target.dispatchEvent(
        new DragEvent(type as string, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    },
    [type, names] as const,
  );
}

test("cards follow the canvas: three columns, title without extension, status with icon and text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const cards = page.locator("article");
  await expect(cards).toHaveCount(3);
  const tops = await cards.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1); // one row
  await expect(
    page.getByRole("link", { name: "Tema 4 · Ecuaciones · Ver examen" }),
  ).toBeVisible();
  await expect(cards.nth(0)).toContainText("Listo");
  await expect(cards.nth(1)).toContainText("Procesando");
  await expect(cards.nth(2)).toContainText("No se pudo leer el archivo");
  for (const i of [0, 1, 2])
    await expect(cards.nth(i).locator("p svg").first()).toBeAttached();
  await expect(
    cards.nth(0).getByRole("link", { name: "Resumir" }),
  ).toBeVisible();
  await expect(
    cards.nth(0).getByRole("link", { name: "Crear test" }),
  ).toBeVisible();
  await expect(
    cards.nth(2).getByRole("button", { name: "Volver a subir" }),
  ).toBeVisible();
});

test("a single note keeps its card width instead of filling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mock(page); // default fixture: one material
  await page.goto("/notes");
  await page.locator("article").first().waitFor();
  const [cardW, gridW] = await page
    .locator("article")
    .first()
    .evaluate((el) => [
      el.getBoundingClientRect().width,
      el.parentElement!.getBoundingClientRect().width,
    ]);
  expect(cardW).toBeLessThan(gridW / 2);
});

test("card: hover lifts it and moves the arrow, press scales to .97, focus shows a ring", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  await shot(page, "reposo");
  expect(await transformOf(page, "article")).toBe("none");
  await card(page).getByRole("heading").hover();
  await page.waitForTimeout(300);
  expect(await transformOf(page, "article")).toBe("matrix(1, 0, 0, 1, 0, -2)");
  const arrow = await card(page)
    .locator("[aria-hidden=true]")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  expect(arrow).toBe("matrix(1, 0, 0, 1, 3, 0)");
  const shadow = await card(page).evaluate(
    (el) => getComputedStyle(el, "::before").opacity,
  );
  expect(shadow).toBe("1");
  await shot(page, "hover");
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect(await transformOf(page, "article")).toBe(
    "matrix(0.97, 0, 0, 0.97, 0, 0)",
  );
  await shot(page, "pulsado");
  await page.mouse.up();
  // Leave without navigating, then focus with the keyboard.
  await page.goto("/notes");
  await page.getByText("Fotos de la pizarra").waitFor();
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "Subir apuntes" }).focus();
  await page.keyboard.press("Tab"); // the first card link
  await page.waitForTimeout(250);
  const link = card(page).getByRole("link").first();
  await expect(link).toBeFocused();
  const ring = await link.evaluate((el) => {
    const s = getComputedStyle(el, "::after");
    return `${s.outlineStyle} ${s.outlineWidth} ${s.opacity}`;
  });
  expect(ring).toBe("solid 2px 1");
  await shot(page, "foco");
});

test("card hover does not apply on touch (no fine pointer)", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await open(page);
  expect(
    await page.evaluate(
      () => matchMedia("(hover: hover) and (pointer: fine)").matches,
    ),
  ).toBe(false);
  await card(page).getByRole("heading").hover();
  await page.waitForTimeout(300);
  expect(await transformOf(page, "article")).toBe("none");
  await context.close();
});

test("upload: dragging, then uploading with a live status, then the chat opens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const zone = page.getByTestId("notes-upload");
  await expect(zone).toHaveAttribute("data-state", "idle");
  await expect(zone).toContainText("Arrastra aquí tus apuntes");
  await expect(zone.locator("[aria-live=polite]")).toBeAttached();
  await dragFiles(page, "dragenter", ["Tema 5.pdf"]);
  await expect(zone).toHaveAttribute("data-state", "dragging");
  await expect(zone).toContainText("Suelta para subir");
  await expect(zone.locator("svg").first()).toBeVisible();
  await shot(page, "arrastrando");
  // Hold the hand-off so the uploading state can be seen and measured.
  await page.route("**/chat?new=*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await page.route("**/chat?*_rsc=*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await dragFiles(page, "drop", ["Tema 5.pdf", "Tema 6.pdf"]);
  await expect(zone).toHaveAttribute("data-state", "uploading");
  await expect(zone.getByRole("status")).toContainText("Preparando 2 archivos");
  await shot(page, "subiendo");
  await page.waitForURL(/\/chat\?new=/, { timeout: 10000 });
});

test("upload error: says the cause, offers Reintentar and it opens the picker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  await page.getByTestId("notes-file-input").setInputFiles({
    name: "apuntes.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("zip"),
  });
  const zone = page.getByTestId("notes-upload");
  await expect(zone).toHaveAttribute("data-state", "error");
  const alert = zone.getByRole("alert");
  await expect(alert).toContainText("No se pudo subir «apuntes.zip»");
  await expect(alert).toContainText("Este formato no es compatible con Dream.");
  await expect(alert).toContainText("Usa PDF, Word, PowerPoint, Excel");
  await shot(page, "error");
  const chooser = page.waitForEvent("filechooser");
  await alert.getByRole("button", { name: "Reintentar" }).click();
  await chooser;
  // Too many files is an error too, not a silent cut to eight.
  await page.getByTestId("notes-file-input").setInputFiles(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
      name: `Tema ${n}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    })),
  );
  await expect(alert).toContainText("Puedes subir 8 archivos a la vez.");
});

test("loading skeleton has the grid's shape and announces itself", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await mock(page);
  await page.route("**/functions/v1/dream-api", async (route) => {
    if (route.request().postDataJSON()?.action !== "exams")
      return route.fallback();
    await new Promise((r) => setTimeout(r, 4000));
    await route.fallback();
  });
  await page.goto("/notes");
  const busy = page.locator("[aria-busy=true]");
  await expect(busy).toBeVisible();
  await expect(busy.getByRole("status")).toHaveText("Cargando apuntes…");
  const boxes = await busy
    .locator("> div")
    .evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)),
    );
  expect(boxes).toHaveLength(3);
  for (const h of boxes) expect(h).toBeGreaterThanOrEqual(200);
  await shot(page, "cargando");
});

test("empty state: decorative inline illustration and a clear Subir apuntes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, "empty");
  const svg = page.locator("main svg[width='160']");
  await expect(svg).toHaveAttribute("aria-hidden", "true");
  // One clear action: the header button gives way to the empty state's.
  const button = page.getByRole("button", { name: "Subir apuntes" });
  await expect(button).toHaveCount(1);
  await expect(page.getByTestId("notes-upload")).toBeHidden(); // empty state carries the hint
  await shot(page, "vacio");
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await chooser;
});

test("reduced motion: no lift, no press scale, no moving entrance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const moving = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) =>
          ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
            (k) => k.transform && k.transform !== "none",
          ),
        ).length,
  );
  expect(moving).toBe(0);
  await card(page).getByRole("heading").hover();
  await page.waitForTimeout(250);
  expect(await transformOf(page, "article")).toBe("none");
  await page.mouse.down();
  expect(await transformOf(page, "article")).toBe("none");
  await page.mouse.up();
});

for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
])
  test(`no sideways scroll on Apuntes at ${vp.width}×${vp.height}, all states`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await open(page);
    const over = () =>
      page.evaluate(() =>
        [document.scrollingElement, document.querySelector(".workspace-main")]
          .filter(Boolean)
          .some((r) => r!.scrollWidth > r!.clientWidth + 1),
      );
    expect(await over()).toBe(false);
    await page.getByTestId("notes-file-input").setInputFiles({
      name: "un-nombre-de-archivo-muy-largo-sin-espacios-para-probar.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("zip"),
    });
    await expect(page.getByTestId("notes-upload")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(await over()).toBe(false);
    if (OUT && vp.width === 390) await shot(page, "error-movil");
  });

test("smoothness with CPU throttled ×4: hover across cards and drag state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    (window as unknown as { __long: number }).__long = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.duration > 50) (window as unknown as { __long: number }).__long++;
    }).observe({ type: "long-animation-frame", buffered: false });
  });
  for (let round = 0; round < 3; round++)
    for (const i of [0, 1, 2]) {
      await page.locator("article").nth(i).getByRole("heading").hover();
      await page.waitForTimeout(260);
    }
  await dragFiles(page, "dragenter", ["Tema 5.pdf"]);
  await page.waitForTimeout(300);
  const long = await page.evaluate(
    () => (window as unknown as { __long: number }).__long,
  );
  console.log(
    `long-animation-frame (>50 ms) during 9 hovers + drag at 4× CPU: ${long}`,
  );
  expect(long).toBeLessThanOrEqual(2);
});

// Recording for docs/diseno/grabaciones/apuntes.webm (only with GRABACION_DIR).
test("recording: Apuntes microinteractions", async ({ browser }) => {
  const dir = process.env.GRABACION_DIR;
  test.skip(!dir, "Set GRABACION_DIR to record");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: dir!, size: { width: 1280, height: 800 } },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(640, 700);
  await page.waitForTimeout(600);
  for (const i of [0, 1, 2]) {
    await page.locator("article").nth(i).getByRole("heading").hover();
    await page.waitForTimeout(700);
  }
  await page.mouse.move(640, 700);
  await page.waitForTimeout(400);
  await page.locator("article").first().getByRole("heading").hover();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.move(640, 700); // release outside: no navigation
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Subir apuntes" }).focus();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(700);
  }
  await dragFiles(page, "dragenter", ["Tema 5.pdf"]);
  await page.waitForTimeout(1200);
  await dragFiles(page, "dragleave", ["Tema 5.pdf"]);
  await page.getByTestId("notes-file-input").setInputFiles({
    name: "apuntes.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("zip"),
  });
  await page.waitForTimeout(1500);
  await page.route("**/chat?*", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fallback();
  });
  await dragFiles(page, "drop", ["Tema 5.pdf", "Tema 6.pdf"]);
  await page.waitForTimeout(1800);
  await context.close();
});

test("estilo: lime «Listo» pill, pills, 3D upload button and the drop zone leans in", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  // «Listo»: colour, icon and text together, dark ink on lime.
  const ready = card(page).getByText("Listo");
  await expect(ready).toHaveCSS("background-color", "rgb(200, 245, 96)");
  await expect(ready).toHaveCSS("color", "rgb(8, 11, 20)");
  await expect(ready).toHaveCSS("border-radius", "999px");
  await expect(ready.locator("svg")).toBeVisible();
  // Card actions are pills with a visible focus ring and press at .97.
  const summarize = card(page).getByRole("link", { name: "Resumir" });
  await expect(summarize).toHaveCSS("border-radius", "999px");
  await summarize.focus();
  await expect(summarize).toHaveCSS("outline-style", "solid");
  // «Subir apuntes» has its 3D base (a second shadow under the gloss).
  const upload = page.getByRole("button", { name: "Subir apuntes" });
  expect(await upload.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(
    /inset.*\) 0px 3px 0px 0px$/,
  );
  await upload.hover();
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect(
    await upload.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).a,
    ),
  ).toBeCloseTo(0.97, 2);
  await page.mouse.move(5, 5);
  await page.mouse.up();
  // Dragging files: the zone scales to 1.01 (transform only).
  await dragFiles(page, "dragenter", ["Tema 5.pdf"]);
  const zone = page.getByTestId("notes-upload");
  await expect(zone).toHaveAttribute("data-state", "dragging");
  await expect
    .poll(() =>
      zone.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBeCloseTo(1.01, 3);
  await dragFiles(page, "dragleave", ["Tema 5.pdf"]);
});

test("estilo: reduced motion keeps the drop zone still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  await dragFiles(page, "dragenter", ["Tema 5.pdf"]);
  const zone = page.getByTestId("notes-upload");
  await expect(zone).toHaveAttribute("data-state", "dragging");
  expect(await zone.evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
  await dragFiles(page, "dragleave", ["Tema 5.pdf"]);
});
