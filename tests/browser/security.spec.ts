import { test, expect } from "@playwright/test";
// Returning visitor: the first-visit storage notice was already closed
// (covered by legal.spec.ts), so it never covers the controls under test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dream-storage-notice-v1", "1");
  });
});
test("PWA only caches allowlisted public assets, retains unrelated caches, activates safely", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    const cache = await caches.open("other-application");
    await cache.put("/owned-by-another-app", new Response("keep"));
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain("other-application");
  expect(keys).toContain("dream-static-v3");
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("dream-static-v3");
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached.sort()).toEqual([
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon.svg",
    "/offline.html",
  ]);
  await page.reload();
  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Sin conexión" }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Sin conexión" }),
  ).toHaveCount(0);
});
test("service worker never takes over by itself: activation needs the user's SKIP_WAITING", async ({
  request,
}) => {
  const worker = await request.get("/sw.js");
  const text = await worker.text();
  const install = text.slice(
    text.indexOf("addEventListener('install'"),
    text.indexOf("addEventListener('activate'"),
  );
  expect(install).not.toContain("skipWaiting(");
  expect(text.match(/skipWaiting\(/g)).toHaveLength(1);
  expect(text).toContain(
    "if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();",
  );
  expect(text).not.toContain("clients.claim(");
  expect(text).toContain("key.startsWith('dream-static-')");
});
test("account change remounts private workspace and drops a late previous-account response", async ({
  page,
}) => {
  const key = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
  const session = (n: string) => ({
    access_token: `synthetic-${n}`,
    refresh_token: "synthetic",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: `00000000-0000-4000-8000-00000000000${n}`,
      email: `synthetic-${n}@example.test`,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key, value: session("1") },
  );
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstRequested = false;
  await page.route("**/functions/v1/dream-api", async (route) => {
    const action = route.request().postDataJSON().action;
    const account = route
      .request()
      .headers()
      .authorization.includes("synthetic-2")
      ? "2"
      : "1";
    if (action === "profile")
      return route.fulfill({
        json: {
          profile: {
            display_name: `Account ${account}`,
            email: `synthetic-${account}@example.test`,
          },
          service_ready: true,
        },
      });
    if (action === "messages" && account === "1") {
      firstRequested = true;
      await delayed;
      return route.fulfill({
        json: {
          items: [
            {
              id: "old",
              role: "assistant",
              content: "PRIVATE_ACCOUNT_A",
              created_at: "2026-01-01",
            },
          ],
        },
      });
    }
    return route.fulfill({
      json: {
        items:
          action === "messages"
            ? [
                {
                  id: "new",
                  role: "assistant",
                  content: "ACCOUNT_B_ONLY",
                  created_at: "2026-01-01",
                },
              ]
            : [],
      },
    });
  });
  await page.goto("/chat?c=12345678-1234-1234-1234-123456789abc");
  await expect.poll(() => firstRequested).toBe(true);
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session: value });
      channel.close();
    },
    { key, value: session("2") },
  );
  await expect(page.getByText("ACCOUNT_B_ONLY")).toBeVisible();
  release();
  await expect(page.getByText("PRIVATE_ACCOUNT_A")).toHaveCount(0);
});
test("attachment batch uses a bounded serial queue compatible with per-user admission", async ({
  page,
}) => {
  const key = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: "synthetic-batch",
          refresh_token: "synthetic",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "batch@example.test",
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      ),
    key,
  );
  let inFlight = 0,
    maxInFlight = 0,
    count = 0;
  let release: () => void = () => {};
  const delayed = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    let data: unknown = { items: [] };
    if (b.action === "profile")
      data = {
        profile: { email: "batch@example.test", display_name: "Batch" },
        service_ready: true,
      };
    if (b.action === "conversation_create")
      data = {
        conversation: {
          id: "12345678-1234-1234-1234-123456789abc",
          title: "Nueva conversación",
          updated_at: "2026-01-01",
        },
      };
    if (b.action === "attachment_upload") {
      count++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (count === 1) await delayed;
      data = {
        attachment: {
          id: "00000000-0000-4000-8000-" + String(count).padStart(12, "0"),
        },
      };
      await route.fulfill({ json: data });
      inFlight--;
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/chat");
  await expect(page.locator("input[type=file]")).toBeAttached();
  await page
    .locator("input[type=file]")
    .setInputFiles(
      ["a.txt", "b.txt", "c.txt"].map((name) => ({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from("Contexto sintético"),
      })),
    );
  await expect.poll(() => count).toBe(1);
  await expect(page.getByText(/En espera · TXT/)).toHaveCount(2);
  release();
  await expect.poll(() => count).toBe(3);
  await expect(page.getByText(/Listo · TXT/)).toHaveCount(3);
  expect(maxInFlight).toBe(1);
});
