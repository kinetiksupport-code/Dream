import { test, expect, type Page } from "@playwright/test";
import type { DreamExam, ExamSession, ExamUnit } from "../../lib/exam-plans";
test.use({ serviceWorkers: "block" });

// Contract fixtures for Progreso, confined to tests. Dates are relative to a
// fixed "today" (Thursday 15 October 2026) so every number is stable.
const SHOTS = process.env.PROGRESS_SHOTS ?? "test-results";
const TODAY = new Date(2026, 9, 15, 12);
const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month - 1, day, hour).toISOString();
const algebra = "11111111-1111-4111-8111-111111111111";
const history = "22222222-2222-4222-8222-222222222222";

function unit(
  i: number,
  topic: string,
  title: string,
  patch: Partial<ExamUnit> = {},
): ExamUnit {
  return {
    id: `55555555-5555-4555-8555-55555555555${i}`,
    position: i,
    title,
    topic,
    summary: "Comprende la idea y comprueba tu razonamiento.",
    estimated_minutes: 20,
    status: "pending",
    conversation_id: null,
    completed_at: null,
    ...patch,
  };
}
const algebraExam: DreamExam = {
  id: algebra,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: "2026-10-29",
  topics: ["Ecuaciones", "Factorización", "Sistemas"],
  difficulties: "",
  goal: "",
  daily_minutes: 20,
  status: "ready",
  conversation_id: null,
  plan_error: null,
  materials: [],
  units: [
    unit(0, "Ecuaciones", "El lenguaje del álgebra", {
      status: "completed",
      completed_at: at(10, 6),
    }),
    unit(1, "Ecuaciones", "Ecuaciones de primer grado", {
      status: "completed",
      completed_at: at(10, 13),
    }),
    unit(2, "Factorización", "Sacar factor común", {
      status: "in_progress",
    }),
    unit(3, "Factorización", "Identidades notables"),
    unit(4, "Sistemas", "Sistemas de dos ecuaciones"),
  ],
  sessions: [
    {
      id: "77777777-7777-4777-8777-777777777771",
      mode: "practice",
      status: "completed",
      started_at: at(10, 13, 9),
      submitted_at: at(10, 13),
    },
    {
      id: "77777777-7777-4777-8777-777777777772",
      mode: "exam",
      status: "completed",
      started_at: at(10, 14, 9),
      submitted_at: at(10, 14),
    },
    {
      id: "77777777-7777-4777-8777-777777777773",
      mode: "exam",
      status: "active",
      started_at: at(10, 15, 9),
      submitted_at: null,
    },
  ],
};
const historyExam: DreamExam = {
  ...algebraExam,
  id: history,
  title: "Historia · tema 3",
  subject: "Historia",
  exam_date: "2026-11-20",
  topics: ["Revolución francesa"],
  units: [unit(0, "Revolución francesa", "Causas")],
  sessions: [],
};
function session(
  id: string,
  patch: Partial<ExamSession>,
  percentage: number,
  practice: string[],
): ExamSession {
  return {
    id,
    exam_id: algebra,
    mode: "exam",
    status: "completed",
    started_at: at(10, 14, 9),
    submitted_at: at(10, 14),
    test_id: "44444444-4444-4444-8444-444444444444",
    answers: {},
    question_index: 0,
    revision: 1,
    time_limit_seconds: null,
    result: {
      attempt_id: "a",
      score: percentage / 10,
      total: 10,
      percentage,
      mastered: [],
      practice,
      items: [],
    },
    ...patch,
  };
}
const sessions: Record<string, ExamSession> = {
  "77777777-7777-4777-8777-777777777771": session(
    "77777777-7777-4777-8777-777777777771",
    {
      mode: "practice",
      unit_id: algebraExam.units[1].id,
      submitted_at: at(10, 13),
    },
    90,
    ["Signos al despejar"],
  ),
  "77777777-7777-4777-8777-777777777772": session(
    "77777777-7777-4777-8777-777777777772",
    {},
    60,
    ["Signos al despejar", "Factor común"],
  ),
};

async function fixture(page: Page, exams: DreamExam[]) {
  const calls: string[] = [];
  await page.clock.setFixedTime(TODAY);
  await page.addInitScript(() => {
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
  });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b.action);
    let response: unknown = { ok: true };
    switch (b.action) {
      case "profile":
        response = {
          profile: { email: "qa@example.test", display_name: "Alex" },
          service_ready: true,
        };
        break;
      case "conversations":
        response = { items: [] };
        break;
      case "exams":
        response = {
          exams: exams.map((e) => ({
            ...e,
            units: e.units.map(({ id, status }) => ({ id, status })),
            materials: [],
          })),
          next_offset: null,
        };
        break;
      case "exam_get":
        response = { exam: exams.find((e) => e.id === b.exam_id) };
        break;
      case "exam_session_get":
        response = { session: sessions[b.session_id] };
        break;
    }
    await route.fulfill({ json: response });
  });
  return calls;
}

test("Progreso: empty state links to creating an exam", async ({ page }) => {
  await fixture(page, []);
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "Aún no hay nada que medir" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Crear un examen/ }),
  ).toHaveAttribute("href", "/exams/new");
  await page.screenshot({
    path: `${SHOTS}/progreso-vacio-escritorio-claro.png`,
  });
});

test("Progreso: readiness, tabs, gaps, tree and weekly plan from saved data", async ({
  page,
}) => {
  const calls = await fixture(page, [historyExam, algebraExam]);
  await page.setViewportSize({ width: 1440, height: 2200 });
  await page.goto("/progress");

  // Closest upcoming exam is selected; the picker lists both.
  const picker = page.getByRole("combobox", { name: "Examen" });
  await expect(picker).toHaveValue(algebra);
  await expect(picker.locator("option")).toHaveCount(2);

  // Ecuaciones: study 100, tests 90 → 95. Factorización: 0 + simulacro 60 → 30.
  // Sistemas: 0 + 60 → 30. Readiness = (95 + 30 + 30) / 3 = 52.
  const ring = page.getByRole("progressbar", {
    name: "Preparación para el examen",
  });
  await expect(ring).toHaveAttribute("aria-valuenow", "52");
  await expect(ring).toHaveAttribute("aria-valuemax", "100");
  await expect(page.getByText("1 de 3", { exact: true })).toBeVisible();
  await expect(page.getByText("14 días", { exact: true })).toBeVisible();
  // Only completed sessions are fetched; the active one is not.
  expect(calls.filter((c) => c === "exam_session_get")).toHaveLength(2);

  // Tabs follow the ARIA pattern.
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  const prep = page.getByRole("tab", { name: "Preparación" });
  await expect(prep).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "tab-preparacion",
  );

  await expect(
    page.getByRole("heading", { name: "Previsión para el examen" }),
  ).toBeVisible();
  await expect(page.getByText(/previstos el día del examen/)).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Dominio de Ecuaciones", exact: true }),
  ).toHaveAttribute("aria-valuenow", "95");
  const gaps = page.locator("section", {
    has: page.getByRole("heading", { name: "Lagunas de conocimiento" }),
  });
  await expect(gaps.getByText("Signos al despejar")).toBeVisible();
  await expect(gaps.getByText("2 veces")).toBeVisible();
  await expect(gaps.getByText("Factorización", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/usamos el orden de tu plan como aproximación/),
  ).toBeVisible();
  await expect(page.getByText("Se apoya en: Ecuaciones")).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/progreso-preparacion-escritorio-claro.png`,
    fullPage: true,
  });

  // Keyboard: arrow right moves selection and focus.
  await prep.focus();
  await page.keyboard.press("ArrowRight");
  const simulacros = page.getByRole("tab", { name: "Simulacros" });
  await expect(simulacros).toHaveAttribute("aria-selected", "true");
  await expect(simulacros).toBeFocused();
  await expect(
    page.getByRole("img", {
      name: /Notas de tus tests en orden: 90\s%, 60\s%/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Simulacro.*60\s%/ }),
  ).toHaveAttribute(
    "href",
    `/exams/${algebra}/sessions/77777777-7777-4777-8777-777777777772`,
  );
  await page.screenshot({
    path: `${SHOTS}/progreso-simulacros-escritorio-claro.png`,
    fullPage: true,
  });

  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Ritmo" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Temas por semana hasta el examen" }),
  ).toBeVisible();
  await expect(page.getByText("Esta semana").first()).toBeVisible();
  await expect(page.getByText("Temas: Ecuaciones").first()).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/progreso-ritmo-escritorio-claro.png`,
    fullPage: true,
  });

  // Changing the exam loads its own data.
  await picker.selectOption(history);
  await expect(page.getByRole("tab", { name: "Preparación" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  await expect(
    page.getByText("Completa 2 lecciones o tests más para ver tu previsión.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("Progreso: forecast stays locked with one activity", async ({ page }) => {
  await fixture(page, [
    {
      ...algebraExam,
      units: [
        unit(0, "Ecuaciones", "El lenguaje del álgebra", {
          status: "completed",
          completed_at: at(10, 14),
        }),
        unit(1, "Ecuaciones", "Ecuaciones de primer grado"),
      ],
      sessions: [],
    },
  ]);
  await page.goto("/progress");
  await expect(page.getByRole("combobox", { name: "Examen" })).toHaveCount(0);
  await expect(
    page.getByText(/Completa 1 lección o test más para ver tu previsión/),
  ).toBeVisible();
  await expect(page.getByText(/Aún no tienes tests corregidos/)).toBeVisible();
});

test("Progreso: mobile and dark layouts without horizontal scroll", async ({
  page,
}) => {
  await fixture(page, [historyExam, algebraExam]);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const name = scheme === "light" ? "claro" : "oscuro";
    await page.setViewportSize({ width: 360, height: 3400 });
    await page.goto("/progress");
    await expect(
      page.getByRole("progressbar", { name: "Preparación para el examen" }),
    ).toBeVisible();
    for (const [tab, slug] of [
      ["Preparación", "preparacion"],
      ["Simulacros", "simulacros"],
      ["Ritmo", "ritmo"],
    ] as const) {
      await page.getByRole("tab", { name: tab }).click();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `${SHOTS}/progreso-${slug}-movil-${name}.png`,
        fullPage: true,
      });
    }
    if (scheme === "dark") {
      await page.setViewportSize({ width: 1440, height: 2200 });
      await page.getByRole("tab", { name: "Preparación" }).click();
      await page.screenshot({
        path: `${SHOTS}/progreso-preparacion-escritorio-oscuro.png`,
        fullPage: true,
      });
      await page.getByRole("tab", { name: "Simulacros" }).click();
      await page.screenshot({
        path: `${SHOTS}/progreso-simulacros-escritorio-oscuro.png`,
        fullPage: true,
      });
      await page.getByRole("tab", { name: "Ritmo" }).click();
      await page.screenshot({
        path: `${SHOTS}/progreso-ritmo-escritorio-oscuro.png`,
        fullPage: true,
      });
    }
  }
});
