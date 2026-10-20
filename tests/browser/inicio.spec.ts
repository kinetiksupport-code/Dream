import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Inicio (/chat with no conversation): greeting by time of day, study context
// from the exam plan (no AI), suggestion chips that fill the box without
// sending, the send button states and reduced motion.
test.use({ serviceWorkers: "block" });

const box = (page: Page) =>
  page.getByRole("textbox", { name: "Mensaje para Dream" });
const send = (page: Page) =>
  page.getByRole("button", { name: "Enviar mensaje" });

/** Today at the given local hour (the fixture's exam is 12 days from now). */
const todayAt = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Records every dream-api action the page asks for. */
function actions(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/dream-api") && r.method() === "POST")
      seen.push(r.postDataJSON()?.action);
  });
  return seen;
}

async function open(
  page: Page,
  opts: { exams?: unknown; delay?: number; hour?: number } = {},
) {
  if (opts.hour !== undefined) await page.clock.setFixedTime(todayAt(opts.hour));
  await mock(page);
  if (opts.exams !== undefined || opts.delay)
    // Registered after mock(): Playwright tries the newest route first.
    await page.route("**/functions/v1/dream-api", async (route) => {
      const action = route.request().postDataJSON()?.action;
      if (action !== "exams") return route.fallback();
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (opts.exams === undefined) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.exams),
      });
    });
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
}

for (const [hour, text] of [
  [9, "Buenos días, Alex."],
  [12, "Buenos días, Alex."],
  [13, "Buenas tardes, Alex."],
  [19, "Buenas tardes, Alex."],
  [20, "Buenas noches, Alex."],
  [23, "Buenas noches, Alex."],
] as const)
  test(`greeting at ${hour}:00 says «${text}»`, async ({ page }) => {
    await open(page, { hour });
    await expect(page.locator(".home-greeting")).toHaveText(text);
  });

test("context line: next pending unit and days to the exam, computed without AI", async ({
  page,
}) => {
  const seen = actions(page);
  await open(page, { hour: 16 });
  await expect(page.locator(".home-context")).toHaveText(
    "Hoy toca Ecuaciones de primer grado · 12 días para tu examen.",
  );
  // It sits above the headline (layout.md › Order content by relative importance).
  const hello = await page.locator(".home-hello").boundingBox();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(hello!.y + hello!.height).toBeLessThanOrEqual(h1!.y);
  expect(seen).toContain("exams");
  expect(seen).toContain("exam_get");
  expect(seen).not.toContain("chat");
});

test("no exam: greeting only, no context line and no skeleton left behind", async ({
  page,
}) => {
  await open(page, { exams: { exams: [] }, hour: 16 });
  await expect(page.locator(".home-greeting")).toHaveText("Buenas tardes, Alex.");
  await expect(page.locator(".home-context-skeleton")).toHaveCount(0);
  await expect(page.locator(".home-context")).toHaveText("");
});

test("slow context: headline and box are there at once, a one-line skeleton waits, then the line fades in", async ({
  page,
}) => {
  await open(page, { delay: 1500, hour: 16 });
  await expect(box(page)).toBeVisible();
  const skeleton = page.locator(".home-context-skeleton");
  await expect(skeleton).toHaveCount(1);
  await expect
    .poll(() => skeleton.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  const lines = await skeleton.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  expect(lines).toBeLessThan(24); // one line
  await expect(page.locator(".home-context")).toContainText("12 días", {
    timeout: 5000,
  });
  await expect(skeleton).toHaveCount(0);
  const fade = await page
    .locator(".home-context-text")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(fade).toBe("fade");
});

test("chips fill the box with the topic of the day, put the cursor at the end and never send", async ({
  page,
}) => {
  const seen = actions(page);
  await open(page, { hour: 16 });
  await expect(page.locator(".home-context")).toContainText("Hoy toca");
  const chips = page.getByRole("group", { name: "Sugerencias" });
  await expect(chips.getByRole("button")).toHaveText([
    "Subir apuntes",
    "Practicar ejercicios",
    "Hacer un test",
  ]);
  for (const [label, text] of [
    [
      "Practicar ejercicios",
      "Quiero practicar ejercicios de Ecuaciones de primer grado. Dame pistas, no la solución.",
    ],
    [
      "Hacer un test",
      "Hazme un test de 5 preguntas sobre Ecuaciones de primer grado.",
    ],
  ] as const) {
    await chips.getByRole("button", { name: label }).click();
    await expect(box(page)).toHaveValue(text);
    await expect(box(page)).toBeFocused();
    expect(
      await box(page).evaluate((el: HTMLTextAreaElement) => [
        el.selectionStart,
        el.selectionEnd,
      ]),
    ).toEqual([text.length, text.length]);
  }
  // Every chip has an icon next to its text.
  expect(await chips.locator(".chip-icon svg").count()).toBe(3);
  const chooser = page.waitForEvent("filechooser");
  await chips.getByRole("button", { name: "Subir apuntes" }).click();
  await chooser;
  await page.waitForTimeout(300);
  expect(seen.filter((a) => /chat|test_generate|conversation_create/.test(a)))
    .toEqual([]);
});

test("without a topic the chips leave the sentence open for the student", async ({
  page,
}) => {
  await open(page, { exams: { exams: [] }, hour: 16 });
  await page.getByRole("button", { name: "Practicar ejercicios" }).click();
  await expect(box(page)).toHaveValue("Quiero practicar ejercicios de ");
  await page.getByRole("button", { name: "Hacer un test" }).click();
  await expect(box(page)).toHaveValue("Hazme un test de 5 preguntas sobre ");
});

test("chip states: hover, pressed and keyboard focus", async ({ page }) => {
  await open(page, { hour: 16 });
  const chip = page.getByRole("button", { name: "Hacer un test" });
  await page.waitForTimeout(400); // entrance finished
  const bg = () => chip.evaluate((el) => getComputedStyle(el).backgroundColor);
  const rest = await bg();
  await chip.hover();
  await expect.poll(bg).not.toBe(rest);
  await page.mouse.down();
  await expect
    .poll(() => chip.evaluate((el) => getComputedStyle(el).transform))
    .toMatch(/^matrix\(0\.9[0-9]*/);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  // Keyboard path: from «Practicar ejercicios», Tab lands on «Hacer un test».
  await page.getByRole("button", { name: "Practicar ejercicios" }).focus();
  await page.keyboard.press("Tab");
  await expect(chip).toBeFocused();
  const ring = await chip.evaluate((el) => {
    const s = getComputedStyle(el);
    return [el.matches(":focus-visible"), s.outlineStyle, s.outlineWidth];
  });
  expect(ring).toEqual([true, "solid", "2px"]);
});

test("send button: asleep and small while empty, awake and full size with text", async ({
  page,
}) => {
  await open(page, { hour: 16 });
  const look = () =>
    send(page).evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      transform: getComputedStyle(el).transform,
    }));
  await expect(send(page)).toBeDisabled();
  await expect.poll(async () => (await look()).transform).toBe(
    "matrix(0.9, 0, 0, 0.9, 0, 0)",
  );
  const asleep = await look();
  const transition = await send(page).evaluate(
    (el) => getComputedStyle(el).transitionProperty,
  );
  expect(transition).toContain("transform");
  expect(transition).not.toMatch(/height|width|all/);
  await box(page).fill("¿Qué es una derivada?");
  await expect(send(page)).toBeEnabled();
  await expect
    .poll(async () => (await look()).transform)
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const awake = await look();
  expect(awake.bg).toBe("rgb(21, 91, 255)");
  expect(awake.bg).not.toBe(asleep.bg);
  // Focus ring on the whole box while typing.
  expect(
    await page
      .locator(".composer-hero")
      .evaluate((el) => getComputedStyle(el, "::after").opacity),
  ).toBe("1");
});

test("the box grows with the text without animating its height", async ({
  page,
}) => {
  await open(page, { hour: 16 });
  const height = () =>
    box(page).evaluate((el) => el.getBoundingClientRect().height);
  const before = await height();
  await box(page).fill("Una línea\nDos\nTres\nCuatro");
  expect(await height()).toBeGreaterThan(before);
  // "all 0s" is the browser default; what matters is no timed height change.
  const animated = await box(page).evaluate((el) => {
    const s = getComputedStyle(el);
    const durations = s.transitionDuration.split(",").map(parseFloat);
    return s.transitionProperty
      .split(",")
      .map((p, i) => [p.trim(), durations[i % durations.length]] as const)
      .filter(([p, d]) => /height|all/.test(p) && d > 0);
  });
  expect(animated).toEqual([]);
});

test("sending: the button shrinks and the hero fades out towards the chat without blocking", async ({
  page,
}) => {
  await page.clock.install();
  await mock(page, { pendingChat: true });
  const seen = actions(page);
  await page.goto("/chat");
  await box(page).fill("Explícame las derivadas");
  // Hold page timers so the 160 ms swap can be inspected (CSS keeps running).
  await page.clock.pauseAt(Date.now() + 1000);
  await box(page).press("Enter");
  // The request starts at once; only the swap of views waits for the fade.
  await expect.poll(() => seen).toContain("chat");
  await expect(page.locator(".home.is-leaving")).toHaveCount(1);
  await expect(box(page)).toHaveValue("Explícame las derivadas");
  await expect
    .poll(() => send(page).evaluate((el) => getComputedStyle(el).transform))
    .toBe("matrix(0.9, 0, 0, 0.9, 0, 0)");
  await expect
    .poll(() =>
      page
        .locator(".home-inner")
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe("0");
  await page.clock.resume();
  await expect(page.locator(".home")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByText("Explícame las derivadas")).toBeVisible();
});

test("reduced motion: entrance, chips and sending only fade, nothing moves", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { delay: 1500, hour: 16 });
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some(
            (k) => k.transform && k.transform !== "none",
          ),
        )
        .map((a) => (a as CSSAnimation).animationName ?? "transition"),
    );
  expect(await moving()).toEqual([]);
  // The skeleton does not pulse.
  expect(
    await page
      .locator(".home-context-skeleton span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  // The asleep send button keeps its size.
  expect(
    await send(page).evaluate((el) => getComputedStyle(el).transform),
  ).toBe("none");
  const chip = page.getByRole("button", { name: "Hacer un test" });
  await chip.hover();
  await page.mouse.down();
  expect(await moving()).toEqual([]);
  expect(await chip.evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
  await page.mouse.up();
});
