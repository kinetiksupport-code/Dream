import { test, expect, type Page } from "@playwright/test";
import type { DreamExam } from "../../lib/exam-plans";
test.use({ serviceWorkers: "block" });
// Datos de ejemplo solo para este test; la API está simulada.
const eid = "11111111-1111-4111-8111-111111111111";
const cid = "33333333-3333-4333-8333-333333333333";
const shots = process.env.CAPTURAS_DIR ?? "test-results/ruta";
const titles = [
  "El lenguaje del álgebra",
  "Ecuaciones de primer grado",
  "Signos y soluciones",
  "Factorización",
  "Practica y conecta",
];
const exam: DreamExam = {
  id: eid,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: "2026-12-20",
  topics: ["Ecuaciones"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: cid,
  plan_error: null,
  materials: [],
  sessions: [],
  units: titles.map((title, i) => ({
    id: `55555555-5555-4555-8555-55555555555${i}`,
    position: i,
    title,
    topic: "Ecuaciones",
    summary: "Comprende la idea y comprueba tu razonamiento.",
    estimated_minutes: 12,
    status: i < 2 ? "completed" : i === 2 ? "in_progress" : "pending",
    conversation_id: i < 3 ? cid : null,
  })),
};
const expected =
  "Voy por el 40 % de mi ruta para Matemáticas: 2 de 5 temas. Siguiente: Factorización. Con Dream — edudream.es";

async function fixture(page: Page, share: "native" | "clipboard") {
  await page.addInitScript((mode) => {
    localStorage.setItem(
      "sb-cxaujyagtpsxvkwkdxbc-auth-token",
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "66666666-6666-4666-8666-666666666666",
          email: "qa@example.test",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    const w = window as unknown as { shared: unknown[]; copied: string[] };
    w.shared = [];
    w.copied = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value:
        mode === "native"
          ? async (data: unknown) => {
              w.shared.push(data);
            }
          : undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.copied.push(text);
        },
      },
    });
  }, share);
  const calls: string[] = [];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b.action);
    let response: unknown;
    switch (b.action) {
      case "profile":
        response = {
          profile: { email: "qa@example.test", display_name: "Alex" },
          service_ready: true,
        };
        break;
      case "conversations":
      case "messages":
        response = { items: [] };
        break;
      case "exam_get":
        response = { exam };
        break;
      case "exam_unit_start":
        response = {
          unit: {
            ...exam.units.find((u) => u.id === b.unit_id),
            status: "in_progress",
            conversation_id: cid,
          },
        };
        break;
      default:
        await route.fulfill({
          status: 400,
          json: { error: `Acción inesperada en fixture: ${b.action}` },
        });
        return;
    }
    await route.fulfill({ json: response });
  });
  return calls;
}

test("la ruta muestra cada tema con su estado y abre las unidades desbloqueadas", async ({
  page,
}) => {
  await fixture(page, "native");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/exams/${eid}`);
  await page.getByRole("link", { name: "Ver mi ruta de estudio" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
  await expect(
    page.getByRole("heading", { name: "Tu ruta, paso a paso." }),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "Tus temas" });
  const steps = list.getByRole("listitem");
  await expect(steps).toHaveCount(5);
  expect(
    await steps.evaluateAll((li) =>
      li.map((l) => l.getAttribute("data-state")),
    ),
  ).toEqual(["completed", "completed", "current", "next", "locked"]);
  await expect(steps.nth(0)).toContainText("Completado");
  await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(steps.nth(2)).toContainText("Estás aquí");
  await expect(steps.nth(3)).toContainText("A continuación");
  await expect(steps.nth(4)).toContainText("Bloqueado");
  await expect(steps.nth(4).getByRole("link")).toHaveCount(0);
  for (const i of [0, 1, 2, 3])
    await expect(steps.nth(i).getByRole("link")).toHaveAttribute(
      "href",
      `/exams/${eid}/study/${exam.units[i].id}`,
    );
  await expect(page.getByText("40 %", { exact: true })).toBeVisible();
  await expect(page.getByText("2 de 5 temas", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText(
    "2 de 5 temas completados, 40 %.",
  );
  await steps.nth(3).getByRole("link").click();
  await expect(page).toHaveURL(`/exams/${eid}/study/${exam.units[3].id}`);
  await expect(
    page.getByRole("heading", { name: "Factorización" }),
  ).toBeVisible();
});

test("«Compartir» usa navigator.share con un texto sin datos personales", async ({
  page,
}) => {
  await fixture(page, "native");
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Compartir" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { shared: unknown[] }).shared),
    )
    .toEqual([{ text: expected }]);
  expect(expected).not.toMatch(/Alex|qa@example|primer trimestre|33333333/);
  await expect(page.getByText("Copiado")).toHaveCount(0);
});

test("sin Web Share API, «Compartir» copia al portapapeles y avisa", async ({
  page,
}) => {
  await fixture(page, "clipboard");
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Compartir" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copiado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual([expected]);
});

test("capturas de la ruta: móvil y escritorio, claro y oscuro", async ({
  page,
}) => {
  await fixture(page, "clipboard");
  for (const size of [
    { width: 360, height: 800, name: "360" },
    { width: 1440, height: 900, name: "1440" },
  ])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await page.goto(`/exams/${eid}/ruta`);
      await expect(
        page.getByRole("list", { name: "Tus temas" }).getByRole("listitem"),
      ).toHaveCount(5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}.png`,
        animations: "disabled",
      });
      await page.getByRole("list", { name: "Tus temas" }).screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}-temas.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Compartir" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}-compartir.png`,
        animations: "disabled",
      });
    }
  await page.getByRole("button", { name: "Compartir" }).click();
  await expect(page.getByText("Copiado")).toBeVisible();
  await page.screenshot({
    path: `${shots}/ruta-1440-dark-copiado.png`,
    animations: "disabled",
  });
});
