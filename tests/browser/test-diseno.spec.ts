import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Microinteractions of Test and Simulacro (docs/diseno/test/README.md):
// question transition, feedback with icon + text, score count, timer
// warnings, reduced motion and the six states of options and buttons.
test.use({ serviceWorkers: "block" });

const eid = "11111111-1111-4111-8111-111111111111";
const tid = "44444444-4444-4444-8444-444444444444";
const sid = "77777777-7777-4777-8777-777777777777";

/** Records every element.animate() call (WAAPI) with its keyframes. */
async function recordAnimate(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __enter: unknown[] };
    w.__enter = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const el = this as HTMLElement;
      if (el.matches?.(".question"))
        w.__enter.push({
          direction: el.dataset.direction,
          keyframes: JSON.parse(JSON.stringify(keyframes)),
          duration:
            typeof options === "number" ? options : (options?.duration ?? 0),
        });
      return original.call(this, keyframes, options);
    };
  });
}
const entered = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __enter: Record<string, unknown>[] }).__enter,
  );

/** Practice test: answers decide right or wrong; the submit result is 7/10. */
async function practice(page: Page, opts: { checkDelay?: number } = {}) {
  await mock(page);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    if (b.action === "test_check_answer") {
      if (opts.checkDelay)
        await new Promise((r) => setTimeout(r, opts.checkDelay));
      const ok = b.answer === "2 y 3";
      return route.fulfill({
        json: {
          evaluation: {
            is_correct: ok,
            correct_answer: "2 y 3",
            feedback: ok
              ? "Como 2 + 3 = 5 y 2 · 3 = 6, se factoriza."
              : "Casi: revisa el producto.",
          },
        },
      });
    }
    if (b.action === "test_submit")
      return route.fulfill({
        json: {
          result: {
            attempt_id: tid,
            score: 7,
            total: 10,
            percentage: 70,
            mastered: ["Factorización"],
            practice: ["Signos"],
            items: Array.from({ length: 10 }, (_, i) => ({
              question_id: `r${i}`,
              prompt: `Pregunta ${i + 1}`,
              answer: "x",
              is_correct: i < 7,
              feedback: "Explicación de la API.",
              correct_answer: i < 7 ? "x" : null,
            })),
          },
        },
      });
    return route.fallback();
  });
}

test("questions slide in 14 px with a fade, forwards and back, and never block", async ({
  page,
}) => {
  await recordAnimate(page);
  await practice(page);
  await page.goto(`/tests/${tid}`);
  await page.getByRole("radio", { name: /2 y 3/ }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.locator(".question")).toHaveAttribute(
    "data-direction",
    "forward",
  );
  await expect(page.locator(".test-progress p")).toHaveText(
    "Pregunta 2 de 2",
  );
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.locator(".question")).toHaveAttribute(
    "data-direction",
    "back",
  );
  const calls = await entered(page);
  expect(calls).toEqual([
    {
      direction: "forward",
      duration: 220,
      keyframes: [
        { opacity: 0, transform: "translateX(14px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
    },
    {
      direction: "back",
      duration: 220,
      keyframes: [
        { opacity: 0, transform: "translateX(-14px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
    },
  ]);
  // Fast taps interrupt cleanly: the last question is the one that stays.
  const next = page.getByRole("button", { name: "Siguiente" });
  const back = page.getByRole("button", { name: "Anterior" });
  await next.click();
  await back.click({ delay: 0 });
  await next.click({ delay: 0 });
  await expect(page.locator(".question-prompt")).toContainText(
    "¿Por qué igualamos",
  );
  await expect
    .poll(() =>
      page
        .locator(".question")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
});

test("progress bar moves with transform and ease-in-out", async ({ page }) => {
  await practice(page);
  await page.goto(`/tests/${tid}`);
  const bar = page.locator(".progress-track i");
  expect(
    await bar.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.transitionProperty, s.transitionTimingFunction];
    }),
  ).toEqual(["transform", "cubic-bezier(0.77, 0, 0.175, 1)"]);
  await expect(bar).toHaveAttribute("style", /scaleX\(0\.5\)/);
});

test("feedback: icon and text on right and wrong answers, with pop and nudge", async ({
  page,
}) => {
  await practice(page);
  await page.goto(`/tests/${tid}`);
  await page.getByRole("radio", { name: /1 y 5/ }).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  const wrong = page.locator(".answer-feedback.incorrect");
  await expect(wrong).toBeVisible();
  await expect(wrong.locator("strong")).toHaveText("Todavía no.");
  await expect(wrong.locator("strong svg")).toHaveCount(1);
  await expect(wrong).toContainText("Casi: revisa el producto.");
  await expect(wrong).toHaveAttribute("role", "status");
  const names = (sel: string) =>
    page
      .locator(sel)
      .evaluate((el) =>
        el.getAnimations().map((a) => (a as CSSAnimation).animationName),
      );
  expect(await names(".answer-feedback")).toContain("feedback-in");
  expect(await names(".answer-feedback strong")).toContain("feedback-nudge");
  // The nudge never goes further than 4 px.
  const maxShift = await page.evaluate(() => {
    const rule = [...document.styleSheets]
      .flatMap((s) => [...s.cssRules])
      .find(
        (r) => (r as CSSKeyframesRule).name === "feedback-nudge",
      ) as CSSKeyframesRule;
    return Math.max(
      ...[...rule.cssRules].map((k) =>
        Math.abs(
          parseFloat(
            (k as CSSKeyframeRule).style.transform.match(
              /-?[\d.]+/,
            )?.[0] ?? "0",
          ),
        ),
      ),
    );
  });
  expect(maxShift).toBeLessThanOrEqual(4);
  await page.getByRole("button", { name: "Volver a intentarlo" }).click();
  await page.getByRole("radio", { name: /2 y 3/ }).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  const right = page.locator(".answer-feedback.correct");
  await expect(right.locator("strong")).toHaveText("Bien pensado.");
  await expect(right.locator("strong svg")).toHaveCount(1);
  await expect(right).toContainText("se factoriza");
  expect(await names(".answer-feedback.correct .feedback-icon")).toContain(
    "feedback-pop",
  );
  // The duration of the entry is 180 ms.
  expect(
    await right.evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe("0.18s");
});

test("options and buttons: rest, hover, pressed, focus, loading and disabled", async ({
  page,
}) => {
  await practice(page, { checkDelay: 800 });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`/tests/${tid}`);
  const option = page.locator(".test-option").first();
  const check = page.getByRole("button", { name: "Comprobar respuesta" });
  // Disabled until there is an answer.
  await expect(check).toBeDisabled();
  const bg = () => option.evaluate((el) => getComputedStyle(el).backgroundColor);
  const rest = await bg();
  await option.hover();
  await expect.poll(bg).not.toBe(rest);
  await page.mouse.down();
  await expect
    .poll(() => option.evaluate((el) => getComputedStyle(el).transform))
    .toMatch(/matrix\(0\.98/);
  await page.mouse.up();
  // Keyboard focus draws the ring on the whole option.
  await page.mouse.move(0, 0);
  await page.locator(".test-option input").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".test-option").nth(1)).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(page.locator(".test-option.selected")).toHaveCount(1);
  await expect(check).toBeEnabled();
  await check.click();
  // Loading: busy flags and the other options step back.
  await expect(page.locator(".test-options")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.getByRole("button", { name: "Comprobando…" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect
    .poll(() => option.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("0.55");
  await expect(page.locator(".answer-feedback")).toBeVisible();
  await expect(page.locator(".test-options")).toHaveAttribute("disabled", "");
});

test("the score counts up to the final grade, can be skipped, and is read once", async ({
  page,
}) => {
  await practice(page);
  await page.goto(`/tests/${tid}`);
  await page.getByRole("radio", { name: /2 y 3/ }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page
    .getByLabel("Tu respuesta", { exact: true })
    .fill("Porque el producto es cero.");
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  const heading = page.getByRole("heading", { name: "7 / 10" });
  await expect(heading).toBeVisible(); // accessible name is final at once
  const shown = page.locator(".result-score > [aria-hidden]");
  const samples: string[] = [];
  for (let i = 0; i < 8; i++) {
    samples.push((await shown.textContent()) ?? "");
    await page.waitForTimeout(60);
  }
  expect(samples.some((s) => !s.startsWith("7 "))).toBe(true);
  await expect(shown).toHaveText("7 / 10");
  await expect(page.locator(".result-score")).toHaveAttribute(
    "data-counting",
    "false",
  );
  await expect(page.getByText("70% · 7 respuestas correctas · Nota 7.0/10").last()).toBeVisible();
  // Breakdown rows enter one after another (--stagger) and say it in words.
  const delays = await page
    .locator(".result-review details")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationDelay));
  expect(delays.slice(0, 3)).toEqual(["0s", "0.04s", "0.08s"]);
  await expect(page.locator(".result-review .review-state").first()).toHaveText(
    "Correcto",
  );
  await expect(page.locator(".result-review .review-state").last()).toHaveText(
    "Reforzar",
  );
  // No reference answer when the API does not send one.
  await page.locator(".result-review summary").last().click();
  await expect(
    page.locator(".result-review details").last().getByText("Referencia"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Repasar mis errores" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a Dream" })).toBeVisible();

  // Skipping: any key jumps to the final number.
  await page.reload();
  await page.getByRole("radio", { name: /2 y 3/ }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Tu respuesta", { exact: true }).fill("Porque sí.");
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  await expect(shown).toBeVisible();
  await page.keyboard.press("Space");
  await expect(shown).toHaveText("7 / 10", { timeout: 100 });
});

async function simulacro(page: Page, limit: number) {
  await mock(page);
  const started = new Date().toISOString();
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    const session = {
      id: sid,
      exam_id: eid,
      test_id: tid,
      mode: "exam",
      status: "active",
      answers: {},
      question_index: 0,
      revision: 0,
      started_at: started,
      submitted_at: null,
      time_limit_seconds: limit,
      result: null,
    };
    if (b.action === "exam_session_get" || b.action === "exam_session_save")
      return route.fulfill({ json: { session } });
    return route.fallback();
  });
}

test("simulacro: timer always visible, warns once at 5 minutes and once at 1", async ({
  page,
}) => {
  await page.clock.install();
  await simulacro(page, 10 * 60);
  await page.goto(`/exams/${eid}/sessions/${sid}`);
  const timer = page.locator('[class*="sessionTimer"]');
  await expect(timer).toContainText("restantes");
  await expect(timer.locator(".num")).toHaveText(/^(10:00|09:5\d)$/);
  await expect(timer).not.toHaveAttribute("data-warning");
  // Count live-region updates: each warning must be announced exactly once.
  await page.evaluate(() => {
    const live = document.querySelector('[class*="sessionTimer"] [aria-live]')!;
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    new MutationObserver(() => w.__said.push(live.textContent ?? "")).observe(
      live,
      { childList: true, characterData: true, subtree: true },
    );
  });
  const said = () =>
    page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  // Hiding the time is allowed until the warning, which shows it again.
  await page.getByRole("button", { name: "Ocultar tiempo" }).click();
  await expect(timer).toContainText("Temporizador activo");
  await page.clock.fastForward("05:02");
  await expect(timer).toHaveAttribute("data-warning", "five");
  await expect(timer).toContainText("Quedan 5 minutos.");
  await expect(timer.locator(".num")).toHaveText(/^04:5\d$/);
  await expect(timer.locator("svg")).toHaveCount(1);
  // Warning colour comes from the --warning token.
  const warningColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--warning")
      .trim(),
  );
  expect(warningColor.toLowerCase()).toBe("#8a5a00");
  await expect(timer.locator('[class*="clock"]')).toHaveCSS(
    "color",
    "rgb(138, 90, 0)",
  );
  for (let i = 0; i < 5; i++) await page.clock.fastForward(10_000);
  expect(await said()).toEqual(["Quedan 5 minutos del simulacro."]);
  await page.clock.fastForward("03:10");
  await expect(timer).toHaveAttribute("data-warning", "one");
  await expect(timer).toContainText("Queda 1 minuto.");
  for (let i = 0; i < 3; i++) await page.clock.fastForward(5_000);
  expect(await said()).toEqual([
    "Quedan 5 minutos del simulacro.",
    "Queda 1 minuto del simulacro.",
  ]);
  // No blinking: nothing on the timer loops.
  expect(
    await timer.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations === Infinity).length,
    ),
  ).toBe(0);
});

test("reduced motion: questions and feedback fade without moving; the score is final at once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordAnimate(page);
  await practice(page);
  await page.goto(`/tests/${tid}`);
  await page.getByRole("radio", { name: /1 y 5/ }).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator(".answer-feedback.incorrect")).toBeVisible();
  const moving = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) =>
        ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
          (k) => k.transform && k.transform !== "none",
        ),
      )
      .map((a) => (a as CSSAnimation).animationName ?? "waapi"),
  );
  expect(moving).toEqual([]);
  await page.getByRole("button", { name: "Siguiente" }).click();
  const calls = await entered(page);
  expect(calls).toHaveLength(1);
  expect(JSON.stringify(calls[0])).not.toContain("transform");
  await page.getByLabel("Tu respuesta", { exact: true }).fill("Porque sí.");
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  const score = page.locator(".result-score > [aria-hidden]");
  await score.waitFor();
  // First rendered frame already shows the final score.
  expect(await score.textContent()).toBe("7 / 10");
});

test("fluidity with the CPU slowed down 4×: question change and score count", async ({
  page,
}, info) => {
  await practice(page);
  await page.goto(`/tests/${tid}`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const watch = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __loaf: number[];
        __gaps: number[];
        __stop: boolean;
      };
      w.__loaf = [];
      w.__gaps = [];
      w.__stop = false;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__loaf.push(e.duration);
      }).observe({ type: "long-animation-frame", buffered: false });
      let last = performance.now();
      const tick = (now: number) => {
        w.__gaps.push(now - last);
        last = now;
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const read = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __loaf: number[];
        __gaps: number[];
        __stop: boolean;
      };
      w.__stop = true;
      return {
        frames: w.__gaps.length,
        longFrames: w.__gaps.filter((g) => g > 50).length,
        worstFrameMs: Math.round(Math.max(0, ...w.__gaps)),
        longAnimationFrames: w.__loaf.length,
      };
    });
  await page.getByRole("radio", { name: /2 y 3/ }).check();
  await watch();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.waitForTimeout(400);
  const change = await read();
  await page.getByLabel("Tu respuesta", { exact: true }).fill("Porque sí.");
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  await expect(page.locator(".result-score")).toBeVisible();
  await watch();
  await expect(page.locator(".result-score")).toHaveAttribute(
    "data-counting",
    "false",
  );
  await page.waitForTimeout(100);
  const count = await read();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const report = JSON.stringify({ change, count });
  info.annotations.push({ type: "fluidez-cpu-x4", description: report });
  console.log(`fluidez CPU x4: ${report}`);
  expect(change.frames).toBeGreaterThan(5);
  expect(count.frames).toBeGreaterThan(5);
});
