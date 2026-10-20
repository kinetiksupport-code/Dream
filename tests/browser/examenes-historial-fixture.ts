import type { Page, Route } from "@playwright/test";
import { mock } from "./design-fixture";
// Exámenes (historial): contract fixtures for the list, its states and the
// card actions. Confined to tests; never used by the app.

export const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const unit = (i: number, status: string) => ({
  id: `55555555-5555-4555-8555-5555555555${String(i).padStart(2, "0")}`,
  status,
});
const base = {
  topics: ["Ecuaciones"],
  difficulties: "",
  goal: "",
  daily_minutes: 45,
  materials: [{ attachment_id: "66666666-6666-4666-8666-666666666666" }],
};
export const HISTORY = [
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111101",
    title: "Álgebra · primer trimestre",
    subject: "Matemáticas",
    exam_date: inDays(12),
    status: "ready",
    units: [unit(1, "completed"), unit(2, "completed"), unit(3, "in_progress"), unit(4, "pending")],
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111102",
    title: "Comentario de texto",
    subject: "Lengua y Literatura",
    exam_date: inDays(2),
    status: "preparing",
    units: [],
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111103",
    title: "",
    subject: "",
    exam_date: null,
    status: "draft",
    units: [],
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111104",
    title: "La célula",
    subject: "Biología",
    exam_date: inDays(25),
    status: "failed",
    units: [],
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111105",
    title: "Unidad 3 · Revolución industrial",
    subject: "Historia",
    exam_date: inDays(-6),
    status: "completed",
    units: [unit(5, "completed"), unit(6, "completed")],
  },
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111106",
    title: "Present perfect",
    subject: "Inglés",
    exam_date: inDays(-20),
    status: "ready",
    units: [unit(7, "completed"), unit(8, "pending"), unit(9, "pending")],
  },
];

export type HistoryOpts = {
  exams?: unknown[];
  delay?: number;
  fail?: boolean;
  calls?: { action: string; body: Record<string, unknown> }[];
  failDelete?: boolean;
};

export async function history(page: Page, o: HistoryOpts = {}) {
  await mock(page);
  let exams = (o.exams ?? HISTORY).map((e) => ({ ...(e as object) })) as {
    id: string;
    status: string;
  }[];
  await page.route("**/functions/v1/dream-api", async (route: Route) => {
    const b = route.request().postDataJSON();
    if (b.action !== "exams" && !String(b.action).startsWith("exam_"))
      return route.fallback();
    o.calls?.push({ action: b.action, body: b });
    if (b.action === "exams") {
      if (o.delay) await new Promise((r) => setTimeout(r, o.delay));
      if (o.fail)
        return route.fulfill({
          status: 503,
          json: { error: "No se pudo completar la operación." },
        });
      return route.fulfill({ json: { exams, next_offset: null } });
    }
    if (b.action === "exam_delete") {
      if (o.failDelete)
        return route.fulfill({
          status: 503,
          json: { error: "No se pudo borrar el examen." },
        });
      exams = exams.filter((e) => e.id !== b.exam_id);
      return route.fulfill({ json: { ok: true } });
    }
    if (b.action === "exam_complete") {
      exams = exams.map((e) =>
        e.id === b.exam_id ? { ...e, status: "completed" } : e,
      );
      return route.fulfill({
        json: { exam: exams.find((e) => e.id === b.exam_id) },
      });
    }
    return route.fallback();
  });
}
