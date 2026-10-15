import { test, expect, type Page } from "@playwright/test";
// Isolated contract fixtures for usage limits: never used by the application.
const cid = "12345678-1234-1234-1234-123456789abc";

type ChatReply = { status: number; body: string; contentType?: string };

async function signedIn(page: Page, replies: ChatReply[]) {
  const chats: unknown[] = [];
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
      const reply = replies.shift() ?? replies.at(-1)!;
      await route.fulfill({
        status: reply.status,
        contentType: reply.contentType ?? "application/json",
        body: reply.body,
      });
      return;
    }
    const data =
      body.action === "profile"
        ? {
            profile: { email: "qa@example.test", display_name: "Alex" },
            service_ready: true,
          }
        : body.action === "conversation_create"
          ? {
              conversation: {
                id: cid,
                title: "Nueva conversación",
                updated_at: "2026-10-15T00:00:00Z",
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

const answer: ChatReply = {
  status: 200,
  contentType: "application/x-ndjson",
  body: '{"type":"delta","text":"Respuesta tras la espera."}\n{"type":"complete"}\n',
};

async function ask(page: Page, text: string) {
  await page.goto("/chat");
  const box = page.locator(".composer textarea");
  await box.fill(text);
  await box.press("Enter");
}

test("a busy minute waits in line, shows the position and resends the same message once", async ({
  page,
}) => {
  const chats = await signedIn(page, [
    {
      status: 429,
      body: JSON.stringify({
        error: "límite",
        code: "dream_queue",
        retry_after: 2,
        position: 3,
      }),
    },
    answer,
  ]);
  await ask(page, "¿Qué es una derivada?");
  await expect(
    page.getByRole("status").filter({ hasText: "Eres el 3º en la cola" }),
  ).toBeVisible();
  await expect(page.getByText("Respuesta tras la espera.")).toBeVisible({
    timeout: 10000,
  });
  expect(chats).toHaveLength(2);
  expect(chats.map((c) => (c as { prompt: string }).prompt)).toEqual([
    "¿Qué es una derivada?",
    "¿Qué es una derivada?",
  ]);
  await expect(page.getByText("Eres el 3º en la cola")).toHaveCount(0);
});

test("cancelling the wait gives the text back and sends nothing else", async ({
  page,
}) => {
  const chats = await signedIn(page, [
    {
      status: 429,
      body: JSON.stringify({
        error: "límite",
        code: "dream_rpm",
        retry_after: 30,
      }),
    },
    answer,
  ]);
  await ask(page, "Explícame los vectores");
  const wait = page
    .getByRole("status")
    .filter({ hasText: "Hay mucha gente usando Dream" });
  await expect(wait).toBeVisible();
  await wait.getByRole("button", { name: "Cancelar" }).click();
  await expect(wait).toHaveCount(0);
  await expect(page.locator(".composer textarea")).toHaveValue(
    "Explícame los vectores",
  );
  await page.waitForTimeout(500);
  expect(chats).toHaveLength(1);
});

test("the daily quota is not queued: it says when to come back and what still works", async ({
  page,
}) => {
  const chats = await signedIn(page, [
    {
      status: 200,
      contentType: "application/x-ndjson",
      body: '{"type":"error","message":"límite","code":"provider_daily_limit","retry_after":7200,"reverted":true}\n',
    },
  ]);
  await ask(page, "Hazme un resumen");
  const alert = page.locator(".chat-error");
  await expect(alert).toContainText(
    "La IA gratis de hoy se ha agotado. Vuelve",
  );
  await expect(alert.getByRole("link", { name: "apuntes" })).toHaveAttribute(
    "href",
    "/notes",
  );
  await expect(alert.getByRole("link", { name: "progreso" })).toHaveAttribute(
    "href",
    "/progress",
  );
  await page.waitForTimeout(500);
  expect(chats).toHaveLength(1);
  await expect(page.locator(".composer textarea")).toHaveValue(
    "Hazme un resumen",
  );
});
