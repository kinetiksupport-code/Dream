import { gunzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";
test.use({
  serviceWorkers: "block",
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
});
test("PostHog SDK sends only allowlisted events after consent and stops after revocation", async ({
  page,
}) => {
  test.setTimeout(90000);
  const captures: string[] = [];
  await page.addInitScript(() => {
    // Exercise human-browser telemetry; retain the SDK bot filter in production.
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
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
          email: "private-canary@example.test",
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
    const data =
      action === "profile"
        ? {
            profile: {
              display_name: "PRIVATE_CANARY_NAME",
              email: "private-canary@example.test",
              pref_step_by_step: true,
            },
            service_ready: true,
          }
        : { items: [] };
    await route.fulfill({ json: data });
  });
  await page.route("https://us.i.posthog.com/**", async (route) => {
    const buffer = route.request().postDataBuffer();
    const body =
      buffer?.[0] === 31 && buffer?.[1] === 139
        ? gunzipSync(buffer).toString()
        : buffer?.toString() || "";
    captures.push(body);
    await route.fulfill({ status: 200, json: { status: 1 } });
  });
  await page.goto("/settings");
  const analytics = page.getByRole("switch", { name: "Analítica de uso" });
  await expect(analytics).toHaveAttribute("aria-checked", "false");
  expect(captures).toEqual([]);
  const privacySection = page.locator(".settings-group").filter({
    has: page.getByRole("heading", { name: "Datos de uso", exact: true }),
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await privacySection.screenshot({
      path: `/tmp/dream-exam-qa/privacy-${width}.png`,
    });
  }
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await privacySection.screenshot({
    path: "/tmp/dream-exam-qa/privacy-dark-1440.png",
  });
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", "true");
  const request = page.waitForRequest(
    (req) =>
      req.url().startsWith("https://us.i.posthog.com/") &&
      req.method() === "POST",
    { timeout: 60000 },
  );
  await page.goto("/chat");
  await request;
  await expect.poll(() => captures.length).toBeGreaterThan(0);
  const joined = captures.join("\n");
  const allowed = new Set([
    "section",
    "action",
    "mode",
    "http_status",
    "duration_ms",
    "outcome",
    "environment",
    "distinct_id",
    "token",
    "$geoip_disable",
  ]);
  for (const body of captures.filter(Boolean)) {
    const payload = JSON.parse(body);
    const batch = Array.isArray(payload) ? payload : payload.batch || [payload];
    for (const event of batch) {
      expect(["section_viewed", "api_request_completed"]).toContain(
        event.event,
      );
      expect(
        Object.keys(event.properties).every((key) => allowed.has(key)),
      ).toBe(true);
      expect(["production", "preview", "development"]).toContain(
        event.properties.environment,
      );
    }
  }
  expect(joined).not.toContain("PRIVATE_CANARY_NAME");
  expect(joined).not.toContain("private-canary");
  expect(joined).not.toContain("qa-contract-fixture");
  expect(joined).not.toContain("$autocapture");
  expect(joined).not.toContain("$pageview");
  let rateLimited = true;
  await page.route("**/functions/v1/dream-api", async (route) => {
    if (rateLimited && route.request().postDataJSON().action === "profile") {
      rateLimited = false;
      await route.fulfill({
        status: 429,
        json: { error: "PRIVATE_CANARY_HTTP_BODY private-canary@example.test" },
      });
    } else await route.fallback();
  });
  const previousCaptures = captures.length;
  await page.goto("/chat");
  await expect
    .poll(() => captures.length, { timeout: 30000 })
    .toBeGreaterThan(previousCaptures);
  const received = captures.flatMap((body) => {
    const payload = JSON.parse(body);
    return Array.isArray(payload) ? payload : payload.batch || [payload];
  });
  expect(
    received.some(
      (event) =>
        event.event === "feature_error" &&
        event.properties.http_status === 429 &&
        event.properties.outcome === "http_error",
    ),
  ).toBe(true);
  expect(captures.join("\n")).not.toContain("PRIVATE_CANARY_HTTP_BODY");
  expect(captures.join("\n")).not.toContain("private-canary");
  await page.goto("/settings");
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", "false");
  captures.length = 0;
  await page.goto("/chat");
  await expect(
    page.getByText("¿Qué quieres", { exact: false }).first(),
  ).toBeVisible();
  expect(captures).toEqual([]);
});
