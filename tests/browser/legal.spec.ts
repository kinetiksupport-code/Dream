import { mkdirSync } from "node:fs";
import { test, expect, type Page, type Request } from "@playwright/test";
test.use({ serviceWorkers: "block" });

// Contract fixtures are confined to tests.
const cid = "12345678-1234-1234-1234-123456789abc";
const SHOTS =
  process.env.LEGAL_SCREENSHOTS_DIR || "test-results/legal-screenshots";
const LEGAL = [
  {
    path: "/privacidad",
    heading: "Política de privacidad",
    title: /Política de privacidad · Dream/,
  },
  {
    path: "/terminos",
    heading: "Términos y condiciones",
    title: /Términos y condiciones · Dream/,
  },
  {
    path: "/cookies",
    heading: "Almacenamiento en el dispositivo y cookies",
    title: /Almacenamiento y cookies · Dream/,
  },
  {
    path: "/aviso-legal",
    heading: "Aviso legal",
    title: /Aviso legal · Dream/,
  },
] as const;
const AI_NOTICE =
  "Estás hablando con una IA. Puede equivocarse: contrasta lo importante";
const TELEMETRY_HOST = /posthog|sentry/i;
const NOTICE_KEY = "dream-storage-notice-v1";

mkdirSync(SHOTS, { recursive: true });

async function closedNotice(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, "1"), NOTICE_KEY);
}

async function dark(page: Page) {
  await page.addInitScript(() => localStorage.setItem("dream-theme", "dark"));
}

async function authenticated(page: Page, withConversation = false) {
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
    const action = route.request().postDataJSON().action;
    let data: unknown = { ok: true };
    if (action === "profile")
      data = {
        profile: { email: "qa@example.test", display_name: "Alex" },
        service_ready: true,
      };
    else if (action === "conversations")
      data = {
        items: withConversation
          ? [{ id: cid, title: "Una idea", updated_at: "2026-10-06T00:00:00Z" }]
          : [],
      };
    else if (action === "messages")
      data = {
        items: [
          { id: "a", role: "user", content: "¿Qué es la energía?" },
          { id: "b", role: "assistant", content: "Empecemos por una pista." },
        ],
      };
    await route.fulfill({ json: data });
  });
}

test("legal pages are public, readable at 360 px and hide internal notes", async ({
  page,
}) => {
  await closedNotice(page);
  for (const legal of LEGAL) {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(legal.path);
      await expect(page).toHaveURL(legal.path);
      await expect(page).toHaveTitle(legal.title);
      await expect(
        page.getByRole("heading", { level: 1, name: legal.heading }),
      ).toBeVisible();
      await expect(page.locator("main")).not.toContainText("Carlos:");
      await expect(page.locator("main")).not.toContainText("Nota técnica");
      await expect(page.locator("main")).not.toContainText(
        "Pendiente de decidir",
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${legal.path} at ${width}px`).toBeLessThanOrEqual(0);
      const footer = page.getByRole("navigation", { name: "Legal" });
      for (const other of LEGAL)
        await expect(footer.locator(`a[href="${other.path}"]`)).toBeVisible();
      await expect(footer.locator(`a[href="${legal.path}"]`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  }
  await page.goto("/aviso-legal");
  await expect(page.locator("mark", { hasText: "[NIF]" })).toBeVisible();
  await expect(page.locator("mark", { hasText: "[DOMICILIO]" })).toBeVisible();
  await expect(page.getByText("hellodream@edudream.es").first()).toBeVisible();
  await page.goto("/privacidad");
  await expect(page.locator("mark", { hasText: "[FECHA]" })).toBeVisible();
  await expect(page.locator("mark", { hasText: "[X meses]" })).toBeVisible();
});

test("screenshots: legal pages in light and dark, mobile and desktop", async ({
  page,
}) => {
  test.setTimeout(120000);
  await closedNotice(page);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await dark(page);
    for (const [name, width, height] of [
      ["mobile", 360, 780],
      ["desktop", 1280, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const legal of LEGAL) {
        await page.goto(legal.path);
        await page.screenshot({
          animations: "disabled",
          path: `${SHOTS}/${legal.path.slice(1)}-${name}-${theme}.png`,
        });
      }
      await page.goto("/privacidad");
      await page.locator("table").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: `${SHOTS}/privacidad-tabla-${name}-${theme}.png`,
      });
      await page.goto("/cookies");
      await page.locator("table").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: `${SHOTS}/cookies-tabla-${name}-${theme}.png`,
      });
    }
  }
});

test("landing, login and Ajustes link to the four legal pages", async ({
  page,
}) => {
  await closedNotice(page);
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Legal" });
    for (const legal of LEGAL)
      await expect(nav.locator(`a[href="${legal.path}"]`)).toBeVisible();
  }
  await authenticated(page);
  await page.goto("/settings");
  const section = page.locator("section.group").filter({
    has: page.getByRole("heading", { name: "Legal", exact: true }),
  });
  for (const legal of LEGAL)
    await expect(section.locator(`a[href="${legal.path}"]`)).toBeVisible();
  for (const [name, width] of [
    ["mobile", 360],
    ["desktop", 1280],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    await section.screenshot({
      animations: "disabled",
      path: `${SHOTS}/ajustes-legal-${name}.png`,
    });
  }
  await section.getByRole("link", { name: "Aviso legal" }).click();
  await expect(page).toHaveURL("/aviso-legal");
  await expect(
    page.getByRole("heading", { level: 1, name: "Aviso legal" }),
  ).toBeVisible();
});

test("chat shows the AI notice in the empty state and in a conversation", async ({
  page,
}) => {
  await closedNotice(page);
  await authenticated(page, true);
  for (const [name, width] of [
    ["mobile", 360],
    ["desktop", 1280],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/chat");
    await expect(
      page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
    ).toBeVisible();
    await expect(page.getByText(AI_NOTICE)).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: `${SHOTS}/chat-vacio-${name}.png`,
    });
    await page.goto(`/chat?c=${cid}`);
    await expect(page.getByText("Empecemos por una pista.")).toBeVisible();
    await expect(page.getByText(AI_NOTICE)).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: `${SHOTS}/chat-conversacion-${name}.png`,
    });
  }
});

test("before any consent: no telemetry requests, cookies or storage keys", async ({
  page,
  context,
}) => {
  const telemetry: string[] = [];
  const track = (request: Request) => {
    if (TELEMETRY_HOST.test(new URL(request.url()).hostname))
      telemetry.push(request.url());
  };
  context.on("request", track);
  const storageKeys = () =>
    page.evaluate(() => [
      ...Object.keys(localStorage),
      ...Object.keys(sessionStorage),
    ]);
  const nonEssentialCookies = async () =>
    (await context.cookies())
      .map((cookie) => cookie.name)
      .filter((name) => /^(ph_|_ga|_gid|__posthog|sentry)/i.test(name));

  // First visit: the notice appears on the landing page.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const notice = page.getByRole("region", { name: "Aviso sobre cookies" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    "Dream solo usa el almacenamiento necesario",
  );
  await expect(
    notice.getByRole("link", { name: "Más información" }),
  ).toHaveAttribute("href", "/cookies");
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/aviso-cookies-landing-mobile.png`,
  });
  await page.goto("/login");
  await expect(notice).toBeVisible();

  // Also inside the app, signed in.
  await authenticated(page);
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
  await expect(notice).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/aviso-cookies-app-mobile.png`,
  });
  await page.waitForTimeout(1500);
  expect(await nonEssentialCookies()).toEqual([]);
  expect(
    (await storageKeys()).filter((key) => /posthog|^ph_|sentry/i.test(key)),
  ).toEqual([]);
  expect(telemetry).toEqual([]);

  // "Entendido" only closes the notice: it is not consent to statistics.
  await notice.getByRole("button", { name: "Entendido" }).click();
  await expect(notice).toBeHidden();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), NOTICE_KEY),
  ).toBe("1");
  expect(
    await page.evaluate(() => localStorage.getItem("dream-privacy-v1")),
  ).toBeNull();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.goto("/settings");
  await expect(
    page.getByRole("switch", { name: "Analítica de uso" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.waitForTimeout(1500);
  expect(await nonEssentialCookies()).toEqual([]);
  expect(
    (await storageKeys()).filter((key) => /posthog|^ph_|sentry/i.test(key)),
  ).toEqual([]);
  expect(telemetry).toEqual([]);
});

test("storage notice screenshots in light and dark", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await dark(page);
    for (const [name, width, height] of [
      ["mobile", 360, 780],
      ["desktop", 1280, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      await expect(
        page.getByRole("region", { name: "Aviso sobre cookies" }),
      ).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        path: `${SHOTS}/aviso-cookies-login-${name}-${theme}.png`,
      });
    }
  }
});
