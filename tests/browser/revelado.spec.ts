import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Soft reveal of the answers (feat/revelado-suave): an answer that arrives
// whole appears word by word in ~2 s, a click shows it all, reduced motion is
// instant, the actions wait for the end and nothing moves when it ends.
test.use({ serviceWorkers: "block" });

type QA = typeof window & {
  qaStream?: ReadableStreamDefaultController<Uint8Array>;
};
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
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      return original(input, init);
    };
  });
}
/** Several paragraphs, a list and two formulas: ~170 words. */
const ANSWER = [
  "Vamos por partes. Una ecuación de segundo grado tiene la forma \\(ax^2+bx+c=0\\) y puede tener dos, una o ninguna solución real.",
  "Para resolver **x² − 5x + 6 = 0** puedes seguir estos pasos:",
  "1. Busca dos números que sumen 5.\n2. Comprueba que multiplicados dan 6.\n3. Factoriza la expresión con ellos.",
  "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$",
  ...Array.from(
    { length: 4 },
    (_, i) =>
      `Paso ${i + 1}: piensa en qué significa cada término, escribe lo que sabes y compara tu resultado con la ecuación original antes de seguir. Si algo no encaja, vuelve atrás sin miedo y revisa los signos con calma.`,
  ),
  "¿Qué dos números se te ocurren? Prueba y dime qué te sale.",
].join("\n\n");

async function ask(page: Page, text = "¿Cómo resuelvo x² − 5x + 6 = 0?") {
  await page.goto("/chat");
  await page.waitForLoadState("networkidle").catch(() => {});
  const box = page.getByRole("textbox", { name: "Mensaje para Dream" });
  await box.fill(text);
  await expect(
    page.getByRole("button", { name: "Enviar mensaje" }),
  ).toBeEnabled();
  await box.press("Enter");
  await page.waitForFunction(() => !!(window as QA).qaStream);
}
/** The whole answer in one go, then complete (Groq-like). Returns the time. */
const deliver = (page: Page, text = ANSWER) =>
  page.evaluate((text) => {
    const qa = window as QA;
    const enc = new TextEncoder();
    qa.qaStream?.enqueue(
      enc.encode(JSON.stringify({ type: "delta", text }) + "\n"),
    );
    qa.qaStream?.enqueue(
      enc.encode(JSON.stringify({ type: "complete" }) + "\n"),
    );
    qa.qaStream?.close();
    return performance.now();
  }, text);
const progress = (page: Page) =>
  page
    .locator(".message-assistant")
    .last()
    .evaluate((el) => {
      const all = el.querySelectorAll(".markdown [data-w]").length;
      const shown = el.querySelectorAll(".markdown [data-w].is-shown").length;
      return {
        all,
        shown,
        revealing: el.classList.contains("is-revealing"),
        actions: el.querySelectorAll(".message-actions").length,
        busy: el.querySelector(".message-body")?.getAttribute("aria-busy"),
      };
    });
/** Time (page clock) when the reveal ends, polled every frame in the page. */
const revealEnd = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const check = () => {
          const a = [...document.querySelectorAll(".message-assistant")].at(-1);
          if (a && !a.classList.contains("is-revealing"))
            resolve(performance.now());
          else requestAnimationFrame(check);
        };
        check();
      }),
  );

test("an answer that arrives whole appears word by word in ~2 s; actions at the end", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  const sentAt = await deliver(page);
  await page.waitForTimeout(500);
  const mid = await progress(page);
  expect(mid.all).toBeGreaterThan(150);
  expect(mid.revealing).toBe(true);
  // Partway, not all at once and not nothing: by words, at a steady pace.
  expect(mid.shown).toBeGreaterThan(0);
  expect(mid.shown).toBeLessThan(mid.all * 0.6);
  // No actions and the live region stays busy (read once, at the end).
  expect(mid.actions).toBe(0);
  expect(mid.busy).toBe("true");
  // Words fade with opacity only, never move.
  const word = page.locator(".message-assistant .markdown [data-w]").first();
  expect(await word.evaluate((el) => getComputedStyle(el).transition)).toMatch(
    /^opacity 0\.16s/,
  );
  // No re-render during the reveal: from here to the end only classes change
  // (no node is added or removed in the answer), and no stray attributes.
  await page.evaluate(() => {
    const w = window as typeof window & { qaNodes: number };
    w.qaNodes = 0;
    const md = [
      ...document.querySelectorAll(".message-assistant .markdown"),
    ].at(-1)!;
    new MutationObserver((list) => {
      for (const m of list) if (m.type === "childList") w.qaNodes++;
    }).observe(md, { subtree: true, childList: true, characterData: true });
  });
  expect(
    await page.locator(".message-assistant .markdown [node]").count(),
  ).toBe(0);
  // The composer keeps the focus.
  await expect(
    page.getByRole("textbox", { name: "Mensaje para Dream" }),
  ).toBeFocused();
  const endAt = await revealEnd(page);
  const took = endAt - sentAt;
  console.log(`Revelado completo en ${Math.round(took)} ms`);
  test.info().annotations.push({
    type: "revelado",
    description: `${Math.round(took)} ms`,
  });
  expect(took).toBeGreaterThan(1600);
  expect(took).toBeLessThan(2400);
  const end = await progress(page);
  expect(end.shown).toBe(end.all);
  expect(end.busy).toBe("false");
  expect(
    await page.evaluate(
      () => (window as typeof window & { qaNodes: number }).qaNodes,
    ),
  ).toBe(0);
  await expect(
    page.locator(".message-assistant").last().locator(".message-actions"),
  ).toBeVisible();
  // Real content, painted once: list, formulas, no raw TeX.
  const answer = page.locator(".message-assistant").last();
  await expect(answer.locator(".markdown ol > li")).toHaveCount(3);
  await expect(answer.locator(".katex")).toHaveCount(2);
  await expect(answer).not.toContainText("$$");
});

test("no layout jump when the reveal ends (getBoundingClientRect before/after)", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page);
  // Last moment of the reveal: every block has started, some words to go.
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll(".message-assistant")].at(-1);
    return (
      !!a &&
      a.classList.contains("is-revealing") &&
      !a.querySelector(".markdown > [data-pending]")
    );
  });
  const rects = () =>
    page
      .locator(".message-assistant")
      .last()
      .evaluate((el) => {
        const r = (e: Element | null) => {
          const b = e!.getBoundingClientRect();
          return [b.top, b.left, b.width, b.height].map(Math.round).join(",");
        };
        const words = el.querySelectorAll(".markdown [data-w]");
        return {
          body: r(el.querySelector(".message-body")),
          blocks: [...el.querySelectorAll(".markdown > *")].map(r),
          first: r(words[0]),
          last: r(words[words.length - 1]),
          formula: r([...el.querySelectorAll(".katex")].at(-1) ?? null),
        };
      });
  // Compare in the scroll's frame (auto-scroll may move the whole thread).
  const scroll = () =>
    page.locator(".chat-scroll").evaluate((el) => el.scrollTop);
  const before = await rects();
  const top0 = await scroll();
  await revealEnd(page);
  await page.waitForTimeout(300); // actions entered, nothing pending
  const after = await rects();
  const shift = (await scroll()) - top0;
  const unshift = (s: string) => {
    const [t, ...rest] = s.split(",").map(Number);
    return [Math.round(t + shift), ...rest].join(",");
  };
  expect(after.body.split(",").slice(1)).toEqual(
    before.body.split(",").slice(1),
  );
  expect(unshift(after.body)).toBe(before.body);
  expect(after.blocks.map(unshift)).toEqual(before.blocks);
  expect(unshift(after.first)).toBe(before.first);
  expect(unshift(after.last)).toBe(before.last);
  expect(unshift(after.formula)).toBe(before.formula);
});

test("a click on the answer shows it all at once", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page);
  await page.waitForTimeout(300);
  expect((await progress(page)).revealing).toBe(true);
  const clickAt = await page.evaluate(() => performance.now());
  await page
    .locator(".message-assistant")
    .last()
    .locator(".message-body")
    .click({ position: { x: 20, y: 8 } });
  const endAt = await revealEnd(page);
  expect(endAt - clickAt).toBeLessThan(300);
  const end = await progress(page);
  expect(end.shown).toBe(end.all);
  await expect(
    page.locator(".message-assistant").last().locator(".message-actions"),
  ).toBeVisible();
});

test("tap on a phone shows it all at once", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await setup(page);
  await ask(page);
  await deliver(page);
  await page.waitForTimeout(300);
  await page
    .locator(".message-assistant")
    .last()
    .locator(".message-body")
    .tap({ position: { x: 20, y: 8 } });
  await expect.poll(async () => (await progress(page)).revealing).toBe(false);
  const end = await progress(page);
  expect(end.shown).toBe(end.all);
  await context.close();
});

test("reduced motion: the answer is shown at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  const sentAt = await deliver(page);
  const endAt = await revealEnd(page);
  expect(endAt - sentAt).toBeLessThan(400);
  const end = await progress(page);
  expect(end.shown).toBe(end.all);
  await expect(
    page.locator(".message-assistant").last().locator(".message-actions"),
  ).toBeVisible();
});

test("history is never revealed again", async ({ page }) => {
  await setup(page);
  await page.goto("/chat?c=33333333-3333-4333-8333-333333333333");
  const answer = page.locator(".message-assistant").first();
  await expect(answer).toBeVisible();
  expect(await answer.locator("[data-w]").count()).toBe(0);
  await expect(answer).not.toHaveClass(/is-revealing/);
});

test("fluency: reveal with CPU ×4 (long frames counted)", async ({ page }) => {
  test.setTimeout(90000);
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page, "Explícame las ecuaciones de segundo grado");
  // Inicio keeps its hero for 160 ms after sending (design/inicio) and then
  // swaps to the thread: measure the reveal, not that one-off swap.
  await page.locator(".message-assistant").waitFor();
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
  // Fast model: the ~170-word answer in 24-character chunks over ~400 ms.
  await page.evaluate(async (text) => {
    const qa = window as QA;
    const enc = new TextEncoder();
    const parts = text.match(/[\s\S]{1,24}/g) ?? [];
    for (const p of parts) {
      qa.qaStream?.enqueue(
        enc.encode(JSON.stringify({ type: "delta", text: p }) + "\n"),
      );
      await new Promise((r) => setTimeout(r, 400 / parts.length));
    }
    qa.qaStream?.enqueue(
      enc.encode(JSON.stringify({ type: "complete" }) + "\n"),
    );
    qa.qaStream?.close();
  }, ANSWER);
  await revealEnd(page);
  await page.waitForTimeout(300);
  const long = await page.evaluate(
    () => (window as typeof window & { qaLong: number[] }).qaLong,
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(
    `Fotogramas largos (>50 ms) con CPU x4 durante el revelado: ${long.length} ${JSON.stringify(long)}`,
  );
  test.info().annotations.push({
    type: "fluidez",
    description: `${long.length} fotogramas largos: ${JSON.stringify(long)}`,
  });
  // Same bar as the chat streaming test (shared, loaded machine).
  expect(long.length).toBeLessThanOrEqual(8);
  expect(Math.max(0, ...long)).toBeLessThan(120);
});
