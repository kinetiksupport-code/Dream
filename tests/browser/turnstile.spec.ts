import { test, expect, type Page, type Route } from "@playwright/test";

// Turnstile en un navegador real (docs/turnstile.md), con la clave de PRUEBA
// pública de Cloudflare (1x00000000000000000000AA: siempre pasa y es visible).
// Necesita un build con esa clave:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
//   TURNSTILE_E2E=1 npx playwright test tests/browser/turnstile.spec.ts
// dream-api está simulado: aquí se prueba el navegador. La validación de verdad
// (servidor) está en tests/turnstile.test.ts y scripts/security/turnstile-real.mjs.
test.skip(!process.env.TURNSTILE_E2E, "Build with the Turnstile test key and set TURNSTILE_E2E=1");
test.use({ serviceWorkers: "block" });

const DUMMY = "XXXX.DUMMY.TOKEN.XXXX";
const QR = "q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe";
const DEVICE = "Dv1c3-k3y_00000000000000000000000000000000";
const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
const SHOTS = process.env.CAPTURAS_DIR;
const FAILED = { error: "No hemos podido comprobar que eres una persona, vuelve a intentarlo.", code: "turnstile_failed" };
type Body = Record<string, unknown>;

async function api(page: Page, handler: (body: Body) => { status?: number; body: unknown }) {
  const calls: Body[] = [];
  await page.route("**/functions/v1/dream-api", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    const answer = handler(body);
    await route.fulfill({ status: answer.status ?? 200, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  return calls;
}

async function signIn(page: Page) {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "42345678-1234-1234-1234-123456789abc", email: "qa@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-29T00:00:00Z" },
      }),
    );
  }, KEY);
}
const appAnswer = (body: Body) => {
  switch (body.action) {
    case "profile":
      return { body: { profile: { email: "qa@example.test", display_name: "Alex" }, service_ready: true, ban: null } };
    case "conversation_create":
      return { body: { conversation: { id: "12345678-1234-1234-1234-123456789abc", title: "Nueva conversación", updated_at: "2026-10-29T00:00:00Z" } } };
    case "mod_notices":
    case "conversations":
    case "messages":
      return { body: { items: [] } };
    default:
      return { body: { ok: true } };
  }
};

test("QR: the phone passes the check before connecting, and a rejected token asks again", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  let connects = 0;
  const calls = await api(page, (body) => {
    if (body.action !== "upload_qr_connect") return { body: {} };
    connects++;
    // The first token is "rejected by the server" to test the retry.
    if (connects === 1) return { status: 403, body: FAILED };
    return { body: { ok: true, device_key: DEVICE, expires_at: "2099-01-01T00:00:00Z", uploads: 0, max_uploads: 10 } };
  });
  await page.goto(`/subir#${QR}`);
  await expect(page.getByRole("heading", { name: "Una comprobación rápida" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Comprobación de seguridad" })).toBeVisible();
  // Cloudflare draws its iframe inside a shadow root: wait for the box to get its size.
  await expect.poll(() => page.locator('[class*="widget"]').evaluate((el) => el.getBoundingClientRect().height), { timeout: 20_000 }).toBeGreaterThanOrEqual(65);
  // The rejected token makes the widget give a new one, and the phone connects with it.
  await expect(page.getByRole("heading", { name: "Conectado con tu ordenador" })).toBeVisible({ timeout: 20_000 });
  const connectCalls = calls.filter((c) => c.action === "upload_qr_connect");
  expect(connectCalls).toHaveLength(2);
  for (const c of connectCalls) expect(c.turnstile_token).toBe(DUMMY);
  await context.close();
});

test("QR: screenshots of the check on a phone, light and dark", async ({ browser }) => {
  test.skip(!SHOTS, "Set CAPTURAS_DIR to take screenshots");
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, colorScheme });
    const page = await context.newPage();
    // Every connect is rejected so the check stays on screen for the picture.
    await api(page, () => ({ status: 403, body: FAILED }));
    await page.goto(`/subir#${QR}`);
    await expect(page.getByRole("heading", { name: "Una comprobación rápida" })).toBeVisible();
    // Wait until Cloudflare has answered (the rejection shows), so the widget is drawn.
    await expect(page.getByRole("alert").filter({ hasText: "No hemos podido" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/subir-comprobacion-movil-${colorScheme === "light" ? "claro" : "oscuro"}.png`, fullPage: true });
    await context.close();
  }
});

test("Reclamar: the button waits for the check and the token goes with the appeal", async ({ page }) => {
  await signIn(page);
  const calls = await api(page, (body) =>
    body.action === "mod_appeal_create"
      ? { body: { ok: true, code: "DREAM-AAAA-BBBB", due_at: "2026-11-28T00:00:00Z", deadline_days: 30 } }
      : appAnswer(body),
  );
  await page.goto("/reclamar");
  await page.getByLabel("Cuéntanos qué ha pasado").fill("Estamos todos en la biblioteca.");
  const send = page.getByRole("button", { name: "Enviar reclamación" });
  await expect(page.getByRole("group", { name: "Comprobación de seguridad" })).toBeVisible();
  await expect(send).toBeEnabled({ timeout: 20_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/reclamar-comprobacion-escritorio.png`, fullPage: true });
  await send.click();
  await expect(page.getByRole("heading", { name: "Reclamación enviada" })).toBeVisible();
  const appeal = calls.find((c) => c.action === "mod_appeal_create");
  expect(appeal?.turnstile_token).toBe(DUMMY);
});

test("first AI action: when dream-api asks, the check opens and the request is repeated once with the token", async ({ page }) => {
  await signIn(page);
  let chats = 0;
  const calls = await api(page, (body) => {
    if (body.action !== "chat") return appAnswer(body);
    chats++;
    if (chats === 1)
      return { status: 428, body: { error: "No hemos podido comprobar que eres una persona, vuelve a intentarlo.", code: "turnstile_required", retry_after: 0 } };
    return { status: 503, body: { error: "Dream está ocupado ahora mismo.", code: "busy" } };
  });
  await page.goto("/chat");
  await page.locator(".composer textarea").fill("Explícame la fotosíntesis");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Una comprobación rápida" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Antes de tu primera pregunta");
  if (SHOTS) {
    // Hold the token for the picture: Cloudflare's test key answers at once.
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/primera-ia-comprobacion-escritorio.png` });
  }
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => chats).toBe(2);
  const chatCalls = calls.filter((c) => c.action === "chat");
  expect(chatCalls[0].turnstile_token).toBeUndefined();
  expect(chatCalls[1].turnstile_token).toBe(DUMMY);
});

test("Cancel on the check sends nothing more", async ({ page }) => {
  await signIn(page);
  let chats = 0;
  await api(page, (body) => {
    if (body.action !== "chat") return appAnswer(body);
    chats++;
    return { status: 428, body: { error: "No hemos podido comprobar que eres una persona, vuelve a intentarlo.", code: "turnstile_required", retry_after: 0 } };
  });
  // Without Cloudflare the widget never gives a token: the student cancels.
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await page.goto("/chat");
  await page.locator(".composer textarea").fill("Hola");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Una comprobación rápida" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("No hemos podido comprobar que eres una persona");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  expect(chats).toBe(1);
});

test("CSP allows Turnstile only in script-src and frame-src, and the script loads only where it is used", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://challenges.cloudflare.com")) scripts.push(r.url());
  });
  const response = await page.goto("/");
  const csp = response!.headers()["content-security-policy"] ?? "";
  const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
  expect(directive("script-src")).toContain("https://challenges.cloudflare.com");
  expect(directive("frame-src")).toContain("https://challenges.cloudflare.com");
  for (const other of ["connect-src", "img-src", "style-src", "default-src"]) expect(directive(other)).not.toContain("challenges.cloudflare.com");
  await page.goto("/login");
  await page.goto("/privacidad");
  expect(scripts, "Turnstile no se carga en la landing, el login ni las páginas legales").toEqual([]);
});
