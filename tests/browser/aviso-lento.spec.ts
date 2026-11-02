import { test, expect, type Page } from "@playwright/test";
// Isolated contract fixtures: never used by the application or service worker.
async function authenticated(page: Page, onRead: (action: string) => number) {
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
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204 });
    const status = onRead(body.action);
    if (status !== 200)
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo conectar con Dream." }),
      });
    const data =
      body.action === "profile"
        ? {
            profile: { email: "qa@example.test", display_name: "Alex" },
            service_ready: true,
          }
        : body.action === "conversations"
          ? { items: [] }
          : { ok: true };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

test("a read that fails for a moment shows the countdown and «Reintentar ya» retries it", async ({
  page,
}, info) => {
  let profileCalls = 0;
  await authenticated(page, (action) => {
    if (action !== "profile") return 200;
    return ++profileCalls === 1 ? 503 : 200;
  });
  await page.goto("/chat");
  const notice = page.getByText(/No se pudo conectar\. Reintento en \d+ s\./);
  await expect(notice).toBeVisible();
  await page.screenshot({
    path: info.outputPath("aviso-reintento.png"),
  });
  await page.getByRole("button", { name: "Reintentar ya" }).click();
  await expect(notice).toBeHidden();
  expect(profileCalls).toBe(2);
});

test("a write is never retried on its own", async ({ page }) => {
  let calls = 0;
  await authenticated(page, (action) => {
    if (action === "conversation_create") calls++;
    return action === "conversation_create" ? 503 : 200;
  });
  await page.goto("/chat");
  await page.waitForTimeout(500);
  await expect(page.getByText(/Reintento en/)).toBeHidden();
  expect(calls).toBeLessThanOrEqual(1);
});
