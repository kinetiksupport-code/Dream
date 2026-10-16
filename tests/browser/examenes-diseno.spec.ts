import { test, expect, type Page, type Route } from "@playwright/test";
import { mock } from "./design-fixture";
// Exámenes (design/examenes): states, microinteractions, phone widths and,
// with CAPTURAS_DIR, the screenshots for docs/diseno/examenes. RECORD_DIR
// records the microinteractions video.
test.use({ serviceWorkers: "block" });

const eid = "11111111-1111-4111-8111-111111111111";
const cid = "33333333-3333-4333-8333-333333333333";
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const units = [
  "El lenguaje del álgebra",
  "Ecuaciones de primer grado",
  "Signos y soluciones",
  "Factorización",
].map((title, i) => ({
  id: `55555555-5555-4555-8555-55555555555${i}`,
  position: i,
  title,
  topic: "Ecuaciones",
  summary: "Comprende la idea, busca un ejemplo y comprueba tu razonamiento.",
  estimated_minutes: 12,
  status: i < 1 ? "completed" : i === 1 ? "in_progress" : "pending",
  conversation_id: cid,
}));
const base = {
  id: eid,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: inDays(12),
  topics: ["Ecuaciones", "Factorización"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: cid,
  plan_error: null as string | null,
  materials: [
    {
      id: cid,
      file_name: "Tema 4 · Ecuaciones.pdf",
      mime_type: "application/pdf",
      size_bytes: 248 * 1024,
      status: "processed",
    },
  ],
  sessions: [] as unknown[],
  units,
};
const others = [
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111112",
    title: "Comentario de texto",
    subject: "Lengua y Literatura",
    exam_date: inDays(2),
    units: units.map((u) => ({ ...u, status: "pending" })),
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111113",
    title: "Célula y tejidos",
    subject: "Biología",
    exam_date: inDays(25),
    status: "preparing",
    units: [],
  },
];

type Opts = {
  exams?: unknown[];
  exam?: Partial<typeof base>;
  delay?: Partial<Record<string, number>>;
  calls?: string[];
  after?: Record<string, unknown>;
};
/** design-fixture's mock plus the exam states this screen needs. */
async function setup(page: Page, o: Opts = {}) {
  await mock(page);
  let exam = { ...base, ...o.exam };
  await page.route("**/functions/v1/dream-api", async (route: Route) => {
    const b = route.request().postDataJSON();
    o.calls?.push(b.action);
    const wait = o.delay?.[b.action];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    let data: unknown;
    switch (b.action) {
      case "exams":
        data = { exams: o.exams ?? [exam, ...others] };
        break;
      case "exam_get":
        data = { exam };
        break;
      case "exam_prepare":
        exam = { ...exam, status: "ready", plan_error: null, units };
        data = { exam };
        break;
      case "exam_create":
      case "exam_update":
        exam = { ...exam, ...b, status: "draft", units: [] };
        data = { exam };
        break;
      case "exam_unit_start":
        data = { unit: units[1] };
        break;
      default:
        return route.fallback();
    }
    await route.fulfill({ json: data });
  });
}

const STATES: { name: string; path: string; opts?: Opts; ready?: (p: Page) => Promise<unknown> }[] = [
  { name: "lista", path: "/exams" },
  { name: "lista-vacia", path: "/exams", opts: { exams: [] } },
  { name: "lista-cargando", path: "/exams", opts: { delay: { exams: 60_000 } } },
  { name: "detalle", path: `/exams/${eid}` },
  { name: "plan", path: `/exams/${eid}/plan` },
  { name: "nuevo", path: "/exams/new" },
  {
    name: "nuevo-errores",
    path: "/exams/new",
    ready: (p) =>
      p.getByRole("button", { name: /Siguiente: materiales/ }).click(),
  },
  {
    name: "preparando",
    path: `/exams/${eid}`,
    opts: { exam: { status: "preparing", units: [] } },
  },
  {
    name: "fallido",
    path: `/exams/${eid}`,
    opts: {
      exam: {
        status: "failed",
        units: [],
        plan_error: "Dream no pudo leer «Tema 4 · Ecuaciones.pdf».",
      },
    },
  },
  { name: "estudio", path: `/exams/${eid}/study/${units[1].id}` },
];

async function open(page: Page, name: string) {
  const s = STATES.find((x) => x.name === name)!;
  await setup(page, s.opts);
  await page.goto(s.path);
  if (name !== "lista-cargando")
    await page.locator("h1").first().waitFor({ timeout: 10_000 });
  if (s.ready) await s.ready(page);
  await page.waitForTimeout(400);
}

const OUT = process.env.CAPTURAS_DIR;
test.describe("examenes capturas", () => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  for (const st of STATES)
    for (const vp of [
      { name: "movil", width: 390, height: 844 },
      { name: "escritorio", width: 1440, height: 900 },
    ])
      for (const scheme of ["light", "dark"] as const)
        test(`examenes ${st.name} ${vp.name} ${scheme}`, async ({ page }) => {
          await page.setViewportSize(vp);
          await page.emulateMedia({ colorScheme: scheme });
          await open(page, st.name);
          await page.screenshot({
            path: `${OUT}/${st.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
            fullPage: st.name !== "estudio",
          });
        });
});

test.describe("examenes microinteracciones", () => {
  test.skip(!!OUT, "screenshots only");

  test("card: rest, hover lift + arrow, press .97, keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "lista");
    const card = page.getByRole("link", { name: /Álgebra · primer trimestre/ });
    const t = () => card.evaluate((el) => getComputedStyle(el).transform);
    const arrow = () =>
      card.evaluate((el) => getComputedStyle(el.querySelector("svg:last-child")!).transform);
    const lift = () =>
      card.evaluate((el) => getComputedStyle(el, "::after").opacity);
    await page.waitForTimeout(500); // entrance finished
    expect(await t()).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    expect(await lift()).toBe("0");
    await card.hover();
    await page.waitForTimeout(350);
    expect(await t()).toBe("matrix(1, 0, 0, 1, 0, -2)");
    expect(await arrow()).toBe("matrix(1, 0, 0, 1, 4, 0)");
    expect(await lift()).toBe("1");
    await page.mouse.down();
    await page.waitForTimeout(250);
    expect(await t()).toBe("matrix(0.97, 0, 0, 0.97, 0, 0)");
    // Release outside the card so the press does not navigate.
    await page.mouse.move(1270, 890);
    await page.mouse.up();
    await page.keyboard.press("Tab");
    await card.focus();
    const outline = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${parseFloat(s.outlineWidth)}`;
    });
    expect(outline).toBe("solid 2");
  });

  test("reduced motion: no lift, no arrow shift, no press scale", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "lista");
    const card = page.getByRole("link", { name: /Álgebra · primer trimestre/ });
    await card.hover();
    await page.mouse.down();
    await page.waitForTimeout(250);
    const t = await card.evaluate((el) => ({
      card: getComputedStyle(el).transform,
      arrow: getComputedStyle(el.querySelector("svg:last-child")!).transform,
      anim: getComputedStyle(el).animationName,
    }));
    await page.mouse.up();
    expect(t).toEqual({ card: "none", arrow: "none", anim: expect.stringMatching(/cardFade/) });
  });

  test("days to the exam: number in .num, icon and words, warning when ≤ 3 days", async ({ page }) => {
    await open(page, "lista");
    const normal = page.getByRole("link", { name: /Álgebra/ }).locator("span[class*=days]");
    await expect(normal).toContainText("12 días");
    await expect(normal.locator(".num")).toHaveText("12");
    await expect(normal.locator("svg")).toHaveCount(1);
    const soon = page.getByRole("link", { name: /Comentario de texto/ }).locator("span[class*=days]");
    await expect(soon).toHaveAttribute("data-soon", "true");
    await expect(soon).toContainText("2 días");
    await expect(soon.locator("svg")).toHaveCount(1);
    // Ordered by date: the nearest exam first
    await expect(page.locator("a[class*=examCard]").first()).toContainText("Comentario de texto");
    // A preparing exam says so in words
    await expect(page.getByRole("link", { name: /Célula y tejidos/ })).toContainText(
      "Dream está preparando el plan",
    );
  });

  test("skeleton has the list's shape and is announced", async ({ page }) => {
    await setup(page, { delay: { exams: 60_000 } });
    await page.goto("/exams");
    const sk = page.locator("[aria-busy=true]");
    await expect(sk).toBeVisible();
    await expect(sk.getByRole("status")).toHaveText("Cargando tus exámenes");
    expect(await sk.locator("[class*=boneCard]").count()).toBe(2);
  });

  test("empty state: inline SVG and a clear button", async ({ page }) => {
    await open(page, "lista-vacia");
    await expect(page.getByRole("heading", { name: "Aún no tienes exámenes" })).toBeVisible();
    await expect(page.locator("section svg[aria-hidden=true]").first()).toBeVisible();
    const cta = page.getByRole("link", { name: "Preparar un examen" });
    await expect(cta).toHaveAttribute("href", "/exams/new");
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("new exam: visible labels, errors with cause beside the field, focus moves there", async ({ page }) => {
    await open(page, "nuevo");
    await page.getByRole("button", { name: /Siguiente: materiales/ }).click();
    const title = page.getByLabel("Nombre del examen");
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAccessibleDescription(/Escribe un nombre/);
    await expect(page.getByLabel("Asignatura")).toHaveAccessibleDescription(/Elige una asignatura/);
    await expect(page.getByLabel("Fecha del examen")).toHaveAccessibleDescription(/Elige el día/);
    await title.fill("Álgebra");
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Fecha del examen").fill("2020-01-10");
    await page.getByRole("button", { name: /Siguiente: materiales/ }).click();
    await expect(page.getByLabel("Fecha del examen")).toHaveAccessibleDescription(
      "Elige hoy o un día futuro.",
    );
  });

  test("new exam: loading button has aria-busy and is disabled", async ({ page }) => {
    await setup(page, { delay: { exam_create: 1500 } });
    await page.goto("/exams/new");
    await page.getByLabel("Nombre del examen").fill("Álgebra");
    await page.getByLabel("Asignatura").fill("Matemáticas");
    await page.getByLabel("Fecha del examen").fill(inDays(10));
    await expect(page.getByText("Quedan 10 días.")).toBeVisible();
    await page.getByRole("button", { name: /Siguiente: materiales/ }).click();
    const busy = page.getByRole("button", { name: /Guardando/ });
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toBeDisabled();
    await expect(page.getByLabel("Temas", { exact: true })).toBeVisible();
    // Step 2 requires topics, with the cause beside the field
    await page.getByRole("button", { name: /Revisar mi examen/ }).click();
    await expect(page.getByLabel("Temas", { exact: true })).toHaveAccessibleDescription(
      /Añade al menos un tema/,
    );
  });

  test("touch targets: 44 px on list, detail and form", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["lista", "detalle", "plan", "nuevo"]) {
      await open(page, name);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll(".workspace-main a[href], .workspace-main button, .workspace-main input, .workspace-main select")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          })
          .filter((el) => !(el as HTMLInputElement).type?.match(/checkbox|file/))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const after = getComputedStyle(el, "::after");
            const extra = after.content !== "none" ? 8 : 0;
            return r.height + extra < 44 && !el.closest("[class*=examCard]");
          })
          .map((el) => `${el.tagName} «${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}» ${Math.round(el.getBoundingClientRect().height)}`),
      );
      expect(small, name).toEqual([]);
    }
  });

  test("preparing: concrete text, live status and the thinking-orb hook", async ({ page }) => {
    const calls: string[] = [];
    await setup(page, { exam: { status: "preparing", units: [] }, calls });
    await page.goto(`/exams/${eid}`);
    await expect(page.getByRole("status").filter({ hasText: "Dream está preparando tu plan" })).toBeVisible();
    await expect(page.getByText(/Divide Ecuaciones, Factorización en unidades cortas/)).toBeVisible();
    await expect(page.locator('[data-hook="thinking-orb"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Comprobar ahora" }).click();
    await expect.poll(() => calls.filter((c) => c === "exam_get").length).toBeGreaterThan(1);
  });

  test("failed plan: cause, «Reintentar» with aria-busy, then the plan", async ({ page }) => {
    const calls: string[] = [];
    await setup(page, {
      exam: { status: "failed", units: [], plan_error: "Dream no pudo leer «Tema 4 · Ecuaciones.pdf»." },
      calls,
      delay: { exam_prepare: 800 },
    });
    await page.goto(`/exams/${eid}`);
    await expect(page.getByRole("alert").filter({ hasText: "Dream" })).toContainText("Dream no pudo leer");
    await expect(page.getByRole("alert").filter({ hasText: "Dream" })).toContainText("siguen guardados");
    await page.getByRole("button", { name: "Reintentar" }).click();
    const busy = page.getByRole("button", { name: /Reintentando/ });
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("heading", { name: "Plan de estudio" })).toBeVisible();
    expect(calls).toContain("exam_prepare");
  });

  test("detail: Claude Design hierarchy and plan rows", async ({ page }) => {
    await open(page, "detalle");
    await expect(page.locator("h1")).toHaveText("Álgebra · primer trimestre");
    await expect(page.getByRole("heading", { name: "Matemáticas", level: 2 })).toBeVisible();
    await expect(page.getByText("Basado en Tema 4 · Ecuaciones")).toBeVisible();
    await expect(page.locator("[class*=count] .num")).toHaveText("12");
    await expect(page.getByRole("button", { name: "Hacer un test de práctica" })).toBeVisible();
    const rows = page.locator("a[class*=planRow]");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Hecha");
    await expect(rows.nth(1)).toContainText("Hoy");
    await expect(rows.nth(2)).toContainText("Unidad 3");
    for (const i of [0, 1, 2])
      expect((await rows.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(64);
  });

  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ])
    test(`no sideways scroll at ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const wide: string[] = [];
      for (const st of STATES) {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await open(page, st.name);
        const over = await page.evaluate(() =>
          [document.scrollingElement, document.querySelector(".workspace-main")]
            .filter(Boolean)
            .some((r) => r!.scrollWidth > r!.clientWidth + 1),
        );
        if (over) wide.push(st.name);
      }
      expect(wide).toEqual([]);
    });

  test("smoothness: hovering cards with CPU ×4 keeps long frames low", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "lista");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
      const w = window as unknown as { frames_: number[] };
      w.frames_ = [];
      let last = performance.now();
      const tick = (t: number) => {
        w.frames_.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const cards = page.locator("a[class*=examCard]");
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < (await cards.count()); i++) {
        await cards.nth(i).hover();
        await page.waitForTimeout(260);
      }
    const frames = await page.evaluate(
      () => (window as unknown as { frames_: number[] }).frames_.slice(1),
    );
    const long = frames.filter((f) => f > 50).length;
    console.log(`frames=${frames.length} long(>50ms)=${long} max=${Math.max(...frames).toFixed(1)}ms`);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(long).toBeLessThanOrEqual(3);
  });
});

const REC = process.env.RECORD_DIR;
test.describe("examenes grabacion", () => {
  test.skip(!REC, "Set RECORD_DIR to record the microinteractions");
  test("record", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: REC!, size: { width: 1280, height: 800 } },
      serviceWorkers: "block",
    });
    const page = await ctx.newPage();
    await open(page, "lista");
    const cards = page.locator("a[class*=examCard]");
    for (let i = 0; i < 3; i++) {
      await cards.nth(i).hover();
      await page.waitForTimeout(700);
    }
    await page.mouse.move(10, 10);
    await page.waitForTimeout(400);
    await cards.nth(1).hover();
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(350);
    }
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await setup(page, { delay: { exam_create: 1200 } });
    await page.goto("/exams/new");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Siguiente: materiales/ }).click();
    await page.waitForTimeout(1200);
    await page.getByLabel("Nombre del examen").fill("Álgebra · primer trimestre");
    await page.getByLabel("Asignatura").fill("Matemáticas");
    await page.getByLabel("Fecha del examen").fill(inDays(12));
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Siguiente: materiales/ }).click();
    await page.waitForTimeout(1600);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await setup(page, {
      exam: { status: "failed", units: [], plan_error: "Dream no pudo leer «Tema 4 · Ecuaciones.pdf»." },
      delay: { exam_prepare: 1000 },
    });
    await page.goto(`/exams/${eid}`);
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Reintentar" }).click();
    await page.waitForTimeout(2000);
    await page.locator("a[class*=planRow]").nth(1).hover();
    await page.waitForTimeout(900);
    await ctx.close();
  });
});
