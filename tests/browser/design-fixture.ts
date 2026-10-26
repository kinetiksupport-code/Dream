import type { Page } from "@playwright/test";
import { ageOn, MIN_AGE, TERMS_VERSION } from "../../lib/consent";
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
  // Historial: older groups and a legacy «Nueva conversación».
  ["Fotosíntesis: fase luminosa", 9],
  ["Nueva conversación", 40],
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

/** Profile of a first sign-in once dream-api sends the welcome fields. */
export const CONSENT_PENDING = {
  ai_consent_at: null,
  terms_accepted_at: null,
  terms_version: null,
  age_band: null,
  nickname: null,
  interests: [],
  onboarding_completed: false,
  onboarding_step: 0,
};
/** Same student, already at a later step of the welcome (1 = name … 4 = age). */
export const atStep = (onboarding_step: number, extra: Record<string, unknown> = {}) => ({
  ...CONSENT_PENDING,
  onboarding_step,
  ...extra,
});
/** A student who finished the welcome and then withdrew the AI permission. */
export const CONSENT_WITHDRAWN = {
  ...CONSENT_PENDING,
  terms_accepted_at: "2026-10-20T10:00:00Z",
  terms_version: TERMS_VERSION,
  age_band: "14_17",
  nickname: "Alex",
  interests: ["Música"],
  onboarding_completed: true,
  onboarding_step: 6,
};

export async function mock(
  page: Page,
  opts: {
    pendingChat?: boolean;
    profile?: Record<string, unknown>;
    /** Extra top-level fields of the `profile` answer (e.g. `features`). */
    extra?: Record<string, unknown>;
  } = {},
) {
  let profile: Record<string, unknown> = {
    email: "alex@example.test",
    display_name: "Alex",
    ...opts.profile,
  };
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
    // Welcome contract designed in docs/CONSENTIMIENTO.md (not deployed yet).
    let allowed = true;
    if (b.action === "onboarding_save") {
      const fields = { ...b };
      delete fields.action;
      delete fields.step;
      profile = { ...profile, ...fields, ...(b.step === undefined ? {} : { onboarding_step: b.step }) };
    }
    if (b.action === "onboarding_age") {
      const age = ageOn(b.birth_date);
      allowed = age !== null && age >= MIN_AGE;
      if (!allowed)
        profile = { ...profile, ...CONSENT_PENDING, display_name: null };
    }
    if (b.action === "consent") {
      const age = b.birth_date ? ageOn(b.birth_date) : 16;
      profile = {
        ...profile,
        ai_consent_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
        terms_version: b.terms_version,
        age_band: age !== null && age >= 18 ? "18_plus" : "14_17",
        onboarding_completed: true,
        onboarding_step: 6,
      };
    }
    if (b.action === "consent_withdraw") profile = { ...profile, ai_consent_at: null };
    const data: Record<string, unknown> = {
      profile: { profile, service_ready: true, ...opts.extra },
      onboarding_age: { allowed },
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

/** Apuntes: three exams whose materials match the Claude Design canvas
 * (ready PDF, processing photo, unreadable PDF), or none for the empty state.
 * Registered after mock(), so it wins for the `exams` action only. */
export async function withNotes(page: Page, kind: "full" | "empty" = "full") {
  const material = (
    id: string,
    file_name: string,
    mime_type: string,
    status: string,
  ) => ({
    id,
    file_name,
    mime_type,
    size_bytes: 240 * 1024,
    status,
  });
  const exams =
    kind === "empty"
      ? []
      : [
          exam,
          {
            ...exam,
            id: "22222222-2222-4222-8222-222222222221",
            title: "Física · dinámica",
            subject: "Física",
            materials: [
              material(
                "77777777-7777-4777-8777-777777777771",
                "Fotos de la pizarra.jpg",
                "image/jpeg",
                "processing",
              ),
            ],
          },
          {
            ...exam,
            id: "22222222-2222-4222-8222-222222222222",
            title: "Historia · Tema 2",
            subject: "Historia",
            materials: [
              material(
                "77777777-7777-4777-8777-777777777772",
                "Historia · Tema 2.pdf",
                "application/pdf",
                "failed",
              ),
            ],
          },
        ];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    const data =
      body?.action === "exams"
        ? { exams }
        : body?.action === "exam_get"
          ? { exam: exams.find((e) => e.id === body.exam_id) ?? exam }
          : null;
    if (!data) return route.fallback();
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
  profile?: Record<string, unknown>;
};
const birth = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years, d.getMonth(), d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
export const SCREENS: Screen[] = [
  { name: "landing", path: "/", signedOut: true },
  { name: "login", path: "/login", signedOut: true },
  { name: "login-error", path: "/login?error=cancelled", signedOut: true },
  { name: "login-registro", path: "/chat", profile: CONSENT_PENDING },
  { name: "bienvenida-nombre", path: "/chat", profile: atStep(1) },
  {
    name: "bienvenida-nombre-error",
    path: "/chat",
    profile: atStep(1, { display_name: "" }),
    ready: async (p) => {
      await p.getByRole("button", { name: "Continuar" }).click();
      await p.waitForTimeout(250);
    },
  },
  {
    name: "bienvenida-gustos",
    path: "/chat",
    profile: atStep(2, { interests: ["Música", "Videojuegos", "Ajedrez"] }),
  },
  { name: "bienvenida-apodo", path: "/chat", profile: atStep(3, { display_name: "Alejandro" }) },
  {
    name: "bienvenida-edad",
    path: "/chat",
    profile: atStep(4),
    ready: async (p) => {
      await p.getByRole("slider", { name: "Año" }).focus();
      await p.keyboard.press("ArrowUp");
      await p.waitForTimeout(300);
    },
  },
  {
    name: "bienvenida-ia",
    path: "/chat",
    profile: atStep(4),
    ready: async (p) => {
      await p.getByRole("button", { name: "Escribir la fecha" }).click();
      await p.getByLabel("Fecha de nacimiento").fill(birth(16));
      await p.getByRole("button", { name: "Continuar" }).click();
      await p.getByRole("heading", { name: /Vas a hablar con una IA/ }).waitFor();
    },
  },
  {
    name: "bienvenida-ia-error",
    path: "/chat",
    profile: CONSENT_WITHDRAWN,
    ready: async (p) => {
      await p.getByRole("button", { name: "Aceptar y seguir" }).click();
      await p.waitForTimeout(250);
    },
  },
  {
    name: "bienvenida-listo",
    path: "/chat",
    profile: CONSENT_WITHDRAWN,
    ready: async (p) => {
      await p.getByRole("checkbox", { name: /proveedores de IA/ }).check();
      await p.getByRole("checkbox", { name: /He leído y acepto/ }).check();
      await p.getByRole("button", { name: "Aceptar y seguir" }).click();
      await p.getByRole("heading", { name: /Listo/ }).waitFor();
      await p.waitForTimeout(500);
    },
  },
  {
    name: "bienvenida-menor",
    path: "/chat",
    profile: atStep(4),
    ready: async (p) => {
      await p.getByRole("button", { name: "Escribir la fecha" }).click();
      await p.getByLabel("Fecha de nacimiento").fill(birth(12));
      await p.getByRole("button", { name: "Continuar" }).click();
      await p.getByRole("heading", { name: /mayores de 14/ }).waitFor();
    },
  },
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
  {
    name: "apuntes",
    path: "/notes",
    ready: async (p) => {
      await withNotes(p);
      await p.reload();
      await p.getByText("Fotos de la pizarra").waitFor();
    },
  },
  { name: "examenes", path: "/exams" },
  { name: "examen", path: `/exams/${eid}` },
  { name: "historial", path: "/chat?view=recent" },
  { name: "ajustes", path: "/settings" },
  { name: "mas", path: "/more" },
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
