import type { Page } from "@playwright/test";
// Contract fixtures for screenshots and design checks. Confined to tests:
// never used by the application or the service worker.
const eid = "11111111-1111-4111-8111-111111111111";
const cid = "33333333-3333-4333-8333-333333333333";
const tid = "44444444-4444-4444-8444-444444444444";
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const exam = {
  id: eid,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: inDays(12),
  topics: ["Ecuaciones", "Factorización"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: cid,
  plan_error: null,
  materials: [
    {
      id: cid,
      file_name: "Tema 4 · Ecuaciones.pdf",
      mime_type: "application/pdf",
      size_bytes: 248 * 1024,
      status: "processed",
    },
  ],
  sessions: [],
  units: [
    "El lenguaje del álgebra",
    "Ecuaciones de primer grado",
    "Signos y soluciones",
    "Factorización",
  ].map((title, i) => ({
    id: `55555555-5555-4555-8555-55555555555${i}`,
    position: i,
    title,
    topic: "Ecuaciones",
    summary: "Comprende la idea, busca un ejemplo y comprueba tu razonamiento.",
    estimated_minutes: 12,
    status: i < 1 ? "completed" : i === 1 ? "in_progress" : "pending",
    conversation_id: cid,
  })),
};
const quiz = {
  id: tid,
  title: "Ecuaciones de segundo grado",
  subject: "Matemáticas",
  topic: "Ecuaciones",
  mode: "practice",
  status: "ready",
  difficulty: "intermedio",
  questions: [
    {
      id: "q1",
      position: 0,
      type: "multiple_choice",
      prompt: "¿Qué dos números suman 5 y multiplicados dan 6?",
      options: ["1 y 5", "2 y 3", "1 y 6", "3 y 4"],
      metadata: {},
    },
    {
      id: "q2",
      position: 1,
      type: "short_answer",
      prompt: "¿Por qué igualamos cada factor a cero?",
      options: [],
      metadata: {},
    },
  ],
};
const conversations = [
  ["Ecuaciones de segundo grado", 0],
  ["Leyes de Newton", 0],
  ["Nueva conversación", 1],
  ["Comentario de texto: estructura", 1],
  ["Verbos irregulares en pasado", 3],
].map(([title, daysAgo], i) => ({
  // The first one is the open conversation, so the header shows its title.
  id: i === 0 ? cid : `88888888-8888-4888-8888-88888888888${i}`,
  title,
  updated_at: new Date(Date.now() - Number(daysAgo) * 86_400_000).toISOString(),
}));
const messages = [
  {
    id: "m1",
    role: "user",
    content: "No entiendo cómo resolver una ecuación de segundo grado.",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "Vamos paso a paso. Empecemos con un ejemplo sencillo:\n\n\\[x^2-5x+6=0\\]\n\nBusca dos números que **sumen 5** y que al multiplicarse den **6**. ¿Se te ocurren?",
  },
  { id: "m3", role: "user", content: "¿El 2 y el 3?" },
  {
    id: "m4",
    role: "assistant",
    content: `¡Eso es! Ahora practica un poco. <!--DREAM_WIDGET:{"type":"quiz","testId":"${tid}","title":"Ecuaciones de segundo grado","questionCount":2}-->`,
  },
];

export async function mock(page: Page, opts: { pendingChat?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("dream-storage-notice-v1", "1");
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
          email: "alex@example.test",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: { full_name: "Alex" },
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
  });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    if (b.action === "chat" && opts.pendingChat) return; // never answers: waiting state
    const data: Record<string, unknown> = {
      profile: {
        profile: { email: "alex@example.test", display_name: "Alex" },
        service_ready: true,
      },
      conversations: { items: conversations },
      messages: { items: messages, next_offset: null },
      exams: { exams: [exam] },
      exam_get: { exam },
      test_get: { test: quiz },
      test_check_answer: {
        evaluation: {
          is_correct: true,
          feedback:
            "Como 2 + 3 = 5 y 2 · 3 = 6, se factoriza como (x − 2)(x − 3) = 0.",
          correct_answer: "2 y 3",
        },
      },
      conversation_create: {
        conversation: {
          id: cid,
          title: "Nueva conversación",
          updated_at: new Date().toISOString(),
        },
      },
    }[b.action as string] ?? { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

export const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
] as const;
export const SCHEMES = ["light", "dark"] as const;

export type Screen = {
  name: string;
  path: string;
  ready?: (page: Page) => Promise<void>;
  pendingChat?: boolean;
  signedOut?: boolean;
};
export const SCREENS: Screen[] = [
  { name: "login", path: "/login", signedOut: true },
  { name: "inicio", path: "/chat" },
  {
    name: "chat",
    path: `/chat?c=${cid}`,
    ready: (p) => p.getByText("¿El 2 y el 3?").waitFor(),
  },
  {
    name: "chat-esperando",
    path: "/chat",
    pendingChat: true,
    ready: async (p) => {
      const box = p.getByRole("textbox", { name: "Mensaje para Dream" });
      await box.fill("Explícame las derivadas");
      await box.press("Enter");
      await p.waitForTimeout(2500);
    },
  },
  { name: "tareas", path: "/tasks" },
  { name: "apuntes", path: "/notes" },
  { name: "examenes", path: "/exams" },
  { name: "examen", path: `/exams/${eid}` },
  { name: "historial", path: "/chat?view=recent" },
  { name: "ajustes", path: "/settings" },
  {
    name: "test",
    path: `/tests/${tid}`,
    ready: async (p) => {
      await p.getByRole("radio").nth(1).check();
      const check = p.getByRole("button", { name: /Comprobar/ });
      if (await check.count()) await check.first().click();
      await p.waitForTimeout(400);
    },
  },
];
