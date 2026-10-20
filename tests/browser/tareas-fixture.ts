import type { Page } from "@playwright/test";
import { mock } from "./design-fixture";
// Tareas fixture: one exam whose units are the tasks, plus a log of the
// dream-api calls. Confined to tests.

export const eid = "11111111-1111-4111-8111-111111111111";
export const LONG =
  "Repaso completo de ecuaciones de segundo grado con discriminante negativo y problemas de aplicación";
export const unit = (i: number, title: string, status = "pending") => ({
  id: `77777777-7777-4777-8777-77777777777${i}`,
  position: i,
  title,
  topic: "Ecuaciones",
  summary: "",
  estimated_minutes: 12,
  status,
  conversation_id: null,
});
const exam = (units: unknown[]) => ({
  id: eid,
  title: "Álgebra",
  subject: "Matemáticas aplicadas a las ciencias sociales",
  exam_date: "2026-11-27",
  topics: [],
  difficulties: "",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: null,
  plan_error: null,
  materials: [],
  sessions: [],
  units,
});

/** Same mock as the design fixture, with this screen's exam and a call log. */
export async function open(
  page: Page,
  units: unknown[],
  opts: { hold?: boolean; failSave?: boolean } = {},
) {
  await mock(page);
  const calls: Record<string, unknown>[] = [];
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === "exams" || body.action === "exam_get") {
      if (opts.hold) await held;
      const e = exam(units);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          body.action === "exams" ? { exams: [e] } : { exam: e },
        ),
      });
    }
    if (body.action === "exam_unit_complete" && opts.failSave)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fallo de prueba." }),
      });
    if (body.action === "exam_unit_complete")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exam: exam(units) }),
      });
    return route.fallback();
  });
  await page.goto("/tasks");
  return { calls, release };
}

export const sample = [
  unit(0, LONG),
  unit(1, "Factorización"),
  unit(2, "Signos y soluciones"),
  unit(3, "El lenguaje del álgebra", "completed"),
];
