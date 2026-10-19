import type { Page } from "@playwright/test";
import type { DreamExam, ExamSession, ExamUnit } from "../../lib/exam-plans";

// Contract fixtures for Progreso, confined to tests. Dates are relative to a
// fixed "today" (Thursday 15 October 2026) so every number is stable.
export const TODAY = new Date(2026, 9, 15, 12);
export const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month - 1, day, hour).toISOString();
export const algebra = "11111111-1111-4111-8111-111111111111";
export const history = "22222222-2222-4222-8222-222222222222";

export function unit(
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
export const algebraExam: DreamExam = {
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
export const historyExam: DreamExam = {
  ...algebraExam,
  id: history,
  title: "Historia · tema 3",
  subject: "Historia",
  exam_date: "2026-11-20",
  topics: ["Revolución francesa"],
  units: [unit(0, "Revolución francesa", "Causas")],
  sessions: [],
};
export function session(
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
export const sessions: Record<string, ExamSession> = {
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

export async function fixture(page: Page, exams: DreamExam[]) {
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

