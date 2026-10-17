import { test, expect, type Page } from "@playwright/test";
// Isolated contract fixtures: never used by the application or service worker.
const cid = "12345678-1234-1234-1234-123456789abc";
const eid = "52345678-1234-1234-1234-123456789abc";
const shots = process.env.DREAM_SHOTS_DIR;

function isoInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Body = Record<string, unknown>;

async function setup(
  page: Page,
  {
    withPlan = true,
    status = "ready",
  }: { withPlan?: boolean; status?: string } = {},
) {
  const chats: Body[] = [];
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
  const exam = {
    id: eid,
    title: "Parcial de matemáticas",
    subject: "Matemáticas",
    exam_date: isoInDays(5),
    topics: ["Fracciones"],
    difficulties: "",
    goal: "",
    daily_minutes: 20,
    status,
    conversation_id: null,
    plan_error: null,
    units: [
      {
        id: "u1",
        position: 0,
        title: "Números enteros",
        topic: "Enteros",
        summary: "",
        estimated_minutes: 20,
        status: "completed",
        conversation_id: null,
        completed_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "u2",
        position: 1,
        title: "Fracciones y decimales",
        topic: "Fracciones",
        summary: "",
        estimated_minutes: 20,
        status: "pending",
        conversation_id: null,
      },
    ],
    materials: [],
    sessions: [],
  };
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON() as Body;
    let data: unknown = { ok: true };
    switch (body.action) {
      case "profile":
        data = {
          profile: { email: "qa@example.test", display_name: "Alex" },
          service_ready: true,
        };
        break;
      case "conversations":
        data = { items: [] };
        break;
      case "exams":
        data = { exams: withPlan ? [exam] : [], next_offset: null };
        break;
      case "exam_get":
        data = { exam };
        break;
      case "conversation_create":
        data = {
          conversation: {
            id: cid,
            title: "Nueva conversación",
            updated_at: new Date().toISOString(),
          },
        };
        break;
      case "messages":
        data = { items: [] };
        break;
      case "chat":
        chats.push(body);
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: '{"type":"delta","text":"¿Qué parte te cuesta más?"}\n{"type":"complete"}\n',
        });
        return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return chats;
}

test("greeting uses the topic of the day and falls back to a neutral one", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", {
      name: "Hoy toca Fracciones y decimales. ¿Qué quieres repasar?",
    }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await setup(page, { withPlan: false });
  await page.goto("/chat?new=1");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
});

test("a shortcut sends the chat action with its text and shortcut id", async ({
  page,
}) => {
  const chats = await setup(page);
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: /Hoy toca/ })).toBeVisible();
  const shortcuts = page.getByRole("group", { name: "Atajos" });
  await shortcuts
    .getByRole("button", { name: "Encuentra mis puntos débiles" })
    .click();
  await expect(page.getByText("¿Qué parte te cuesta más?")).toBeVisible();
  expect(chats).toHaveLength(1);
  expect(chats[0]).toMatchObject({
    action: "chat",
    conversation_id: cid,
    prompt: "Encuentra mis puntos débiles",
    shortcut: "weak_points",
    attachment_ids: [],
  });
  // The student's visible message is the button text.
  await expect(
    page.locator(".message-thread").getByText("Encuentra mis puntos débiles"),
  ).toBeVisible();
});

test("review shortcut names the last lesson known to the client", async ({
  page,
}) => {
  const chats = await setup(page);
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: /Hoy toca/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Repasa mi último test o lección" })
    .click();
  await expect.poll(() => chats.length).toBe(1);
  expect(chats[0]).toMatchObject({
    prompt: "Repasa mi último test o lección: Números enteros",
    shortcut: "review_last",
  });
});

test("«Más» opens the modes with the keyboard and sends the mode with the draft", async ({
  page,
}) => {
  const chats = await setup(page);
  await page.goto("/chat");
  const more = page.getByRole("button", { name: "Más" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Explícamelo como si tuviera 5 años" }),
  ).toBeHidden();
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const modes = page.getByRole("group", { name: "Modos de estudio" });
  for (const label of [
    "Enséñame",
    "Explícamelo como si tuviera 5 años",
    "Destaca los conceptos clave",
    "Relaciona los conceptos",
    "Detecta mis puntos débiles",
    "Pon a prueba si lo entiendo de verdad",
  ])
    await expect(modes.getByRole("button", { name: label })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(modes.getByRole("button", { name: "Enséñame" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();
  if (shots) {
    for (const [name, size] of [
      ["movil", { width: 360, height: 780 }],
      ["escritorio", { width: 1280, height: 800 }],
    ] as const)
      for (const scheme of ["light", "dark"] as const) {
        await page.setViewportSize(size);
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.reload();
        await expect(
          page.getByRole("heading", { name: /Hoy toca/ }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Más" }).click();
        await page.screenshot({
          path: `${shots}/chat-atajos-${name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
          fullPage: true,
        });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
        // The last mode is reachable by scrolling, above the tab bar.
        const last = page.getByRole("button", {
          name: "Pon a prueba si lo entiendo de verdad",
        });
        await page.locator("#main").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await expect(last).toBeInViewport({ ratio: 1 });
        // Not hidden under the mobile tab bar.
        const [lastBottom, barTop] = await Promise.all([
          last.evaluate((el) => el.getBoundingClientRect().bottom),
          page.evaluate(() => {
            const bar = document.querySelector(".tabbar");
            const rect = bar?.getBoundingClientRect();
            return rect && rect.height > 0 ? rect.top : Infinity;
          }),
        ]);
        expect(lastBottom).toBeLessThanOrEqual(barTop);
        await page.screenshot({
          path: `${shots}/chat-atajos-${name}-${scheme === "light" ? "claro" : "oscuro"}-modos.png`,
        });
        await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
        await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
        await page.getByRole("button", { name: "Más" }).click();
      }
  }
  await page.getByRole("button", { name: "Más" }).click();
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("la fotosíntesis");
  await page
    .getByRole("button", { name: "Explícamelo como si tuviera 5 años" })
    .click();
  await expect.poll(() => chats.length).toBe(1);
  expect(chats[0]).toMatchObject({
    prompt: "Explícamelo como si tuviera 5 años: la fotosíntesis",
    shortcut: "eli5",
  });
});

test("exam date shortcut opens the editable exam instead of spending AI", async ({
  page,
}) => {
  const chats = await setup(page, { status: "draft" });
  await page.goto("/chat");
  const link = page.getByRole("link", {
    name: "La fecha de mi examen ha cambiado",
  });
  await expect(link).toHaveAttribute("href", `/exams/new?id=${eid}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/exams/new\\?id=${eid}`));
  expect(chats).toHaveLength(0);
});
