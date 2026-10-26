import { test, expect } from "@playwright/test";
import { TERMS_VERSION } from "../../lib/consent";

// Cuentas de Fundación Loyola: el aviso de Dream sale una vez en el chat y,
// al cerrarlo, se avisa al servidor. Servidor simulado.
const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
const WELCOME = "Eres alumno de Fundación Loyola: no tienes límite de uso en Dream.";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`the Loyola welcome shows once and goes away at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({
      access_token: "synthetic.token", refresh_token: "synthetic", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer",
      user: { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "luis@fundacionloyola.net", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    })), { key: KEY });
    const seen: string[] = [];
    await page.route("**/functions/v1/dream-api", (route) => {
      const action = String((route.request().postDataJSON() as { action?: string }).action);
      if (action === "special_welcome_seen") { seen.push(action); return route.fulfill({ json: { ok: true } }); }
      if (action === "profile")
        return route.fulfill({ json: {
          profile: { email: "luis@fundacionloyola.net", display_name: "Luis", age_band: "18_plus", ai_consent_at: "2026-10-01T00:00:00Z", terms_accepted_at: "2026-10-01T00:00:00Z", terms_version: TERMS_VERSION, onboarding_completed: true, onboarding_step: 6, nickname: "Luis", interests: [] },
          service_ready: true, special_account: { unlimited: true, welcome: WELCOME },
        } });
      if (action === "ai_usage") return route.fulfill({ json: { percent: 0, blocked: false, resets_at: null, messages_left: null, unlimited: true, modes: [{ id: "normal", percent: 0 }] } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto("/chat");
    const banner = page.getByRole("status").filter({ hasText: WELCOME });
    await expect(banner).toBeVisible();
    await page.screenshot({ path: `test-results/loyola-${viewport.width}.png` });
    await banner.getByRole("button", { name: "Entendido" }).click();
    await expect(banner).toHaveCount(0);
    await expect.poll(() => seen.length).toBe(1);
  });
}
