// La lección Leer → Test → resultados (Entrega 2), con dream-api simulado con
// la forma exacta de las respuestas reales (supabase/functions/dream-api/study.ts).
import { test, expect, type Page } from "@playwright/test";
import { eid, routeFixture } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const UNIT = "55555555-5555-4555-8555-555555555503";
const reading = {
  sections: [
    { title: "Qué fue Bizancio", body_markdown: "El **Imperio bizantino** fue la parte oriental del Imperio romano.", why_it_matters: "Explica cómo sobrevivió Roma.", check: { statement: "Bizancio era la parte occidental." } },
    { title: "Justiniano", body_markdown: "**Justiniano** reunió las leyes romanas.", why_it_matters: null, check: { statement: "Justiniano reunió las leyes romanas." } },
  ],
  sources: ["De tus apuntes"],
};
const truth = [false, true];
const questions = [
  { index: 0, type: "mcq", prompt: "¿Capital de Bizancio?", options: ["Roma", "Constantinopla", "Atenas"] },
  { index: 1, type: "tf", prompt: "Justiniano reunió las leyes." },
  { index: 2, type: "written", prompt: "¿Por qué es importante 1453?" },
];
const right: Record<number, string | boolean> = { 0: "Constantinopla", 1: true, 2: "x" };

async function lesson(page: Page, { slow = 0, generating = 0, pre = false } = {}) {
  let gets = 0;
  const calls: Record<string, unknown>[] = [];
  await routeFixture(page, {
    handlers: {
      unit_content_get: () => (gets++ < generating ? { status: "generating" } : { status: "ready", reading, progress: null }),
      unit_progress_save: (b) => {
        calls.push(b);
        const c = b.check as { section: number; answer: boolean } | undefined;
        return { ok: true, check: c ? { correct: c.answer === truth[c.section], is_true: truth[c.section], explanation: "Lo dice la sección." } : null };
      },
      unit_quiz_get: (b) => (b.pretest ? { questions: pre ? questions.slice(0, 2) : [] } : { questions }),
      unit_quiz_answer: (b) => {
        calls.push(b);
        const i = b.index as number;
        const ok = i === 2 ? true : b.answer === right[i];
        return { correct: ok, correct_answer: right[i], explanation: "Explicación corta.", ...(i === 2 ? { rubric: ["Caída de Constantinopla", "Fin de la Edad Media"] } : {}) };
      },
      unit_quiz_rate: (b) => {
        calls.push(b);
        return { ok: true };
      },
      unit_quiz_finish: (b) => {
        calls.push(b);
        return { right: 2, total: 3, pct: 67, mastered: false, completed: true, mistake_cards: 1 };
      },
    },
  });
  if (slow)
    await page.route("**/functions/v1/dream-api", async (route) => {
      if (route.request().postDataJSON().action === "unit_content_get") await new Promise((r) => setTimeout(r, slow));
      return route.fallback();
    });
  return calls;
}

test("ruta → lección (0.11): tarjetas «Qué saber», test con la Orb y «Comprobar», hoja de color, repaso de fallos y resultados", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await lesson(page, { slow: 1500 });
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: /Etapas históricas y Constantinopla/ }).click();
  await page.getByTestId("route-sheet").getByRole("link", { name: "Empezar" }).click();
  // Preparando: la Orb y pasos reales; el juego, opcional.
  const prep = page.getByTestId("leccion-preparando");
  await expect(prep).toBeVisible();
  await expect(prep.getByText("Escribiendo la lectura, las preguntas y las tarjetas")).toBeVisible();
  await expect(prep.getByRole("button", { name: "Juega mientras esperas" })).toBeVisible();
  // Tarjeta 1: «Qué saber», sin barra de progreso (aparece en el test) y con «Saltar».
  const card = page.getByTestId("tarjeta-que-saber");
  await expect(card.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible();
  await expect(card).toContainText("Qué saber");
  await expect(page.getByRole("button", { name: "Saltar" })).toBeVisible();
  await page.getByRole("button", { name: "¿Por qué es importante?" }).click();
  await expect(page.getByText("Explica cómo sobrevivió Roma.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  // Última tarjeta: «Empezar test» en el mismo sitio y la flecha para volver a leer.
  await expect(card.getByRole("heading", { name: "Justiniano" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la tarjeta anterior" }).click();
  await expect(card.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Empezar test" }).click();
  // Test: las V/F de las tarjetas van mezcladas con las del banco (2 + 3 = 5).
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
  const check = page.getByRole("button", { name: "Comprobar" });
  await expect(check).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("radio", { name: "Roma" }).click();
  await expect(page.getByRole("radio", { name: "Roma" })).toHaveAttribute("aria-checked", "true");
  await expect(check).not.toHaveAttribute("aria-disabled", "true");
  await check.click();
  const sheet = page.getByTestId("hoja-correccion");
  await expect(sheet.getByRole("status")).toContainText("Incorrecto");
  await expect(sheet).toContainText("La correcta es «Constantinopla».");
  await expect(page.getByRole("radio", { name: /Atenas/ })).toHaveAttribute("aria-disabled", "true");
  await sheet.getByRole("button", { name: "Mala pregunta" }).click();
  await expect.poll(() => calls.find((c) => c.action === "unit_quiz_rate")).toMatchObject({ index: 0, up: false });
  // «¿Por qué?» abre el tutor con la pregunta ya escrita; Esc lo cierra.
  await sheet.getByRole("button", { name: "¿Por qué?" }).click();
  const panel = page.getByTestId("panel-por-que");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("textbox").first()).toHaveValue(/contesté «Roma» y la respuesta es «Constantinopla»/);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await sheet.getByRole("button", { name: "Entendido" }).click();
  // V/F de la tarjeta 1, con su etiqueta.
  await expect(page.getByText("¿Verdadero o falso?")).toBeVisible();
  await page.getByRole("radio", { name: "Verdadero" }).click();
  await check.click();
  await expect(sheet.getByRole("status")).toContainText("Incorrecto");
  await expect(sheet.getByRole("button", { name: "Mala pregunta" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Entendido" }).click();
  // Teclado: 1 elige, Intro comprueba y continúa.
  await expect(page.getByRole("heading", { name: "Justiniano reunió las leyes." })).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByRole("radio", { name: "Verdadero" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("status")).toContainText("¡Genial!");
  await page.keyboard.press("Enter");
  await page.getByRole("radio", { name: "Verdadero" }).click();
  await check.click();
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("textbox", { name: "Tu respuesta" }).fill("Cayó Constantinopla y terminó la Edad Media.");
  await check.click();
  await expect(sheet).toContainText("Ideas clave: Caída de Constantinopla · Fin de la Edad Media.");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  // Ronda de repaso: la fallada vuelve con «Error anterior» hasta acertarla.
  await expect(page.getByRole("heading", { name: "¡Repasemos las preguntas que fallaste!" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Error anterior")).toBeVisible();
  await page.getByRole("radio", { name: "Constantinopla" }).click();
  await check.click();
  await sheet.getByRole("button", { name: "Ver resultados" }).click();
  // Resultados: Orb, titular, aciertos y tiempo, opinión, Repetir y Continuar.
  const results = page.getByTestId("leccion-resultados");
  await expect(results.getByRole("heading", { name: "Casi" })).toBeVisible();
  await expect(results.getByRole("list", { name: "Tu resultado" })).toContainText("2/3");
  await expect(results.getByRole("list", { name: "Tu resultado" })).toContainText(/\d+:\d{2}/);
  await expect(results).not.toContainText("XP");
  const box = await results.getByRole("group", { name: "¿Cómo lo has notado?" }).boundingBox();
  await results.getByRole("button", { name: "Bien" }).click();
  await expect(results.getByText("Gracias")).toBeVisible();
  const after = await results.getByRole("group", { name: "¿Cómo lo has notado?" }).boundingBox();
  expect(after!.height).toBeCloseTo(box!.height, 0);
  // La nota sale del primer intento: el repaso no la cambia.
  expect(calls.find((c) => c.action === "unit_quiz_finish")).toMatchObject({ answers: { 0: "Roma", 1: true, 2: "Cayó Constantinopla y terminó la Edad Media." } });
  expect(calls.some((c) => c.felt_difficulty === "bien")).toBe(true);
  await expect(results.getByRole("button", { name: "Repetir" })).toBeVisible();
  await results.getByRole("link", { name: "Continuar" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
});

test("movimiento reducido: la hoja de corrección no se desliza ni hay saltos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await lesson(page);
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await page.getByRole("button", { name: "Saltar" }).click();
  await page.getByRole("button", { name: "Empezar test" }).click();
  await page.getByRole("radio", { name: "Roma" }).click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  const sheet = page.getByTestId("hoja-correccion");
  await expect(sheet).toBeVisible();
  const anim = await sheet.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toMatch(/sheetUp/);
  const wrong = await page.getByRole("radio", { name: /Roma/ }).evaluate((el) => getComputedStyle(el).animationName);
  expect(wrong).toBe("none");
});

test("otra pestaña la está preparando: se vuelve a mirar sola; fuentes en una hoja", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await lesson(page, { generating: 1 });
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await expect(page.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "1 fuente" }).click();
  await expect(page.getByRole("heading", { name: "Fuentes" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "De tus apuntes" })).toBeVisible();
});

test("sin cupo hoy y lección fallida: avisos claros y «Reintentar»", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempt = 0;
  await routeFixture(page, {
    handlers: {
      unit_content_get: () => (attempt++ === 0 ? { status: "failed", message: "No hemos podido preparar esta lección. Reintentar" } : { status: "limit", used: 6, cap: 6 }),
    },
  });
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await expect(page.getByRole("heading", { name: "No hemos podido crear la lección" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { name: "Hoy ya has creado tus lecciones" })).toBeVisible();
  await expect(page.getByText("Hoy llevas 6 de 6.")).toBeVisible();
});

test("presupuesto: lección ≤ 6 elementos y pregunta ≤ 7", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await lesson(page);
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await expect(page.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible();
  const count = () =>
    page.evaluate(() => {
      const groups = new Set<Element>();
      let n = 0;
      for (const el of document.querySelectorAll<HTMLElement>("a[href], button, textarea, [role='progressbar'], .question-prompt, article h1, h1")) {
        if (el.closest(".sidebar, .tabbar, .topbar, .skip-link")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom <= 0 || r.top >= innerHeight) continue;
        const g = el.closest("[role='group'], [role='radiogroup'], footer, [data-testid='hoja-correccion']");
        if (g) {
          if (groups.has(g)) continue;
          groups.add(g);
        }
        n++;
      }
      return n;
    });
  // Tarjeta: X, «1 fuente», título, «¿Por qué es importante?», pie (Saltar + Continuar) = 5.
  expect(await count()).toBeLessThanOrEqual(6);
  await page.getByRole("button", { name: "Saltar" }).click();
  await page.getByRole("button", { name: "Empezar test" }).click();
  await expect(page.getByRole("radio", { name: "Roma" })).toBeVisible();
  // Pregunta: X, barra, burbuja, respuestas (grupo), «Comprobar» = 5-6 antes de comprobar.
  expect(await count()).toBeLessThanOrEqual(6);
  await page.getByRole("radio", { name: "Roma" }).click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.getByTestId("hoja-correccion")).toBeVisible();
  // Después: la hoja y sus botones; nunca más de 7 a la vez.
  expect(await count()).toBeLessThanOrEqual(7);
});

test("pretest opcional: es normal fallarlas, no puntúa y se puede saltar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await lesson(page, { pre: true });
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await expect(page.getByTestId("leccion-pretest")).toContainText("es normal fallarlas");
  await page.getByRole("radio", { name: "Roma" }).click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.getByTestId("hoja-correccion")).toContainText("Lo verás en la lectura");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Saltar" }).click();
  await expect(page.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible();
  expect(calls.some((c) => c.action === "unit_quiz_finish")).toBe(false);
});

// Capturas de evidencia: CAPTURAS_DIR=docs/diseno/ruta-pasos/despues npx playwright test leccion -g capturas
test("capturas de la lección", async ({ page }) => {
  const dir = process.env.CAPTURAS_DIR;
  test.skip(!dir, "solo con CAPTURAS_DIR");
  for (const [w, h, name] of [[390, 844, "movil"], [1440, 900, "escritorio"]] as const)
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await lesson(page);
      await page.goto(`/exams/${eid}/study/${UNIT}`);
      await expect(page.getByTestId("tarjeta-que-saber")).toBeVisible();
      await page.screenshot({ path: `${dir}/leccion-que-saber-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.screenshot({ path: `${dir}/leccion-empezar-test-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Empezar test" }).click();
      await page.getByRole("radio", { name: "Roma" }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${dir}/leccion-pregunta-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/leccion-hoja-roja-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "¿Por qué?" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/leccion-por-que-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Cerrar la explicación" }).click();
      await page.getByRole("button", { name: "Entendido" }).click();
      await page.getByRole("radio", { name: "Falso" }).click();
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/leccion-hoja-verde-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("radio", { name: "Verdadero" }).click();
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("radio", { name: "Verdadero" }).click();
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("textbox", { name: "Tu respuesta" }).fill("Cayó Constantinopla.");
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByTestId("leccion-repaso")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/leccion-repasemos-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${dir}/leccion-error-anterior-${name}-${scheme}.png` });
      await page.getByRole("radio", { name: "Constantinopla" }).click();
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: "Ver resultados" }).click();
      await expect(page.getByTestId("leccion-resultados")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/leccion-resultados-${name}-${scheme}.png` });
    }
});
