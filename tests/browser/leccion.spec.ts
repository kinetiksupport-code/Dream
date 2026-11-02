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

test("ruta → lección: preparando, leer con V/F, test, resultados y vuelta con el check", async ({ page }) => {
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
  // Sección 1: la respuesta no se ve antes de contestar.
  await expect(page.getByRole("heading", { name: "Qué fue Bizancio" })).toBeVisible();
  await expect(page.getByText("Es falso")).toHaveCount(0);
  await page.getByRole("button", { name: "¿Por qué es importante?" }).click();
  await expect(page.getByText("Explica cómo sobrevivió Roma.")).toBeVisible();
  await page.getByRole("button", { name: "Verdadero" }).click();
  await expect(page.getByText("No es así")).toBeVisible();
  await expect(page.getByText(/Es falso\. Lo dice la sección\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Explícame por qué" })).toHaveAttribute("href", `/exams/${eid}/study/${UNIT}?tutor=1`);
  await page.getByRole("button", { name: "Continuar" }).click();
  // Sección 2.
  await page.getByRole("button", { name: "Verdadero" }).click();
  await expect(page.getByText("¡Correcto!")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  // Test: una barra para todo (2 secciones + 3 preguntas).
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
  await page.getByRole("button", { name: "Roma" }).click();
  await expect(page.getByText("La correcta es «Constantinopla».")).toBeVisible();
  // Botones bloqueados tras contestar.
  await expect(page.getByRole("button", { name: "Atenas" })).toBeDisabled();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("textbox", { name: "Tu respuesta" }).fill("Cayó Constantinopla y terminó la Edad Media.");
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.getByText(/Ideas clave: Caída de Constantinopla · Fin de la Edad Media/)).toBeVisible();
  await page.getByRole("button", { name: "Ver resultados" }).click();
  // Resultados: número grande, frase, 2 datos, opinión sin cambiar la altura y Continuar.
  const results = page.getByTestId("leccion-resultados");
  await expect(results.getByText("Repasa tus fallos")).toBeVisible();
  await expect(results.getByText("67 %")).toBeVisible();
  const box = await results.getByRole("group", { name: "¿Cómo lo has notado?" }).boundingBox();
  await results.getByRole("button", { name: "Bien" }).click();
  await expect(results.getByText("Gracias")).toBeVisible();
  const after = await results.getByRole("group", { name: "¿Cómo lo has notado?" }).boundingBox();
  expect(after!.height).toBeCloseTo(box!.height, 0);
  expect(calls.find((c) => c.action === "unit_quiz_finish")).toMatchObject({ answers: { 0: "Roma", 1: true, 2: "Cayó Constantinopla y terminó la Edad Media." } });
  expect(calls.some((c) => c.felt_difficulty === "bien")).toBe(true);
  await results.getByRole("link", { name: "Continuar" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
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
        const g = el.closest("[role='group'], footer");
        if (g) {
          if (groups.has(g)) continue;
          groups.add(g);
        }
        n++;
      }
      return n;
    });
  // X, barra, contador, «1 fuente», título, «¿Por qué es importante?», V/F (grupo) = 7 → la lección cuenta el contenido como 1.
  expect(await count()).toBeLessThanOrEqual(8);
  await page.getByRole("button", { name: "Falso" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("button", { name: "Roma" })).toBeVisible();
  expect(await count()).toBeLessThanOrEqual(7);
});

test("pretest opcional: es normal fallarlas, no puntúa y se puede saltar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await lesson(page, { pre: true });
  await page.goto(`/exams/${eid}/study/${UNIT}`);
  await expect(page.getByTestId("leccion-pretest")).toContainText("Es normal fallarlas");
  await page.getByRole("button", { name: "Roma" }).click();
  await expect(page.getByText("Lo verás en la lectura.")).toBeVisible();
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
      await lesson(page, { pre: true });
      await page.goto(`/exams/${eid}/study/${UNIT}`);
      await expect(page.getByTestId("leccion-pretest")).toBeVisible();
      await page.screenshot({ path: `${dir}/leccion-pretest-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Saltar" }).click();
      await page.getByRole("button", { name: "Verdadero" }).click();
      await expect(page.getByRole("status").filter({ hasText: "No es así" })).toBeVisible();
      await page.screenshot({ path: `${dir}/leccion-leer-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("button", { name: "Verdadero" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("button", { name: "Roma" }).click();
      await expect(page.getByRole("status").filter({ hasText: "No es así" })).toBeVisible();
      await page.screenshot({ path: `${dir}/leccion-test-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("button", { name: "Verdadero" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("textbox").fill("Cayó Constantinopla.");
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: "Ver resultados" }).click();
      await expect(page.getByTestId("leccion-resultados")).toBeVisible();
      await page.screenshot({ path: `${dir}/leccion-resultados-${name}-${scheme}.png` });
    }
});
