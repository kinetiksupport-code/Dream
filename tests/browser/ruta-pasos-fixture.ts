// Fixture de la ruta rediseñada (docs/diseno/ruta-pasos). Datos de ejemplo
// SOLO para las pruebas de navegador: la API está simulada y el reloj fijo.
import type { Page } from "@playwright/test";
import type { DreamExam, ExamSession } from "../../lib/exam-plans";
import type { DreamTest } from "../../lib/types";

export const eid = "11111111-1111-4111-8111-111111111111";
export const cid = "33333333-3333-4333-8333-333333333333";
export const tid = "44444444-4444-4444-8444-444444444444";
export const sid = "77777777-7777-4777-8777-777777777700";
export const NOW = new Date("2026-10-16T10:00:00");
const uid = (i: number) => `55555555-5555-4555-8555-5555555555${String(i).padStart(2, "0")}`;
const titles = [
  ["Caída de Roma y reinos germánicos", "Reinos germánicos"],
  ["El Imperio bizantino", "Bizancio"],
  ["Al-Ándalus: del emirato al califato", "Al-Ándalus"],
  ["Etapas históricas y Constantinopla", "Bizancio"],
  ["Los reinos cristianos", "Reinos cristianos"],
  ["El feudalismo", "Feudalismo"],
  ["Las ciudades medievales", "Ciudades"],
  ["La Iglesia y el arte románico", "Arte"],
  ["El gótico", "Arte"],
  ["La crisis del siglo XIV", "Crisis"],
] as const;

export function exam(done = 3): DreamExam {
  return {
    id: eid,
    title: "Examen de la Edad Media",
    subject: "Historia",
    exam_date: "2026-10-30",
    topics: ["Edad Media"],
    difficulties: "Las fechas",
    goal: "Sacar buena nota",
    daily_minutes: 30,
    status: "ready",
    conversation_id: cid,
    plan_error: null,
    materials: [],
    sessions: [
      {
        id: "77777777-7777-4777-8777-777777777771",
        mode: "practice",
        status: "completed",
        started_at: "2026-10-14T10:00:00Z",
        submitted_at: "2026-10-14T10:20:00Z",
        unit_id: uid(0),
        percentage: 85,
      },
    ],
    units: titles.map(([title, topic], i) => ({
      id: uid(i),
      position: i,
      title,
      topic,
      summary: "Las causas, los protagonistas y lo que cambió después.",
      estimated_minutes: 15,
      status: i < done ? "completed" : i === done ? "in_progress" : "pending",
      conversation_id: i <= done ? cid : null,
    })),
  } as DreamExam;
}

export const questions: DreamTest["questions"] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i + 1}`,
  position: i,
  type: "multiple_choice" as const,
  prompt:
    i === 2
      ? "¿Qué emperador mandó construir Santa Sofía en Constantinopla?"
      : `Pregunta ${i + 1} sobre la Edad Media: ¿cuál de estas afirmaciones es correcta?`,
  options: ["Justiniano", "Constantino", "Carlomagno", "Teodosio"],
}));

export function session(mode: "practice" | "exam" = "exam"): ExamSession {
  return {
    id: sid,
    exam_id: eid,
    test_id: tid,
    mode,
    status: "active",
    answers: { q1: "Justiniano", q2: "Constantino" },
    question_index: 2,
    revision: 1,
    started_at: "2026-10-16T09:50:00Z",
    submitted_at: null,
    time_limit_seconds: mode === "exam" ? 1800 : null,
    result: null,
    unit_id: null,
  } as ExamSession;
}

type Handler = (body: Record<string, unknown>) => unknown;
export async function routeFixture(
  page: Page,
  { data = exam(), handlers = {} }: { data?: DreamExam; handlers?: Record<string, Handler> } = {},
) {
  await page.clock.setFixedTime(NOW);
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
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b);
    let response: unknown;
    if (handlers[b.action]) response = handlers[b.action](b);
    else
      switch (b.action) {
        case "profile":
          response = { profile: { email: "qa@example.test", display_name: "Alex" }, service_ready: true };
          break;
        case "conversations":
        case "messages":
          response = { items: [] };
          break;
        case "exams":
          response = { exams: [data], next_offset: null };
          break;
        case "exam_get":
          response = { exam: data };
          break;
        case "exam_session_get":
          response = { session: session() };
          break;
        case "exam_session_save":
          response = { session: { ...session(), revision: (b.revision as number) + 1 } };
          break;
        case "test_get":
          response = {
            test: { id: tid, title: "Edad Media", subject: "Historia", topic: "Edad Media", status: "ready", mode: "exam", difficulty: "intermedio", questions },
          };
          break;
        case "exam_unit_start":
          response = { unit: { ...data.units.find((u) => u.id === b.unit_id), status: "in_progress", conversation_id: cid } };
          break;
        default:
          response = {};
      }
    await route.fulfill({ json: response });
  });
  return calls;
}
