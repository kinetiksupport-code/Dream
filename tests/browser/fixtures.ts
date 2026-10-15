import { expect, type Page } from "@playwright/test";
import type { DreamExam, ExamIndex } from "../../lib/exam-plans";
// Contract fixtures for browser tests only. The canvas sample content
// ("Tema 4 · Ecuaciones", subjects, dates…) lives here and nowhere else.

export const ids = {
  conversation: "12345678-1234-1234-1234-123456789abc",
  older: "12345678-1234-1234-1234-123456789abd",
  test: "22345678-1234-1234-1234-123456789abc",
  question: "32345678-1234-1234-1234-123456789abc",
  exam: "11111111-1111-4111-8111-111111111111",
};

export const profile = {
  email: "qa@example.test",
  display_name: "Alex",
  pref_step_by_step: true,
  pref_practice_suggestions: true,
  pref_calm_tone: true,
};

const today = new Date();
const iso = (offsetDays: number) =>
  new Date(today.getTime() - offsetDays * 86400000).toISOString();

export const conversations = [
  { id: ids.conversation, title: "Ecuaciones de segundo grado", updated_at: iso(0) },
  { id: ids.older, title: "Leyes de Newton", updated_at: iso(0) },
  {
    id: "12345678-1234-1234-1234-123456789abe",
    title: "Comentario de texto: estructura",
    updated_at: iso(1),
  },
  {
    id: "12345678-1234-1234-1234-123456789abf",
    title: "Verbos irregulares en pasado",
    updated_at: iso(1),
  },
];

export const messages = [
  {
    id: "m1",
    role: "user",
    content: "No entiendo cómo resolver una ecuación de segundo grado.",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "Vamos paso a paso. Empecemos con un ejemplo sencillo:\n\n$$\nx^2 - 5x + 6 = 0\n$$\n\nBusca dos números que **sumen 5** y que al multiplicarse den **6**. ¿Se te ocurren?",
  },
  { id: "m3", role: "user", content: "¿El 2 y el 3?" },
];

export const exam: DreamExam = {
  id: ids.exam,
  title: "Matemáticas · Tema 4",
  subject: "Matemáticas",
  exam_date: "2026-11-12",
  topics: ["Ecuaciones"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: ids.conversation,
  plan_error: null,
  materials: [
    {
      id: "a1111111-1111-4111-8111-111111111111",
      file_name: "Tema 4 · Ecuaciones",
      mime_type: "application/pdf",
      size_bytes: 248 * 1024,
      status: "processed",
    },
    {
      id: "a2222222-2222-4222-8222-222222222222",
      file_name: "Fotos de la pizarra",
      mime_type: "image/jpeg",
      size_bytes: 1024 * 1024,
      status: "processing",
    },
    {
      id: "a3333333-3333-4333-8333-333333333333",
      file_name: "Historia · Tema 2",
      mime_type: "application/pdf",
      size_bytes: 512 * 1024,
      status: "failed",
    },
  ],
  sessions: [],
  units: [
    ["Problemas de ecuaciones", "in_progress"],
    ["Comentario de texto", "pending"],
    ["Ejercicios de cinemática", "pending"],
    ["Redacción de inglés", "completed"],
  ].map(([title, status], i) => ({
    id: `55555555-5555-4555-8555-55555555555${i}`,
    position: i,
    title,
    topic: "Ecuaciones",
    summary: "Comprende la idea y comprueba tu razonamiento.",
    estimated_minutes: 15,
    status: status as "pending" | "in_progress" | "completed",
    conversation_id: ids.conversation,
  })),
};

export const examIndex: ExamIndex = {
  ...exam,
  units: exam.units.map(({ id, status }) => ({ id, status })),
  materials: exam.materials.map((m) => ({ attachment_id: m.id })),
};

export const practiceTest = {
  id: ids.test,
  title: "Ecuaciones de segundo grado",
  subject: "Matemáticas",
  topic: "Ecuaciones",
  mode: "practice",
  status: "ready",
  difficulty: "intermedio",
  questions: [1, 2, 3, 4, 5].map((n) => ({
    id: n === 2 ? ids.question : `3234567${n}-1234-1234-1234-123456789abc`,
    position: n - 1,
    type: "multiple_choice",
    prompt: "¿Qué dos números suman 5 y multiplicados dan 6?",
    options: ["1 y 5", "2 y 3", "1 y 6", "3 y 4"],
    metadata: {},
  })),
};

type Handler = (body: Record<string, unknown>) => unknown | undefined;

/** Signed-in session + dream-api contract mock. `overrides` win per action. */
export async function signIn(
  page: Page,
  overrides: Record<string, Handler> = {},
) {
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
          id: "42345678-1234-1234-1234-123456789abc",
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
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(request.headers()["authorization"]).toBe(
      "Bearer qa-contract-fixture",
    );
    const override = overrides[String(body.action)];
    const custom = override ? override(body) : undefined;
    if (custom !== undefined) return route.fulfill({ json: custom });
    let data: unknown = { ok: true };
    switch (body.action) {
      case "profile":
        data = { profile, service_ready: true };
        break;
      case "conversations":
        data = { items: conversations };
        break;
      case "messages":
        data = { items: messages };
        break;
      case "exams":
        data = { exams: [examIndex], next_offset: null };
        break;
      case "exam_get":
        data = { exam };
        break;
      case "test_get":
        data = { test: practiceTest };
        break;
      case "test_check_answer":
        data = {
          evaluation: {
            is_correct: true,
            feedback:
              "Como 2 + 3 = 5 y 2 · 3 = 6, la ecuación se factoriza como (x − 2)(x − 3) = 0.",
            correct_answer: "2 y 3",
          },
        };
        break;
    }
    await route.fulfill({ json: data });
  });
}
