import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// The answer «types itself» (P5, docs/HABLA_NATURAL.md; replaces the 2 s soft
// reveal): ~40 characters per second with pauses, never more than 8 s; a
// click, a tap, Esc or Enter shows it all; reduced motion is instant; the
// actions wait for the end and nothing moves when it ends.
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

test("an answer that arrives whole types itself in ≤ 8 s; actions at the end", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  const sentAt = await deliver(page);
  await page.waitForTimeout(1500);
  const mid = await progress(page);
  expect(mid.all).toBeGreaterThan(150);
  expect(mid.revealing).toBe(true);
  // Partway, not all at once and not nothing: by words, at a steady pace.
  expect(mid.shown).toBeGreaterThan(0);
  expect(mid.shown).toBeLessThan(mid.all * 0.4);
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
  // ~170 words would take ~30 s at 40 characters per second: it speeds up
  // to end at the 8 s limit, not before.
  expect(took).toBeGreaterThan(7000);
  expect(took).toBeLessThan(8800);
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

// ── P5: typing pace, controls, accessibility (docs/HABLA_NATURAL.md) ────────

/** ~40 words, the length Dream should answer with now. */
const SHORT =
  "Vale, vamos por partes. Una ecuación de segundo grado tiene una x al cuadrado, y eso cambia cómo se resuelve. Primero mira si puedes sacar factor común. ¿Ves algún número que divida a todos los términos?";
const CAPTURAS = process.env.CAPTURAS_DIR;

test("time to first character < 1 s, then ~40 characters per second with pauses", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  const sentAt = await deliver(page, SHORT);
  // First word: within a frame or two of the data arriving.
  const firstAt = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const check = () => {
          const a = [...document.querySelectorAll(".message-assistant")].at(-1);
          if (a?.querySelector(".markdown [data-w].is-shown")) resolve(performance.now());
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
  expect(firstAt - sentAt).toBeLessThan(1000);
  await page.waitForTimeout(1000);
  const atOne = await progress(page);
  // About 7 words a second (40 characters), not the whole answer.
  expect(atOne.shown).toBeGreaterThanOrEqual(3);
  expect(atOne.shown).toBeLessThanOrEqual(12);
  const took = (await revealEnd(page)) - sentAt;
  console.log(`Respuesta de ${SHORT.length} caracteres escrita en ${Math.round(took)} ms`);
  // 205 characters at 40/s ≈ 5,1 s + pauses: well under the 8 s limit.
  expect(took).toBeGreaterThan(4000);
  expect(took).toBeLessThan(8200);
});

test("«Dream está escribiendo…» shows before the first character and goes with it", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await ask(page);
  const indicator = page.locator(".message-assistant").last().locator(".typing-indicator");
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveText("Dream está escribiendo…");
  // The dots move with opacity and transform only.
  const animated = await indicator
    .locator(".typing-dots span")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animated).toBe("typing-dot");
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/escribiendo-indicador-movil.png` });
  await deliver(page, SHORT);
  await expect(indicator).toHaveCount(0);
});

test("Esc, or Enter outside the composer, shows it all at once", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page);
  await page.waitForTimeout(300);
  // Enter while typing in the composer does not end it (it is for sending).
  await page.getByRole("textbox", { name: "Mensaje para Dream" }).press("Enter");
  expect((await progress(page)).revealing).toBe(true);
  const at = await page.evaluate(() => performance.now());
  await page.keyboard.press("Escape");
  expect((await revealEnd(page)) - at).toBeLessThan(300);
  // Enter with the focus elsewhere, on a second answer.
  await page.evaluate(() => ((window as QA).qaStream = undefined));
  await page.getByRole("textbox", { name: "Mensaje para Dream" }).fill("Otra");
  await page.getByRole("textbox", { name: "Mensaje para Dream" }).press("Enter");
  await page.waitForFunction(() => !!(window as QA).qaStream);
  await deliver(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await progress(page)).revealing).toBe(false);
});

test("a hidden tab does not animate: it shows everything", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page);
  await page.waitForTimeout(300);
  expect((await progress(page)).revealing).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await progress(page)).revealing).toBe(false);
  const end = await progress(page);
  expect(end.shown).toBe(end.all);
});

test("screen readers: not live while typing, the answer is announced once at the end", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page, SHORT);
  const answer = page.locator(".message-assistant").last();
  await expect(answer.locator(".message-body")).toHaveAttribute("aria-live", "off");
  // While typing, the announcer is empty.
  const announcer = answer.locator('[role="status"][aria-atomic="true"]');
  await expect(announcer).toHaveText("");
  // Count every change of the announcer: exactly one, with the whole text.
  await page.evaluate(() => {
    const w = window as typeof window & { qaSaid: string[] };
    w.qaSaid = [];
    const el = [...document.querySelectorAll('.message-assistant [role="status"][aria-atomic="true"]')].at(-1)!;
    new MutationObserver(() => {
      if (el.textContent) w.qaSaid.push(el.textContent);
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
  await revealEnd(page);
  await expect(announcer).toContainText("Vale, vamos por partes.");
  await page.waitForTimeout(500);
  const said = await page.evaluate(() => (window as typeof window & { qaSaid: string[] }).qaSaid);
  expect(said).toHaveLength(1);
  expect(said[0]).toContain("¿Ves algún número que divida a todos los términos?");
});

test("when it ends, the effect stops using frames (CPU idle)", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await ask(page);
  await deliver(page, SHORT);
  await page.locator(".message-assistant").last().locator(".message-body").click({ position: { x: 20, y: 8 } });
  await revealEnd(page);
  await page.waitForTimeout(500);
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => {
          n++;
          return raf(cb);
        };
        setTimeout(() => resolve(n), 1000);
      }),
  );
  console.log(`requestAnimationFrame en 1 s tras terminar: ${frames}`);
  expect(frames).toBeLessThanOrEqual(2);
});

test("screenshots and video while it types: phone and desktop, light, dark and reduced motion", async ({ browser }) => {
  test.skip(!CAPTURAS, "Set CAPTURAS_DIR to take screenshots");
  test.setTimeout(120000);
  for (const [name, viewport] of [
    ["movil", { width: 390, height: 844 }],
    ["escritorio", { width: 1280, height: 860 }],
  ] as const)
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        serviceWorkers: "block",
        ...(colorScheme === "light" ? { recordVideo: { dir: `${CAPTURAS}/video`, size: viewport } } : {}),
      });
      const page = await context.newPage();
      await setup(page);
      await ask(page, "¿Cómo resuelvo x² − 5x + 6 = 0?");
      await deliver(page, SHORT);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${CAPTURAS}/escribiendo-${name}-${colorScheme === "light" ? "claro" : "oscuro"}.png` });
      await revealEnd(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${CAPTURAS}/escrito-${name}-${colorScheme === "light" ? "claro" : "oscuro"}.png` });
      await context.close();
    }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await reduced.newPage();
  await setup(page);
  await ask(page);
  await deliver(page, SHORT);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${CAPTURAS}/movimiento-reducido-movil.png` });
  await reduced.close();
});
