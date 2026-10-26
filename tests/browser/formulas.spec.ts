import { test, expect, type Page } from "@playwright/test";
import { TERMS_VERSION } from "../../lib/consent";

// Fórmulas en el chat (caso «fracción generatriz», 22/10/2026): cada fórmula
// se ve una sola vez y bien colocada, y al copiar sale «246/100», no
// «246100100246». Servidor simulado: no se llama a Supabase ni a dream-api.
const KEY = "sb-cxaujyagtpsxvkwkdxbc-auth-token";
const CID = "12345678-1234-4234-8234-123456789abc";
const ANSWER = String.raw`Mira: \(2,46 = \frac{246}{100} = \frac{123}{50}\) y \(1,2\overline{3} = \dfrac{123 - 12}{90}\).

También \(\sqrt{2}\), \(x^{2}\) y \(a_{n}\).

$$\frac{37}{30}$$`;

async function open(page: Page) {
  await page.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: "synthetic.token",
          refresh_token: "synthetic",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "a@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
        }),
      ),
    { key: KEY },
  );
  await page.route("**/functions/v1/dream-api", (route) => {
    const action = String((route.request().postDataJSON() as { action?: string }).action);
    if (action === "profile")
      return route.fulfill({
        json: {
          profile: {
            email: "a@example.test", display_name: "Alex", age_band: "18_plus", ai_consent_at: "2026-10-01T00:00:00Z",
            terms_accepted_at: "2026-10-01T00:00:00Z", terms_version: TERMS_VERSION, onboarding_completed: true, onboarding_step: 6,
            nickname: "Alex", interests: [],
          },
          service_ready: true,
        },
      });
    if (action === "conversations") return route.fulfill({ json: { items: [{ id: CID, title: "Fracciones", updated_at: "2026-10-26T00:00:00Z" }] } });
    if (action === "messages")
      return route.fulfill({ json: { items: [{ id: "u", role: "user", content: "fracción generatriz" }, { id: "a", role: "assistant", content: ANSWER }] } });
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto(`/chat?c=${CID}`);
  await expect(page.locator(".katex").first()).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`each formula shows once, laid out, at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    // La copia MathML (para lectores de pantalla) está oculta de verdad.
    const hidden = await page.locator(".katex-mathml").first().evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.position === "absolute" && r.width <= 1 && r.height <= 1;
    });
    expect(hidden).toBe(true);
    // Numerador encima del denominador.
    const frac = page.locator(".katex-html .mfrac").first();
    const [top, bottom] = await frac.evaluate((el) => {
      const rows = [...el.querySelectorAll(".vlist > span")].filter((s) => s.textContent?.trim());
      const num = rows.find((s) => s.textContent?.trim() === "246")!.getBoundingClientRect().top;
      const den = rows.find((s) => s.textContent?.trim() === "100")!.getBoundingClientRect().top;
      return [num, den];
    });
    expect(top).toBeLessThan(bottom);
    await page.screenshot({ path: `test-results/formulas-${viewport.width}.png` });
  });
}

test("copying an answer gives readable formulas", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const paragraph = page.locator(".markdown p").filter({ hasText: "Mira" }).last();
  await paragraph.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("2,46 = 246/100 = 123/50");
  expect(copied).toContain("(123 - 12)/90");
  expect(copied).not.toMatch(/246100|100246/);
});

test("the «Copiar» button gives readable formulas too", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.getByRole("button", { name: /Copiar/ }).last().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("2,46 = 246/100 = 123/50");
  expect(copied).toContain("√2");
  expect(copied).not.toMatch(/\\frac|246100/);
});
