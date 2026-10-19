import { test, expect, type Page } from "@playwright/test";
// Isolated contract fixtures for the AI modes: never used by the application.
const cid = "12345678-1234-1234-1234-123456789abc";
const MIN = 60_000;

type Usage = {
  modes: { id: string; percent: number; blocked: boolean }[];
  endsInMs?: number;
};
type ChatReply = { status: number; body: string; contentType?: string };

function usageBody(u: Usage) {
  const ends = u.endsInMs
    ? new Date(Date.now() + u.endsInMs).toISOString()
    : null;
  return {
    window: ends
      ? { started_at: new Date(Date.now() - MIN).toISOString(), ends_at: ends }
      : null,
    modes: u.modes.map((m) => ({ ...m, label: "x", resets_at: ends })),
    default_mode: "normal",
  };
}

async function signedIn(page: Page, usage: Usage[], replies: ChatReply[] = []) {
  const chats: Record<string, unknown>[] = [];
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
    const body = route.request().postDataJSON();
    if (body.action === "chat") {
      chats.push(body);
      const reply = replies.shift() ?? {
        status: 200,
        contentType: "application/x-ndjson",
        body: '{"type":"delta","text":"Una pista para empezar."}\n{"type":"complete"}\n',
      };
      await route.fulfill({
        status: reply.status,
        contentType: reply.contentType ?? "application/json",
        body: reply.body,
      });
      return;
    }
    const data =
      body.action === "ai_usage"
        ? usageBody(usage.length > 1 ? usage.shift()! : usage[0])
        : body.action === "profile"
          ? {
              profile: { email: "qa@example.test", display_name: "Alex" },
              service_ready: true,
            }
          : body.action === "conversation_create"
            ? {
                conversation: {
                  id: cid,
                  title: "Nueva conversación",
                  updated_at: "2026-10-16T00:00:00Z",
                },
              }
            : body.action === "conversations" || body.action === "messages"
              ? { items: [] }
              : { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return chats;
}

const fresh: Usage = {
  modes: [
    { id: "fast", percent: 0, blocked: false },
    { id: "normal", percent: 0, blocked: false },
  ],
};

test("the chat offers modes, never model names, Normal by default, and sends the chosen one", async ({
  page,
}) => {
  const chats = await signedIn(page, [fresh]);
  await page.goto("/chat");
  const picker = page.getByRole("group", { name: "Modo de respuesta" });
  await expect(picker.getByRole("radio")).toHaveCount(2);
  await expect(picker.getByRole("radio", { name: /Normal/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Pensar más/ })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /llama|qwen|mistral|groq|cloudflare/i,
  );
  // Keyboard: arrows move between modes.
  await picker.getByRole("radio", { name: /Normal/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(picker.getByRole("radio", { name: /Rápido/ })).toBeChecked();
  const box = page.locator(".composer textarea");
  await box.fill("¿Qué es una derivada?");
  await box.press("Enter");
  await expect(page.getByText("Una pista para empezar.")).toBeVisible();
  expect(chats[0].mode).toBe("fast");
  // The choice is remembered on this device.
  await page.reload();
  await expect(page.getByRole("radio", { name: /Rápido/ })).toBeChecked();
});

test("«Pensar más» appears only when the server offers it", async ({
  page,
}) => {
  await signedIn(page, [
    {
      modes: [...fresh.modes, { id: "think", percent: 0, blocked: false }],
    },
  ]);
  await page.goto("/chat");
  await expect(page.getByRole("radio", { name: /Pensar más/ })).toBeVisible();
});

test("without Cloudflare the server leaves «Pensar más» out and a remembered choice goes back to Normal", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("dream-ai-mode", "think"));
  const chats = await signedIn(page, [fresh]);
  await page.goto("/chat");
  const picker = page.getByRole("group", { name: "Modo de respuesta" });
  await expect(picker.getByRole("radio")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: /Pensar más/ })).toHaveCount(0);
  await expect(picker.getByRole("radio", { name: /Normal/ })).toBeChecked();
  const box = page.locator(".composer textarea");
  await box.fill("¿Qué es una derivada?");
  await box.press("Enter");
  await expect(page.getByText("Una pista para empezar.")).toBeVisible();
  expect(chats[0].mode).toBe("normal");
});

test("if «Pensar más» stops being available mid-session, the chat says so, keeps the text and drops the option", async ({
  page,
}) => {
  const withThink: Usage = {
    modes: [...fresh.modes, { id: "think", percent: 0, blocked: false }],
  };
  const chats = await signedIn(
    page,
    [withThink, fresh],
    [
      {
        status: 400,
        body: JSON.stringify({
          error: "Ese modo no está disponible ahora. Elige otro.",
          code: "mode_unavailable",
        }),
      },
    ],
  );
  await page.goto("/chat");
  await page.getByRole("radio", { name: /Pensar más/ }).check();
  const box = page.locator(".composer textarea");
  await box.fill("Explícame la regla de la cadena");
  await box.press("Enter");
  await expect(
    page.getByText("Ese modo no está disponible ahora. Elige otro."),
  ).toBeVisible();
  expect(chats[0].mode).toBe("think");
  await expect(box).toHaveValue("Explícame la regla de la cadena");
  await expect(page.getByRole("radio", { name: /Pensar más/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Normal/ })).toBeChecked();
});

test("Ajustes shows one bar per mode with percentages and when it resets", async ({
  page,
}) => {
  await signedIn(page, [
    {
      modes: [
        { id: "fast", percent: 10, blocked: false },
        { id: "normal", percent: 63, blocked: false },
      ],
      endsInMs: 2 * 60 * MIN + 9 * MIN + 30_000,
    },
  ]);
  await page.goto("/settings");
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Límite de uso" }),
  });
  await expect(section.getByText("Normal: 63 % usado")).toBeVisible();
  const bar = section.getByRole("progressbar", { name: "Normal: 63 % usado" });
  await expect(bar).toHaveAttribute("aria-valuenow", "63");
  await expect(bar).toHaveAttribute("aria-valuemin", "0");
  await expect(bar).toHaveAttribute("aria-valuemax", "100");
  await expect(
    section.getByRole("progressbar", { name: "Rápido: 10 % usado" }),
  ).toHaveAttribute("aria-valuenow", "10");
  await expect(section.getByText("Se reinicia en 2 h 10 min.")).toBeVisible();
  await expect(section).not.toContainText(/token/i);
});

test("without a window every mode is at 0 %", async ({ page }) => {
  await signedIn(page, [fresh]);
  await page.goto("/settings");
  await expect(page.getByText("Normal: 0 % usado")).toBeVisible();
  await expect(
    page.getByText("Aún no has empezado una ventana de uso."),
  ).toBeVisible();
});

test("past 80 % the chat shows a discreet notice and still sends", async ({
  page,
}) => {
  const chats = await signedIn(page, [
    {
      modes: [
        { id: "fast", percent: 0, blocked: false },
        { id: "normal", percent: 85, blocked: false },
      ],
      endsInMs: 70 * MIN,
    },
  ]);
  await page.goto("/chat");
  const notice = page
    .getByRole("status")
    .filter({ hasText: "Has usado el 85 % del modo Normal" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Se reinicia en 1 h 10 min");
  const box = page.locator(".composer textarea");
  await box.fill("Sigue");
  await box.press("Enter");
  await expect(page.getByText("Una pista para empezar.")).toBeVisible();
  expect(chats).toHaveLength(1);
});

test("at 100 % the chat says when it resets and offers a mode with budget left", async ({
  page,
}) => {
  const spent: Usage = {
    modes: [
      { id: "fast", percent: 20, blocked: false },
      { id: "normal", percent: 100, blocked: true },
    ],
    endsInMs: 90 * MIN,
  };
  const chats = await signedIn(
    page,
    [fresh, spent],
    [
      {
        status: 429,
        body: JSON.stringify({
          error: "límite",
          code: "dream_mode_limit",
          retry_after: 5400,
        }),
      },
    ],
  );
  await page.goto("/chat");
  const box = page.locator(".composer textarea");
  await box.fill("Ayúdame con este ejercicio");
  await box.press("Enter");
  const banner = page.locator(".chat-limit");
  await expect(banner).toContainText("Has usado todo el modo Normal por ahora");
  await expect(banner).toContainText("Vuelve a estar disponible a las");
  // Not queued and nothing lost.
  await page.waitForTimeout(500);
  expect(chats).toHaveLength(1);
  await expect(box).toHaveValue("Ayúdame con este ejercicio");
  await banner.getByRole("button", { name: "Cambiar a Rápido" }).click();
  await expect(page.getByRole("radio", { name: /Rápido/ })).toBeChecked();
  await expect(banner).toHaveCount(0);
  await box.press("Enter");
  await expect(page.getByText("Una pista para empezar.")).toBeVisible();
  expect(chats[1].mode).toBe("fast");
});
