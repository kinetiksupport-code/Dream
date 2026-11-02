// Simulacro de la ruta (Entrega 4): pantalla previa, preguntas con reloj,
// recuperación al recargar, entrega, resultados frente al objetivo, fallos
// con solución detallada y «No estoy de acuerdo», y diagnóstico. dream-api
// simulado con la forma de las respuestas reales (mock.ts).
import { test, expect, type Page } from "@playwright/test";
import { eid, routeFixture } from "./ruta-pasos-fixture";

test.use({ serviceWorkers: "block" });
const qs = [
  { id: "a1111111-1111-4111-8111-111111111111", position: 0, type: "mcq", prompt: "¿Quién mandó construir Santa Sofía?", options: ["Justiniano", "Constantino", "Teodosio"], topic: "Bizancio" },
  { id: "a2222222-2222-4222-8222-222222222222", position: 1, type: "tf", prompt: "Constantinopla cayó en 1453.", options: ["Verdadero", "Falso"], topic: "Bizancio" },
  { id: "a3333333-3333-4333-8333-333333333333", position: 2, type: "written", prompt: "Explica por qué cayó Constantinopla.", options: [], topic: "Bizancio" },
];
const review = qs.map((q, i) => ({
  ...q,
  answer: i === 0 ? "Constantino" : i === 1 ? "Verdadero" : "Por los turcos.",
  correct_answer: i === 0 ? "Justiniano" : i === 1 ? "Verdadero" : "Modelo",
  reason: "Lo preguntó tu examen de 2025.",
  rubric: ["Asedio otomano", "Debilidad del imperio"],
  score: i === 1 ? 1 : i === 2 ? 0.25 : 0,
  points: i === 2 ? 2 : 1,
  annulled: false,
  disputes: 0,
  criteria: i === 2 ? [{ criterion: "Asedio otomano", met: true }, { criterion: "Debilidad del imperio", met: false }] : null,
  feedback: "",
  improved: i === 2 ? "Los otomanos la asediaron y el imperio estaba débil." : "",
  cause: i === 1 ? null : "concepto",
  cause_confirmed: false,
  solution: "Paso a paso: Justiniano la mandó construir en el 532.",
  dispute: null,
}));

async function setup(page: Page, { kind = "final", remaining = 3000 as number | null, bp = true } = {}) {
  let done = false;
  let revision = 0;
  const calls = await routeFixture(page, {
    handlers: {
      mock_preview: () => ({
        plan: { kind, count: kind === "diagnostic" ? 8 : kind === "block" ? 10 : 15, minutes: kind === "diagnostic" ? null : kind === "block" ? 25 : 50, timer: "required", mix: { mcq: 8, tf: 3, written: 4 } },
        blueprint: bp ? { enough_material: true, based_on: "tus apuntes y tu examen de 2025", previous_exams: 1, topics: [], candidates: [{ topic: "Bizancio", type: "written", hint: "La caída de Constantinopla", reason: "Lo preguntó tu examen de 2025." }] } : null,
        quota: { ok: true, used: 0, cap: 2, unlimited: false },
        target_grade: 8.5,
      }),
      mock_create: (b) => ({ session: { id: b.session_id } }),
      mock_get: (b) =>
        done
          ? { session: { id: b.session_id, kind, status: "completed", answers: {}, question_index: 0, revision, remaining_seconds: null, time_limit_seconds: 3000, estimated_grade: 4.5 }, review, target_grade: 8.5, starting_point: kind === "diagnostic" ? { known: ["Bizancio"], start: ["Reinos"] } : null }
          : { session: { id: b.session_id, kind, status: "active", answers: {}, question_index: 0, revision, remaining_seconds: remaining, time_limit_seconds: remaining, estimated_grade: null }, questions: qs },
      exam_session_save: () => ({ session: { revision: ++revision } }),
      mock_submit: () => {
        done = true;
        return { ok: true };
      },
      mock_dispute: () => ({ accepted: true, message: "Tienes razón: esa idea también cuenta.", score: 0.75, annulled: false, estimated_grade: 6.5, disputes_left: 1 }),
      mock_cause: () => ({ ok: true }),
      cards_import: (b) => ({ created: (b.rows as unknown[]).length }),
      exam_route_regenerate: () => ({ exam: {} }),
    },
  });
  return calls;
}

test("final: pantalla previa con una acción, preguntas sin corrección, recuperar al recargar, entregar y nota frente al objetivo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page);
  await page.goto(`/exams/${eid}/simulacro?tipo=final`);
  const prev = page.getByTestId("simulacro-previa");
  await expect(prev).toContainText("Tu simulacro final");
  await expect(prev).toContainText("15 preguntas · 50 min");
  await expect(prev).toContainText("8 tipo test, 3 verdadero/falso, 4 de escribir");
  await expect(prev).toContainText("Basado en tus apuntes y tu examen de 2025");
  await prev.getByRole("button", { name: "Preguntas probables" }).click();
  await expect(page.getByText("No es seguro que caigan")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("heading", { name: /Santa Sofía/ })).toBeVisible();
  await expect(page).toHaveURL(/&s=[0-9a-f-]{36}/);
  expect(calls.find((c) => c.action === "mock_create")).toMatchObject({ kind: "final", timed: true });
  await expect(page.getByRole("timer")).toHaveText("50 min");
  await page.getByRole("radio", { name: "Constantino" }).click();
  await expect.poll(() => calls.filter((c) => c.action === "exam_session_save").length).toBe(1);
  // Sin corrección ni pistas antes de entregar.
  await expect(page.getByText(/Correcto|No es así/)).toHaveCount(0);
  // Presupuesto de la pregunta (≤ 7): X, barra, contador, reloj, enunciado, respuestas (grupo), pie (grupo).
  // Recargar: se recupera la misma sesión.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Santa Sofía/ })).toBeVisible();
  expect(calls.filter((c) => c.action === "mock_create")).toHaveLength(1);
  await page.getByRole("button", { name: "Preguntas: 1 de 3" }).click();
  await page.getByRole("button", { name: "Pregunta 3" }).click();
  await page.getByLabel("Tu respuesta").fill("Por los turcos.");
  await page.getByRole("button", { name: "Entregar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entregar" }).click();
  const res = page.getByTestId("simulacro-resultados");
  await expect(res).toContainText("Nota estimada por Dream");
  await expect(res).toContainText("4,50");
  await expect(res).toContainText("Tu objetivo es 8,5");
  expect(calls.filter((c) => c.action === "exam_session_save").length).toBeGreaterThanOrEqual(2);
});

test("fallos: solución detallada solo tras entregar, causa, «No estoy de acuerdo» y «Repasar mis fallos»", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await setup(page, { remaining: 0 });
  // Con el tiempo agotado al abrir, se entrega lo contestado.
  await page.goto(`/exams/${eid}/simulacro?tipo=final&s=b1111111-1111-4111-8111-111111111111`);
  await expect(page.getByTestId("simulacro-resultados")).toBeVisible();
  expect(calls.some((c) => c.action === "mock_submit")).toBe(true);
  await page.getByRole("button", { name: "Ver mis fallos" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("La correcta: Justiniano")).toBeVisible();
  await expect(sheet.getByText("Salió porque: Lo preguntó tu examen de 2025.").first()).toBeVisible();
  await sheet.getByText("Solución detallada").first().click();
  await expect(sheet.getByText(/Paso a paso/).first()).toBeVisible();
  await sheet.getByLabel("Causa").first().selectOption("despiste");
  await expect.poll(() => calls.find((c) => c.action === "mock_cause")?.cause).toBe("despiste");
  await sheet.getByRole("button", { name: "No estoy de acuerdo" }).last().click();
  await sheet.getByLabel("Cuéntame por qué crees que está bien").fill("La debilidad del imperio está en mi respuesta.");
  await sheet.getByRole("button", { name: "Enviar" }).click();
  await expect(sheet.getByText("Tienes razón: esa idea también cuenta.")).toBeVisible();
  await sheet.getByRole("button", { name: "Repasar mis fallos" }).click();
  await expect(sheet.getByRole("link", { name: "Ver mis tarjetas" })).toBeVisible();
  expect((calls.find((c) => c.action === "cards_import")?.rows as unknown[]).length).toBe(2);
});

test("de bloque: el alumno elige sin tiempo; diagnóstico: sin nota, «tu punto de partida» y la ruta se rehace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = await setup(page, { kind: "block", remaining: null, bp: false });
  await page.goto(`/exams/${eid}/simulacro?tipo=bloque`);
  await page.getByRole("radio", { name: "Sin tiempo" }).click();
  await expect(page.getByTestId("simulacro-previa")).toContainText("10 preguntas · sin reloj");
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("heading", { name: /Santa Sofía/ })).toBeVisible();
  expect(calls.find((c) => c.action === "mock_create")).toMatchObject({ kind: "block", timed: false });
  await expect(page.getByRole("timer")).toHaveCount(0);

  calls = await setup(page, { kind: "diagnostic", remaining: null, bp: false });
  await page.goto(`/exams/${eid}/simulacro?tipo=diagnostico`);
  await expect(page.getByTestId("simulacro-previa")).toContainText("sin nota y sin reloj");
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Preguntas: 1 de 3" }).click();
  await page.getByRole("button", { name: "Pregunta 3" }).click();
  await page.getByRole("button", { name: "Entregar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entregar" }).click();
  const res = page.getByTestId("simulacro-resultados");
  await expect(res).toContainText("Ya sabes: Bizancio.");
  await expect(res).toContainText("Empieza por: Reinos.");
  await expect(res).not.toContainText("%");
  await expect(res).not.toContainText("Nota");
  await res.getByRole("button", { name: "Ir a mi ruta" }).click();
  await expect.poll(() => calls.find((c) => c.action === "exam_route_regenerate")?.trigger).toBe("result");
});

// Capturas: CAPTURAS_DIR=docs/diseno/ruta-pasos/despues npx playwright test simulacro-ruta -g capturas
test("capturas del simulacro", async ({ page }) => {
  const dir = process.env.CAPTURAS_DIR;
  test.skip(!dir, "solo con CAPTURAS_DIR");
  for (const [w, h, name] of [[390, 844, "movil"], [1440, 900, "escritorio"]] as const)
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page);
      await page.goto(`/exams/${eid}/simulacro?tipo=final`);
      await expect(page.getByTestId("simulacro-previa")).toContainText("15 preguntas");
      await page.screenshot({ path: `${dir}/simulacro-previa-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Empezar" }).click();
      await page.getByRole("radio", { name: "Constantino" }).click();
      await page.screenshot({ path: `${dir}/simulacro-pregunta-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Preguntas: 1 de 3" }).click();
      await page.getByRole("button", { name: "Pregunta 3" }).click();
      await page.getByRole("button", { name: "Entregar" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Entregar" }).click();
      await expect(page.getByTestId("simulacro-resultados")).toBeVisible();
      await page.screenshot({ path: `${dir}/simulacro-resultados-${name}-${scheme}.png` });
      await page.getByRole("button", { name: "Ver mis fallos" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/simulacro-fallos-${name}-${scheme}.png` });
    }
});
