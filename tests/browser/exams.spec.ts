import { test, expect, type Page } from "@playwright/test";
import type { DreamExam, ExamSession } from "../../lib/exam-plans";
import type { DreamTest, TestResult } from "../../lib/types";
test.use({ serviceWorkers: "block" });
// Returning visitor: the first-visit storage notice was already closed
// (covered by legal.spec.ts), so it never covers the controls under test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dream-storage-notice-v1", "1");
  });
});
// Contract fixtures are confined to tests. They do not certify live OAuth or AI.
const eid = "11111111-1111-4111-8111-111111111111";
const cid = "33333333-3333-4333-8333-333333333333";
const tid = "44444444-4444-4444-8444-444444444444";
const readyExam: DreamExam = {
  id: eid,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: "2026-10-20",
  topics: ["Ecuaciones", "Factorización", "Signos", "Soluciones"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: cid,
  plan_error: null,
  materials: [
    {
      id: cid,
      file_name: "Ecuaciones.pdf",
      mime_type: "application/pdf",
      size_bytes: 248 * 1024,
      status: "processed",
    },
  ],
  sessions: [],
  units: Array.from({ length: 5 }, (_, i) => ({
    id: `55555555-5555-4555-8555-55555555555${i}`,
    position: i,
    title: [
      "El lenguaje del álgebra",
      "Ecuaciones de primer grado",
      "Signos y soluciones",
      "Factorización",
      "Practica y conecta",
    ][i],
    topic: "Ecuaciones",
    summary: "Comprende la idea, busca un ejemplo y comprueba tu razonamiento.",
    estimated_minutes: 12,
    status: i < 2 ? "completed" : i === 2 ? "in_progress" : "pending",
    conversation_id: cid,
  })),
};
const questions: DreamTest["questions"] = [
  {
    id: "q1",
    position: 0,
    type: "multiple_choice",
    prompt: "¿Cuáles son las soluciones de esta ecuación?\n\n\\[x^2-5x+6=0\\]",
    options: [
      "x = −2 o x = −3",
      "x = 2 o x = 3",
      "x = 1 o x = 6",
      "x = 5 o x = 6",
    ],
  },
  {
    id: "q2",
    position: 1,
    type: "short_answer",
    prompt: "¿Por qué igualamos cada factor a cero?",
    options: [],
  },
  {
    id: "q3",
    position: 2,
    type: "math",
    prompt: "Resuelve y comprueba.\n\n\\[x^2-7x+12=0\\]",
    options: [],
  },
];
async function fixture(page: Page, seed = true) {
  const state: {
    exams: DreamExam[];
    sessions: Record<string, ExamSession>;
    calls: string[];
    bodies: Record<string, unknown>[];
  } = {
    exams: seed ? [structuredClone(readyExam)] : [],
    sessions: {},
    calls: [],
    bodies: [],
  };
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("signed-out-fixture"))
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
    expect(route.request().headers()["authorization"]).toBe(
      "Bearer qa-contract-fixture",
    );
    state.calls.push(b.action);
    state.bodies.push(b);
    let response: unknown = {};
    const exam = state.exams.find((e) => e.id === b.exam_id);
    switch (b.action) {
      case "profile":
        response = {
          profile: {
            email: "qa@example.test",
            display_name: "Alex",
          },
          service_ready: true,
        };
        break;
      case "conversations":
        response = { items: [] };
        break;
      case "exams":
        response = { exams: state.exams };
        break;
      case "exam_create": {
        const e = {
          ...structuredClone(readyExam),
          ...b,
          id: b.exam_id,
          status: "draft",
          units: [],
          materials: [],
          sessions: [],
        } as DreamExam;
        state.exams.push(e);
        response = { exam: e };
        break;
      }
      case "exam_update":
        Object.assign(exam!, b);
        response = { exam };
        break;
      case "exam_get":
        response = { exam };
        break;
      case "exam_prepare":
        Object.assign(exam!, {
          status: "ready",
          units: structuredClone(readyExam.units),
        });
        response = { exam };
        break;
      case "exam_unit_start":
        response = { unit: exam!.units.find((u) => u.id === b.unit_id) };
        break;
      case "exam_unit_complete":
        exam!.units.find((u) => u.id === b.unit_id)!.status = "completed";
        response = { exam };
        break;
      case "exam_upload_start":
        response = { conversation_id: cid };
        break;
      case "attachment_upload":
        response = { attachment: { id: cid, status: "processed" } };
        break;
      case "exam_material_add":
        exam!.materials = structuredClone(readyExam.materials);
        response = { exam };
        break;
      case "exam_rhythm":
        exam!.daily_minutes = b.daily_minutes;
        response = { exam };
        break;
      case "messages":
        response = { items: [] };
        break;
      case "chat":
        await route.fulfill({
          contentType: "application/x-ndjson",
          body: '{"type":"delta","text":"Factorizar transforma una suma en un producto.\\n\\n\\\\[x^2-5x+6=(x-2)(x-3)\\\\]"}\n{"type":"complete"}\n',
        });
        return;
      case "exam_session_create": {
        const session: ExamSession = {
          id: b.session_id,
          exam_id: b.exam_id,
          test_id: tid,
          mode: b.mode,
          status: "active",
          answers: {},
          question_index: 0,
          revision: 0,
          started_at: new Date().toISOString(),
          submitted_at: null,
          time_limit_seconds: b.time_limit_seconds,
          result: null,
        };
        state.sessions[session.id] = session;
        exam!.sessions.push(session);
        response = { session };
        break;
      }
      case "exam_session_get":
        response = { session: state.sessions[b.session_id] };
        break;
      case "test_get":
        response = {
          test: {
            id: tid,
            title: "Álgebra",
            subject: "Matemáticas",
            topic: "Álgebra",
            status: "ready",
            mode:
              Object.values(state.sessions).find((s) => s.test_id === tid)
                ?.mode || "exam",
            difficulty: "intermedio",
            questions,
          },
        };
        break;
      case "exam_session_save": {
        const s = state.sessions[b.session_id];
        expect(b.revision).toBe(s.revision);
        s.answers = b.answers;
        s.question_index = b.question_index;
        s.revision++;
        response = { session: s };
        break;
      }
      case "test_check_answer":
        response = {
          evaluation: {
            is_correct: true,
            correct_answer: "x = 2 o x = 3",
            feedback:
              "Al igualar cada factor a cero, las soluciones son 2 y 3.",
          },
        };
        break;
      case "exam_session_submit": {
        const s = state.sessions[b.session_id];
        const result: TestResult = {
          attempt_id: tid,
          score: 2,
          total: 3,
          percentage: 67,
          mastered: ["Factorización"],
          practice: ["Signos"],
          items: questions.map((q, i) => ({
            question_id: q.id,
            prompt: q.prompt,
            answer: s.answers[q.id] || "",
            correct_answer:
              i === 0 ? "x = 2 o x = 3" : "Igualar cada factor a cero.",
            is_correct: i > 0,
            feedback:
              i === 0
                ? "Revisa los signos de cada factor."
                : "Has conectado la idea con la solución.",
          })),
        };
        s.status = "completed";
        s.result = result;
        s.submitted_at = new Date().toISOString();
        response = { session: s };
        break;
      }
      default:
        await route.fulfill({
          status: 400,
          json: { error: `Acción inesperada en fixture: ${b.action}` },
        });
        return;
    }
    await route.fulfill({ json: response });
  });
  return state;
}
test("create, persist, reopen, study, simulate, submit, reopen result and practice errors", async ({
  page,
}) => {
  test.setTimeout(90000);
  const state = await fixture(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/exams");
  await expect(
    page.getByRole("heading", { name: "Prepárate con calma." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Nuevo examen", exact: true })
    .first()
    .click();
  await page.getByLabel("Nombre del examen").fill("Álgebra · primer trimestre");
  await page.getByLabel("Asignatura", { exact: true }).fill("Matemáticas");
  await page.getByLabel("Fecha del examen").fill("2026-10-20");
  await page.getByRole("button", { name: "Siguiente: materiales" }).click();
  await page.getByLabel("Temas", { exact: true }).fill("Ecuaciones\nSignos");
  await page.getByLabel("¿Qué te cuesta más?").fill("Los signos");
  await page.getByRole("button", { name: "Revisar mi examen" }).click();
  await page.getByRole("button", { name: "Generar plan de estudio" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Álgebra · primer trimestre",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Álgebra · primer trimestre",
      exact: true,
    }),
  ).toBeVisible();
  const e = state.exams[0];
  await page.goto(`/exams/${e.id}/study/${e.units[2].id}`);
  await page.getByRole("button", { name: "Empezar a entender" }).click();
  await expect(page.locator(".message-thread .katex").first()).toBeVisible();
  const chatBody = state.bodies.find((b) => b.action === "chat");
  expect(chatBody?.exam_id).toBe(e.id);
  expect(chatBody?.unit_id).toBe(e.units[2].id);
  await page.goto(`/exams/${e.id}`);
  await page.getByRole("button", { name: "Empezar simulacro" }).click();
  await page.getByRole("radio").first().check();
  await page.screenshot({ path: "/tmp/dream-exam-qa/question-choice-390.png" });
  await page.getByRole("button", { name: "Guardar y siguiente" }).click();
  await page
    .getByLabel("Tu respuesta", { exact: true })
    .fill("El producto es cero si un factor es cero.");
  await page.screenshot({ path: "/tmp/dream-exam-qa/question-open-390.png" });
  await page.getByRole("button", { name: "Guardar y siguiente" }).click();
  await page
    .getByLabel("Escribe tu razonamiento")
    .fill("(x-3)(x-4)=0, x=3 o x=4.");
  await page.screenshot({ path: "/tmp/dream-exam-qa/question-math-390.png" });
  await page.getByRole("button", { name: "Revisar y entregar" }).click();
  expect(state.calls).not.toContain("test_check_answer");
  await expect(
    page.getByRole("button", { name: "Entregar simulacro" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/dream-exam-qa/confirm-390.png" });
  await page.getByRole("button", { name: "Entregar simulacro" }).click();
  await expect(
    page.getByRole("heading", { name: "Ya sabes por dónde seguir." }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/dream-exam-qa/result-390.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "/tmp/dream-exam-qa/result-1440.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const resultURL = page.url();
  await page.reload();
  await expect(
    page.getByText("Revisa los signos de cada factor."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Repasar mis errores" }).click();
  await expect(
    page.getByRole("heading", { name: "Una segunda mirada. Más claro." }),
  ).toBeVisible();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.getByText("Bien pensado.")).toBeVisible();
  await page.screenshot({ path: "/tmp/dream-exam-qa/practice-390.png" });
  await page.goto(resultURL);
  await expect(
    page.getByRole("heading", { name: "Ya sabes por dónde seguir." }),
  ).toBeVisible();
  // A fresh browser document with the same identity receives the persisted server fixture.
  await page.evaluate(() => {
    localStorage.removeItem("sb-cxaujyagtpsxvkwkdxbc-auth-token");
    sessionStorage.setItem("signed-out-fixture", "1");
  });
  await page.goto("/exams");
  await expect(page).toHaveURL(/login/);
  await page.evaluate(() => sessionStorage.removeItem("signed-out-fixture"));
  await page.goto("/exams");
  await expect(
    page.getByRole("heading", {
      name: "Álgebra · primer trimestre",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.calls.filter((a) => a === "exam_create")).toHaveLength(1);
  expect(state.calls.filter((a) => a === "exam_session_submit")).toHaveLength(
    1,
  );
});
test("autosave restores the answer and cursor on reload", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`/exams/${eid}`);
  await page.getByRole("button", { name: "Empezar simulacro" }).click();
  await page.getByRole("radio").nth(1).check();
  await expect(
    page.getByText("Respuestas guardadas", { exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(() => Object.values(state.sessions)[0]?.answers.q1)
    .toBe("x = 2 o x = 3");
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Guardar y siguiente" }).click();
  await page.reload();
  await expect(page.getByLabel("Tu respuesta", { exact: true })).toBeVisible();
});
test("responsive exam frames, dark mode and screenshots at every required width", async ({
  page,
}) => {
  test.setTimeout(120000);
  await fixture(page);
  await page.goto("/exams");
  await expect(
    page.getByRole("heading", { name: "Prepárate con calma." }),
  ).toBeVisible();
  for (const width of [375, 390, 393, 430, 768, 834, 1280, 1440, 1728]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1024 });
    await expect(
      page.getByRole("heading", { name: "Prepárate con calma." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          (document.querySelector(".workspace-main")?.scrollWidth ?? 0) <=
            (document.querySelector(".workspace-main")?.clientWidth ?? 0),
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/dream-exam-qa/index-${width}.png`,
      fullPage: true,
    });
  }
  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of [
      `/exams/${eid}`,
      `/exams/${eid}/plan`,
      `/exams/${eid}/study/${readyExam.units[2].id}`,
      "/exams/new",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= window.innerWidth &&
            (document.querySelector(".workspace-main")?.scrollWidth ?? 0) <=
              (document.querySelector(".workspace-main")?.clientWidth ?? 0),
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/dream-exam-qa/${route.endsWith("/new") ? "new" : route.includes("/study/") ? "study" : route.endsWith("/plan") ? "plan" : "detail"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    localStorage.setItem("dream-theme", "dark");
  });
  await page.goto("/exams");
  await expect(
    page.getByRole("heading", { name: "Prepárate con calma." }),
  ).toBeVisible();
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "/tmp/dream-exam-qa/index-dark-1440.png",
    fullPage: true,
  });
  expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
});
