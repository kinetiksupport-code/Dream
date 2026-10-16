import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Chat design (design/chat): AI status after 2 s, cursor while streaming,
// «Copiado», «Ir al último mensaje», entry motion only for new messages,
// generated-test card and its skeleton, reduced motion. API simulated.
test.use({ serviceWorkers: "block" });

const cid = "33333333-3333-4333-8333-333333333333";
const tid = "44444444-4444-4444-8444-444444444444";
type QA = typeof window & {
  qaStream?: ReadableStreamDefaultController<Uint8Array>;
  qaStatusAt?: number;
};

/** Fixture API plus a chat stream the test drives event by event. */
async function setup(page: Page) {
  await mock(page);
  await page.addInitScript(() => {
    const qa = window as QA;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (
        typeof init?.body === "string" &&
        JSON.parse(init.body).action === "chat"
      )
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              qa.qaStream = controller;
              init.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("Detenido", "AbortError")),
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      return original(input, init);
    };
    // Record when the AI status first appears (for the 2 s rule).
    new MutationObserver(() => {
      if (!qa.qaStatusAt && document.querySelector(".ai-status"))
        qa.qaStatusAt = performance.now();
    }).observe(document, { subtree: true, childList: true });
  });
}
const emit = (page: Page, event: object) =>
  page.evaluate((event) => {
    const qa = window as QA;
    qa.qaStream?.enqueue(
      new TextEncoder().encode(JSON.stringify(event) + "\n"),
    );
  }, event);
const close = (page: Page) =>
  page.evaluate(() => (window as QA).qaStream?.close());
const streamReady = (page: Page) =>
  page.waitForFunction(() => !!(window as QA).qaStream);

async function sendFromHome(page: Page, text = "Explícame las derivadas") {
  await page.goto("/chat");
  await page.waitForLoadState("networkidle").catch(() => {});
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill(text);
  await expect(
    page.getByRole("button", { name: "Enviar mensaje" }),
  ).toBeEnabled();
  const sentAt = await page.evaluate(() => performance.now());
  await box.press("Enter");
  return sentAt;
}

test("AI status: nothing before 2 s, «Pensando…» at 2 s, «Buscando…» on activity", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  const sentAt = await sendFromHome(page);
  await streamReady(page);
  // Stop button visible from the first moment the answer is in progress.
  await expect(
    page.getByRole("button", { name: "Detener respuesta" }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator(".ai-status")).toHaveCount(0);
  const status = page.locator(".ai-status");
  await expect(status).toBeVisible({ timeout: 2000 });
  await expect(status).toHaveText("Pensando…");
  await expect(status).toHaveAttribute("aria-live", "polite");
  const shownAfter = await page.evaluate(
    (t) => ((window as QA).qaStatusAt ?? 0) - t,
    sentAt,
  );
  expect(shownAfter).toBeGreaterThanOrEqual(1950);
  expect(shownAfter).toBeLessThan(2600);
  await emit(page, { type: "activity", activity: "searching" });
  await expect(status).toHaveText("Buscando en internet…");
  await expect(page.locator(".ai-status .orb-pulsing")).toBeVisible();
  await emit(page, { type: "delta", text: "La derivada mide" });
  await expect(page.locator(".ai-status")).toHaveText("Escribiendo…");
  await expect(
    page.getByRole("button", { name: "Detener respuesta" }),
  ).toBeVisible();
});

test("a fast answer (under 2 s) never shows the AI status", async ({
  page,
}) => {
  await setup(page);
  await sendFromHome(page);
  await streamReady(page);
  await emit(page, { type: "delta", text: "Respuesta rápida." });
  await emit(page, { type: "complete" });
  await close(page);
  await expect(page.locator(".message-assistant")).toContainText(
    "Respuesta rápida.",
  );
  await page.waitForTimeout(2300);
  expect(await page.evaluate(() => (window as QA).qaStatusAt ?? null)).toBe(
    null,
  );
});

test("cursor blinks while the text arrives and disappears when it completes", async ({
  page,
}) => {
  await setup(page);
  await sendFromHome(page);
  await streamReady(page);
  await emit(page, { type: "delta", text: "Una derivada es " });
  const answer = page.locator(".message-assistant").last();
  await expect(answer).toHaveClass(/is-typing/);
  await expect(answer.locator(".message-body")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await expect(answer.locator(".message-body")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const caret = () =>
    answer.evaluate((el) => {
      const p = el.querySelector(".markdown > :last-child");
      if (!p) return null;
      const s = getComputedStyle(p, "::after");
      return { content: s.content, width: s.width, animation: s.animationName };
    });
  expect(await caret()).toEqual({
    content: '""',
    width: "2px",
    animation: "caret-blink",
  });
  // Focus stays in the composer while text streams in.
  await expect(
    page.getByRole("textbox", { name: "Mensaje para Dream" }),
  ).toBeFocused();
  // An unclosed formula is held back instead of flashing raw TeX.
  await emit(page, { type: "delta", text: "un límite: \\[f'(x)=\\lim" });
  await expect(answer).not.toContainText("\\lim");
  await emit(page, { type: "delta", text: "_{h\\to 0}\\]\n\nSigue así." });
  await expect(answer).toContainText("Sigue así.");
  await emit(page, { type: "complete" });
  await close(page);
  await expect(answer).not.toHaveClass(/is-typing/);
  await expect(answer.locator(".message-body")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect((await caret())?.content).toBe("none");
});

test("copy: shows «Copiado» with icon and returns after 1.5 s; actions on hover", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`/chat?c=${cid}`);
  const answer = page.locator(".message-assistant").first();
  const actions = answer.locator(".message-actions");
  await expect(actions).toHaveCSS("opacity", "0"); // rest (pointer device)
  await answer.hover();
  await expect(actions).toHaveCSS("opacity", "1"); // hover
  const copy = answer.getByRole("button", { name: "Copiar respuesta" });
  await copy.click();
  await expect(answer.getByRole("button", { name: "Copiado" })).toContainText(
    "Copiado",
  );
  await expect(answer.locator(".copy-action svg")).toBeVisible();
  await expect(answer.getByRole("status")).toHaveText("Copiado");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Vamos paso a paso",
  );
  await page.waitForTimeout(1600);
  await expect(copy).toContainText("Copiar");
  await expect(answer.getByRole("status")).toHaveText("");
  // Keyboard focus also reveals the actions.
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await copy.focus();
  await expect(actions).toHaveCSS("opacity", "1");
});

test("touch: message actions are always visible", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await setup(page);
  await page.goto(`/chat?c=${cid}`);
  await expect(
    page.locator(".message-assistant").first().locator(".message-actions"),
  ).toHaveCSS("opacity", "1");
  await context.close();
});

test("«Ir al último mensaje» appears when scrolling up and brings you back", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".message")).toHaveCount(4);
  const jump = page.locator(".jump-bottom");
  await expect(jump).toHaveAttribute("data-visible", "false");
  await expect(jump).toHaveAttribute("aria-hidden", "true");
  await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
  const button = page.getByRole("button", { name: "Ir al último mensaje" });
  await expect(button).toBeVisible();
  await expect(jump).toHaveCSS("opacity", "1");
  await button.click();
  await expect(jump).toHaveAttribute("data-visible", "false");
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(80);
});

test("auto-scroll follows the answer only while you are at the bottom", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".message")).toHaveCount(4);
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill("Otra pregunta");
  await box.press("Enter");
  await streamReady(page);
  const gap = () =>
    page
      .locator(".chat-scroll")
      .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  await emit(page, { type: "delta", text: "Línea uno.\n\n".repeat(10) });
  await expect.poll(gap).toBeLessThan(80); // pinned: follows
  await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
  await expect(page.locator(".jump-bottom")).toHaveAttribute(
    "data-visible",
    "true",
  );
  await emit(page, { type: "delta", text: "Línea dos.\n\n".repeat(10) });
  await page.waitForTimeout(300);
  expect(
    await page.locator(".chat-scroll").evaluate((el) => el.scrollTop),
  ).toBe(0); // reading above: no jump
});

test("history does not animate when opening; only the new message enters", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".message")).toHaveCount(4);
  await expect(page.locator(".message-enter")).toHaveCount(0);
  const running = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          (
            (a.effect as KeyframeEffect | null)?.target as Element | null
          )?.closest?.(".message"),
        )
        .map((a) => (a as CSSTransition).transitionProperty ?? "anim"),
    );
  expect(await running()).toEqual([]);
  // Header shows the conversation title, not «Conversación».
  await expect(page.locator(".topbar h1")).toHaveText(
    "Ecuaciones de segundo grado",
  );
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill("¿Y si el término es negativo?");
  await box.press("Enter");
  const added = page.locator(".message-user").last();
  await expect(added).toHaveClass(/message-enter/);
  await expect(page.locator(".message-enter")).toHaveCount(2); // user + answer
  const timing = await added.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      property: s.transitionProperty,
      duration: s.transitionDuration,
      easing: s.transitionTimingFunction,
    };
  });
  expect(timing).toEqual({
    property: "opacity, transform",
    duration: "0.2s, 0.2s",
    easing: "cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1)",
  });
});

test("header falls back to «Nueva conversación» when the title is unknown", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/chat?c=99999999-9999-4999-8999-999999999999");
  await expect(page.locator(".topbar h1")).toHaveText("Nueva conversación");
});

test("generated test: skeleton while it is made, then an elevated card", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/functions/v1/dream-api", async (route) => {
    if (route.request().postDataJSON().action !== "test_generate")
      return route.fallback();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        test: { id: tid },
        assistant_message: `Tu test está listo. <!--DREAM_WIDGET:{"type":"quiz","testId":"${tid}","title":"Ecuaciones de segundo grado","questionCount":5}-->`,
      }),
    });
  });
  await sendFromHome(page, "Hazme un test de ecuaciones");
  const skeleton = page.getByTestId("quiz-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(page.locator(".ai-status")).toHaveText("Preparando tu test…", {
    timeout: 3000,
  });
  release();
  const card = page.locator(".quiz-widget");
  await expect(card).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(card).toContainText("Práctica");
  await expect(card).toContainText("5 preguntas");
  await expect(card).toContainText("Empezar");
  await expect(card.locator(".quiz-icon svg")).toBeVisible();
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)"); // --elevated (light)
  // Focus: visible ring.
  await page.keyboard.press("Shift+Tab");
  await card.focus();
  await expect(card).toHaveCSS("outline-style", "solid");
  // Hover: lifts 2 px and the arrow moves 2 px.
  await card.hover();
  await page.waitForTimeout(300);
  expect(
    await card.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).m42,
    ),
  ).toBe(-2);
  expect(
    await card
      .locator(".quiz-arrow")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41),
  ).toBe(2);
  // Pressed: scales down slightly.
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect(
    await card.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).a,
    ),
  ).toBeCloseTo(0.98, 2);
  await page.mouse.up(); // releasing on the card opens the test
  await expect(page).toHaveURL(new RegExp(`/tests/${tid}`));
});

test("errors show the cause and «Reintentar» resends the same message", async ({
  page,
}) => {
  await setup(page);
  await sendFromHome(page, "Explícame la fotosíntesis");
  await streamReady(page);
  await emit(page, {
    type: "error",
    message: "La IA está ocupada ahora mismo.",
  });
  const banner = page.locator(".chat-error");
  await expect(banner).toContainText("No se ha podido completar");
  await expect(banner).toContainText("La IA está ocupada ahora mismo.");
  await expect(banner.locator("svg").first()).toBeVisible();
  await page.evaluate(() => ((window as QA).qaStream = undefined));
  await banner.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.locator(".message-user").last()).toContainText(
    "Explícame la fotosíntesis",
  );
  await streamReady(page);
  await expect(banner).toHaveCount(0);
  await emit(page, { type: "delta", text: "Ahora sí." });
  await expect(page.locator(".message-assistant").last()).toContainText(
    "Ahora sí.",
  );
});

test("reduced motion: no movement, fixed cursor, fades only", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".message")).toHaveCount(4);
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
            (k) => k.transform && k.transform !== "none",
          ),
        )
        .map(
          (a) =>
            `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty}`,
        ),
    );
  // Quiz card hover does not lift.
  const card = page.locator(".quiz-widget");
  await card.hover();
  await page.waitForTimeout(250);
  expect(await card.evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill("Una pregunta");
  await box.press("Enter");
  await streamReady(page);
  expect(await moving()).toEqual([]);
  await emit(page, { type: "delta", text: "Texto que llega" });
  const answer = page.locator(".message-assistant").last();
  await expect(answer).toHaveClass(/is-typing/);
  expect(
    await answer.evaluate(
      (el) =>
        getComputedStyle(
          el.querySelector(".markdown > :last-child")!,
          "::after",
        ).animationName,
    ),
  ).toBe("none");
  expect(await moving()).toEqual([]);
  await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
  await expect(page.locator(".jump-bottom")).toHaveAttribute(
    "data-visible",
    "true",
  );
  expect(await moving()).toEqual([]);
});

test("fluency: streaming 2.5 s with CPU ×4 has no long frames", async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await sendFromHome(page, "Explícame las ecuaciones de segundo grado");
  await streamReady(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const w = window as typeof window & { qaLong: number[] };
    w.qaLong = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.duration > 50) w.qaLong.push(Math.round(e.duration));
    }).observe({ type: "long-animation-frame", buffered: false });
  });
  // ~2.5 s of text: a chunk every 25 ms, as a fast model streams.
  const words =
    "Para resolver **x² − 5x + 6 = 0** buscamos dos números que sumen 5 y multipliquen 6. Son el 2 y el 3, así que factorizamos como \\((x-2)(x-3)=0\\). ".split(
      " ",
    );
  await page.evaluate(async (words) => {
    const qa = window as QA;
    const enc = new TextEncoder();
    const start = performance.now();
    let i = 0;
    while (performance.now() - start < 2500) {
      const chunk =
        words.slice(i % words.length, (i % words.length) + 2).join(" ") + " ";
      qa.qaStream?.enqueue(
        enc.encode(JSON.stringify({ type: "delta", text: chunk }) + "\n"),
      );
      if (i % 40 === 39)
        qa.qaStream?.enqueue(
          enc.encode(JSON.stringify({ type: "delta", text: "\n\n" }) + "\n"),
        );
      i += 2;
      await new Promise((r) => setTimeout(r, 25));
    }
  }, words);
  await page.waitForTimeout(500);
  const long = await page.evaluate(
    () => (window as typeof window & { qaLong: number[] }).qaLong,
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(
    `Fotogramas largos (>50 ms) con CPU x4 durante 2,5 s de streaming: ${long.length} ${JSON.stringify(long)}`,
  );
  test.info().annotations.push({
    type: "fluidez",
    description: `${long.length} fotogramas largos: ${JSON.stringify(long)}`,
  });
  // Measured on a shared machine: 0–3 frames of 50–75 ms over 5 runs. Before
  // the per-block Markdown it was 4–8 frames of 60–82 ms.
  expect(long.length).toBeLessThanOrEqual(3);
  expect(Math.max(0, ...long)).toBeLessThan(120);
});
