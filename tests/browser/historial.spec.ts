import { test, expect, type Page } from "@playwright/test";
// Historial (design/historial): automatic titles, groups, «···» menu, delete
// with undo, search and reduced motion. API simulated; clock fixed on
// Thursday 15/10/2026 12:00 so the groups do not depend on the real date.
test.use({ serviceWorkers: "block" });

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const at = (days: number, hour = 10) =>
  new Date(2026, 9, 15 - days, hour).toISOString();
const id = (n: number) => `99999999-9999-4999-8999-99999999999${n}`;
const CONVERSATIONS = [
  { id: id(0), title: "Ecuaciones de segundo grado", updated_at: at(0) },
  { id: id(1), title: "Leyes de Newton", updated_at: at(0, 9) },
  { id: id(2), title: "Comentario de texto: estructura", updated_at: at(1) },
  { id: id(3), title: "Verbos irregulares en pasado", updated_at: at(3) },
  { id: id(4), title: "Nueva conversación", updated_at: at(12) },
  { id: id(5), title: "Fotosíntesis: fase luminosa", updated_at: at(40) },
];
const NEW_ID = "77777777-7777-4777-8777-777777777777";

type Call = { action: string; [k: string]: unknown };
async function setup(
  page: Page,
  opts: {
    items?: typeof CONVERSATIONS;
    failDelete?: number;
    slowList?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  let failures = opts.failDelete ?? 0;
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => {
    localStorage.setItem("dream-storage-notice-v1", "1");
    localStorage.setItem(
      "sb-cxaujyagtpsxvkwkdxbc-auth-token",
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "66666666-6666-4666-8666-666666666666",
          email: "alex@example.test",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: { full_name: "Alex" },
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
  });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON() as Call;
    calls.push(b);
    if (b.action === "chat")
      return route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: '{"type":"delta","text":"Vamos paso a paso."}\n{"type":"complete"}\n',
      });
    if (b.action === "conversation_delete" && failures > 0) {
      failures--;
      return route.fulfill({
        status: 503,
        json: { error: "No se pudo eliminar." },
      });
    }
    if (b.action === "conversations" && opts.slowList)
      await new Promise((r) => setTimeout(r, 1500));
    const data = {
      profile: {
        profile: { email: "alex@example.test", display_name: "Alex" },
        service_ready: true,
      },
      conversations: { items: opts.items ?? CONVERSATIONS },
      messages: { items: [], next_offset: null },
      conversation_create: {
        conversation: {
          id: NEW_ID,
          title: "Nueva conversación",
          updated_at: NOW.toISOString(),
        },
      },
    }[b.action] ?? { ok: true };
    await route.fulfill({ status: 200, json: data });
  });
  return calls;
}
const deletes = (calls: Call[]) =>
  calls.filter((c) => c.action === "conversation_delete");
const row = (page: Page, title: string | RegExp) =>
  page.locator(".history-row").filter({
    has: page.getByRole("link", { name: title }),
  });
async function openHistory(page: Page) {
  await page.goto("/chat?view=recent");
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.locator(".history-row").first()).toBeVisible();
}

test("first message names the conversation from the question (no AI)", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill("hola,   ¿qué es una derivada y para qué sirve en física?");
  await box.press("Enter");
  await expect
    .poll(() => calls.find((c) => c.action === "conversation_rename"))
    .toMatchObject({
      action: "conversation_rename",
      conversation_id: NEW_ID,
      title: "¿Qué es una derivada y para qué sirve en física?",
    });
  // Only once, and never through the AI.
  await expect(page.getByText("Vamos paso a paso.")).toBeVisible();
  expect(calls.filter((c) => c.action === "conversation_rename")).toHaveLength(
    1,
  );
  expect(calls.filter((c) => c.action === "chat")).toHaveLength(1);
});

test("junk first message falls back to «Conversación del 15 de octubre»", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill("ggfg");
  await box.press("Enter");
  await expect
    .poll(() => calls.find((c) => c.action === "conversation_rename")?.title)
    .toBe("Conversación del 15 de octubre");
});

test("groups, legacy titles and row states (rest, hover, pressed, focus)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const calls = await setup(page);
  await openHistory(page);
  await expect(page.locator(".history-group h2")).toHaveText([
    "Hoy",
    "Ayer",
    "Esta semana",
    "Este mes",
    "Más antiguas",
  ]);
  // Old «Nueva conversación» shows the date; nothing is renamed.
  await expect(
    page.getByRole("link", { name: /^Conversación del 3 de octubre/ }),
  ).toBeVisible();
  await expect(page.getByText("Nueva conversación")).toHaveCount(0);
  expect(calls.some((c) => c.action === "conversation_rename")).toBe(false);

  const r = row(page, /^Leyes de Newton/);
  const more = r.getByRole("button", { name: "Opciones de Leyes de Newton" });
  const chevron = r.locator(".history-chevron");
  // Rest: chevron, no «···».
  await expect(more).toHaveCSS("opacity", "0");
  await expect(chevron).toHaveCSS("opacity", "1");
  // Hover: #F5F7FA background and «···» instead of the chevron.
  await r.hover();
  await expect(r.locator(".row-link")).toHaveCSS(
    "background-color",
    "rgb(245, 247, 250)",
  );
  await expect(more).toHaveCSS("opacity", "1");
  await expect(chevron).toHaveCSS("opacity", "0");
  // Pressed: scale(.97).
  await r.locator(".row-link").hover();
  await page.mouse.down();
  await expect
    .poll(() =>
      r.locator(".row-link").evaluate((el) => getComputedStyle(el).transform),
    )
    .toMatch(/matrix\(0\.97/);
  // Release away from the row so it is not a click.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  // Focus (keyboard): «···» appears with a visible ring.
  await page.getByRole("link", { name: /^Ecuaciones/ }).focus();
  await page.keyboard.press("Tab");
  const first = page.getByRole("button", {
    name: "Opciones de Ecuaciones de segundo grado",
  });
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("opacity", "1");
  await expect(first).not.toHaveCSS("outline-style", "none");
});

test("«···» menu with the keyboard: opens from its button, arrows, Escape returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await setup(page);
  await openHistory(page);
  await page.getByRole("link", { name: /^Leyes de Newton/ }).focus();
  await page.keyboard.press("Tab");
  const trigger = page.getByRole("button", {
    name: "Opciones de Leyes de Newton",
  });
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Opciones de Leyes de Newton" });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("menuitem", { name: "Renombrar" })).toBeFocused();
  // Scales from the top right corner, where the button is.
  const origin = await menu.evaluate((el) => {
    const [x, y] = getComputedStyle(el).transformOrigin.split(" ");
    return { x: parseFloat(x), y: parseFloat(y), w: el.clientWidth };
  });
  expect(origin.y).toBe(0);
  expect(origin.x).toBeGreaterThan(origin.w - 4);
  expect(
    await menu.evaluate((el) =>
      getComputedStyle(el).transitionDuration.split(", ").map(parseFloat),
    ),
  ).toEqual([0.16, 0.16]);
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Borrar" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Renombrar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Renombrar opens the dialog and gives focus back to «···» on close.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Cambiar nombre");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("borrar + deshacer: the row comes back in place and conversation_delete is never called", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const calls = await setup(page);
  await openHistory(page);
  const titles = () =>
    page.locator(".history-row .row-text strong").allTextContents();
  const before = await titles();
  const r = row(page, /^Leyes de Newton/);
  await r.hover();
  await r.getByRole("button", { name: /^Opciones/ }).click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await expect(r).toHaveCount(0);
  const toast = page
    .getByRole("status")
    .filter({ hasText: "Conversación borrada" });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute("aria-live", "polite");
  // Keyboard reaches «Deshacer».
  await toast.getByRole("button", { name: "Deshacer" }).focus();
  await page.keyboard.press("Enter");
  await expect(toast).toHaveCount(0);
  await expect.poll(titles).toEqual(before);
  await page.clock.runFor(8000);
  expect(deletes(calls)).toHaveLength(0);
});

test("borrar without undo calls conversation_delete only when the 5 s run out (paused on hover and hidden tab)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const calls = await setup(page);
  await openHistory(page);
  const r = row(page, /^Comentario de texto/);
  await r.hover();
  await r.getByRole("button", { name: /^Opciones/ }).click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  const toast = page
    .getByRole("status")
    .filter({ hasText: "Conversación borrada" });
  await expect(toast).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(2000);
  expect(deletes(calls)).toHaveLength(0);
  // Pointer over the toast: the countdown stops.
  await toast.hover();
  await page.clock.runFor(10_000);
  expect(deletes(calls)).toHaveLength(0);
  await page.mouse.move(0, 0);
  // Hidden tab: stops too.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(10_000);
  expect(deletes(calls)).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(2500);
  expect(deletes(calls)).toHaveLength(0);
  await page.clock.runFor(1000);
  await expect.poll(() => deletes(calls)).toHaveLength(1);
  expect(deletes(calls)[0].conversation_id).toBe(id(2));
  await expect(toast).toHaveCount(0);
});

test("a failed delete brings the row back with «Reintentar»", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const calls = await setup(page, { failDelete: 1 });
  await openHistory(page);
  const r = row(page, /^Verbos irregulares/);
  await r.hover();
  await r.getByRole("button", { name: /^Opciones/ }).click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await expect(r).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.clock.runFor(5500);
  const alert = page.getByRole("alert").filter({
    hasText: "No se pudo borrar la conversación.",
  });
  await expect(alert).toBeVisible();
  await expect(r).toHaveCount(1);
  await alert.getByRole("button", { name: "Reintentar" }).click();
  await expect.poll(() => deletes(calls)).toHaveLength(2);
  await expect(r).toHaveCount(0);
  await expect(alert).toHaveCount(0);
});

test("search filters with a 120 ms fade, announces the count and has an empty state", async ({
  page,
}) => {
  await setup(page);
  await openHistory(page);
  const search = page.getByRole("searchbox", {
    name: "Buscar en el historial",
  });
  await search.fill("newton");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.locator("#history-count")).toHaveText("1 conversación");
  await expect(page.locator("#history-count")).toHaveAttribute(
    "role",
    "status",
  );
  // Fade only: opacity in 120 ms, nothing on the layout.
  const transition = await page
    .locator(".history-row")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.transitionProperty, s.transitionDuration];
    });
  expect(transition[0]).toBe("opacity, transform");
  expect(transition[1].startsWith("0.12s")).toBe(true);
  // Legacy rows are found by the title the list shows.
  await search.fill("octubre");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await search.fill("trigonometría");
  await expect(
    page.getByRole("heading", {
      name: "No hay conversaciones con «trigonometría»",
    }),
  ).toBeVisible();
  await expect(page.locator("#history-count")).toHaveText("0 conversaciones");
  await page.getByRole("button", { name: "Borrar búsqueda" }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".history-row")).toHaveCount(CONVERSATIONS.length);
});

test("loading skeleton and empty state with illustration", async ({ page }) => {
  await setup(page, { items: [], slowList: true });
  await page.goto("/chat?view=recent");
  await expect(page.getByRole("status", { name: "Cargando" })).toBeVisible();
  await expect(page.locator(".history-skeleton-row")).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "Aún no hay conversaciones" }),
  ).toBeVisible();
  await expect(page.locator(".history-illustration")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page.getByRole("link", { name: "Empezar una conversación" }),
  ).toHaveAttribute("href", "/chat");
});

test("touch: «···» always visible and no chevron", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await setup(page);
  await openHistory(page);
  const r = row(page, /^Leyes de Newton/);
  await expect(r.getByRole("button", { name: /^Opciones/ })).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(r.locator(".history-chevron")).toBeHidden();
  const box = await r.getByRole("button", { name: /^Opciones/ }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await context.close();
});

test("reduced motion: menu and delete fade without moving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await openHistory(page);
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
            (k) => k.transform && k.transform !== "none",
          ),
        )
        .map((a) => (a as CSSTransition).transitionProperty ?? "animation"),
    );
  const r = row(page, /^Leyes de Newton/);
  await r.hover();
  await r.getByRole("button", { name: /^Opciones/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await moving()).toEqual([]);
  await expect(menu).toHaveCSS("transform", "none");
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await expect(r).toHaveAttribute("data-leaving", "true");
  await expect(r).toHaveCSS("transform", "none");
  expect(await moving()).toEqual([]);
  await expect(r).toHaveCount(0);
});
