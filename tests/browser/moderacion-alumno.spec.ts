import { test, expect, type Page } from "@playwright/test";

// B6, lado del alumno, en un navegador real con datos sintéticos y dream-api
// simulado (no se llama a Supabase, Groq ni Crisp). Capturas en
// docs/diseno/moderacion/ con cuentas de prueba.
const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
const NOTICE = "11111111-1111-4111-8111-111111111111";
const LIMIT = "22222222-2222-4222-8222-222222222222";
const SHOTS = "docs/diseno/moderacion";

interface State {
  banned: boolean;
  calls: Array<Record<string, unknown>>;
  chat: { status: number; body: unknown } | null;
}

async function setup(page: Page, initial: Partial<State> = {}) {
  const state: State = { banned: false, calls: [], chat: null, ...initial };
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "42345678-1234-1234-1234-123456789abc", email: "qa@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      }),
    );
  }, KEY);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.calls.push(body);
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    switch (body.action) {
      case "profile":
        return json({
          profile: { email: "qa@example.test", display_name: "Alex" },
          service_ready: true,
          ban: state.banned ? { until: "2026-12-15T00:00:00Z", permanent: false, rule: "G-MULTI" } : null,
        });
      case "mod_ban_info":
        return json({
          ban: { rule: "G-MULTI", reason: "una persona, una cuenta: no crear cuentas extra para saltarse límites o un baneo", until: "2026-12-15T00:00:00Z", permanent: false },
          code: "DREAM-K7QM-2XPD",
          appeals: [],
          deadline_days: 30,
        });
      case "mod_appeal_create":
        return json({ ok: true, code: "DREAM-AAAA-BBBB", due_at: "2026-11-21T00:00:00Z", deadline_days: 30 });
      case "mod_notices":
        return json({
          items: state.banned
            ? []
            : [
                { id: NOTICE, kind: "aviso", rule: "G-INSULT", reason: "tratar con respeto a todo el mundo, también al tutor de IA", until: null, created_at: "2026-10-22T10:00:00Z" },
                { id: LIMIT, kind: "limitacion", rule: "G-SPAM", reason: "no enviar mensajes repetidos ni saturar el chat", until: "2026-10-23T11:30:00Z", created_at: "2026-10-22T09:00:00Z" },
              ],
        });
      case "mod_ack":
        return json({ ok: true });
      case "chat":
        if (state.chat) return json(state.chat.body, state.chat.status);
        return json({ items: [] });
      case "conversation_create":
        return json({ conversation: { id: "12345678-1234-1234-1234-123456789abc", title: "Nueva conversación", updated_at: "2026-10-22T00:00:00Z" } });
      case "conversations":
      case "messages":
        return json({ items: [] });
      default:
        return json({ ok: true });
    }
  });
  return state;
}

const actions = (s: State) => s.calls.map((c) => String(c.action));

test("banned account: only the ban screen, with reason, duration, code and the three allowed paths", async ({ page }) => {
  const crispRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("crisp.chat")) crispRequests.push(r.url());
  });
  const state = await setup(page, { banned: true });
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Has sido baneado de la plataforma", level: 1 })).toBeVisible();
  await expect(page.getByText("una persona, una cuenta", { exact: false })).toBeVisible();
  await expect(page.getByText("Hasta el 15 de diciembre de 2026")).toBeVisible();
  await expect(page.getByTestId("appeal-code")).toHaveText("DREAM-K7QM-2XPD");
  await expect(page.getByRole("button", { name: "Hacer una apelación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar mi cuenta" })).toBeVisible();
  // Ni menú, ni chat, ni nada de la app; y no se pidió nada que dream-api rechazaría.
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.locator(".composer")).toHaveCount(0);
  expect(actions(state).filter((a) => !["profile", "mod_ban_info"].includes(a))).toEqual([]);
  expect(crispRequests, "Crisp no se carga hasta pulsar").toEqual([]);
  await page.screenshot({ path: `${SHOTS}/baneo-escritorio.png`, fullPage: true });
});

test("the appeal button asks first, then loads Crisp; Crisp gets nothing from the account", async ({ page }) => {
  let crispScript = 0;
  await page.route("https://client.crisp.chat/**", (route) => {
    crispScript++;
    return route.fulfill({
      contentType: "application/javascript",
      body: "window.$crisp={push(){},is(){return true}};window.CRISP_READY_TRIGGER&&window.CRISP_READY_TRIGGER();",
    });
  });
  await setup(page, { banned: true });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Hacer una apelación" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Dream no le pasa tu correo ni tu nombre");
  expect(crispScript).toBe(0);
  await page.screenshot({ path: `${SHOTS}/baneo-aviso-crisp.png` });
  await dialog.getByRole("button", { name: "Abrir chat" }).click();
  await expect.poll(() => crispScript).toBe(1);
  // Lo único que Crisp conoce es lo que el alumno escriba: ni correo, ni nombre, ni id.
  const sent = await page.evaluate(() => JSON.stringify((window as unknown as Record<string, unknown>).CRISP_WEBSITE_ID ?? ""));
  expect(sent).not.toMatch(/qa@example|Alex|42345678/);
});

test("if the chat cannot open, a calm one-liner appears and the written claim is still there", async ({ page }) => {
  await page.route("https://client.crisp.chat/**", (route) => route.abort());
  await setup(page, { banned: true });
  await page.addInitScript(() => localStorage.setItem("dream-crisp-notice", "1"));
  await page.goto("/chat");
  await page.getByRole("button", { name: "Hacer una apelación" }).click();
  await expect(page.getByText("No se pudo abrir el chat ahora.")).toBeVisible();
  await expect(page.getByLabel("Cuéntanos qué ha pasado")).toBeVisible();
});

test("the written claim: 30 days visible, sent to dream-api, and the code comes back", async ({ page }) => {
  const state = await setup(page, { banned: true });
  await page.goto("/chat");
  await expect(page.getByText("en un máximo de 30 días", { exact: false }).first()).toBeVisible();
  const send = page.getByRole("button", { name: "Enviar reclamación" });
  await expect(send).toBeDisabled();
  const message = "Creo que ha sido un error, comparto el wifi del colegio.";
  await page.getByLabel("Cuéntanos qué ha pasado").fill(message);
  await expect(page.getByText(`Quedan ${2000 - message.length} caracteres`, { exact: false })).toBeVisible();
  await send.click();
  await expect(page.getByRole("heading", { name: "Reclamación enviada" })).toBeVisible();
  await expect(page.getByText("en un máximo de 30 días", { exact: false }).first()).toBeVisible();
  const call = state.calls.find((c) => c.action === "mod_appeal_create");
  expect(call?.body).toBe(message);
  await page.screenshot({ path: `${SHOTS}/baneo-reclamacion-enviada.png`, fullPage: true });
});

test("a banned account can delete its account (type ELIMINAR) and nothing else", async ({ page }) => {
  const state = await setup(page, { banned: true });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Eliminar cuenta" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
  await confirm.click();
  await expect.poll(() => actions(state).includes("account_delete")).toBe(true);
  expect(state.calls.find((c) => c.action === "account_delete")?.confirm).toBe("ELIMINAR");
});

test("a ban applied while the session is open replaces the app with the ban screen", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/chat");
  await expect(page.locator(".composer")).toBeVisible();
  state.banned = true;
  // Lo que hace callDream cuando dream-api contesta 403 con code «banned».
  await page.evaluate(() => window.dispatchEvent(new Event("dream:banned")));
  await expect(page.getByRole("heading", { name: "Has sido baneado de la plataforma", level: 1 })).toBeVisible();
  await expect(page.locator(".composer")).toHaveCount(0);
});

test("warnings and limitations: which rule, until when and how to claim; «Entendido» marks them as seen", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/chat");
  const warning = page.getByRole("region", { name: "Aviso" });
  const limit = page.getByRole("region", { name: "Limitación de tu cuenta" });
  await expect(warning).toContainText("Este recordatorio no es una sanción.");
  await expect(warning).toContainText("tratar con respeto a todo el mundo");
  await expect(limit).toContainText("hasta el 23 de octubre");
  await expect(limit).toContainText("no enviar mensajes repetidos");
  await expect(warning.getByRole("link", { name: "Reclamar" })).toHaveAttribute("href", "/reclamar");
  await page.screenshot({ path: `${SHOTS}/avisos-escritorio.png` });
  await warning.getByRole("button", { name: "Entendido" }).click();
  await expect(warning).toHaveCount(0);
  await expect.poll(() => state.calls.some((c) => c.action === "mod_ack" && c.id === NOTICE)).toBe(true);
  // Un tono que no acusa.
  const text = await page.locator(".workspace-main").innerText();
  expect(text).not.toMatch(/\b(culpable|infractor|has cometido|castigo)\b/i);
});

test("an unusual-use block (429) shows a notice with «Reclamar», and the claim page shows the 30 days", async ({ page }) => {
  const state = await setup(page, {
    chat: {
      status: 429,
      body: {
        error: "Hemos detectado un uso anormal desde tu conexión y está bloqueada durante 24 h. Si crees que es un error, escríbenos.",
        code: "mod_ip_blocked",
        retry_after: 86400,
      },
    },
  });
  await page.goto("/chat");
  await page.locator(".composer textarea").fill("Explícame la fotosíntesis");
  await page.keyboard.press("Enter");
  const alert = page.getByRole("alert").filter({ hasText: "Tu conexión está bloqueada un tiempo" });
  await expect(alert).toContainText("uso anormal desde tu conexión");
  await page.screenshot({ path: `${SHOTS}/bloqueo-escritorio.png` });
  await alert.getByRole("link", { name: "Reclamar" }).click();
  await expect(page.getByRole("heading", { name: "Reclamar", level: 1 })).toBeVisible();
  await expect(page.getByText("en un máximo de 30 días", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Cuéntanos qué ha pasado").fill("Estamos todos en la biblioteca.");
  await page.getByRole("button", { name: "Enviar reclamación" }).click();
  await expect(page.getByRole("heading", { name: "Reclamación enviada" })).toBeVisible();
  expect(actions(state)).toContain("mod_appeal_create");
});

test("the ban screen works on a phone and in dark mode with reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: true });
  const page = await context.newPage();
  await setup(page, { banned: true });
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Has sido baneado de la plataforma", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "sin scroll horizontal").toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 40;
    }).map((el) => (el.textContent ?? "").trim().slice(0, 30)),
  );
  expect(small, `objetivos táctiles pequeños: ${small.join(", ")}`).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/baneo-movil-oscuro.png`, fullPage: true });
  await context.close();
});
