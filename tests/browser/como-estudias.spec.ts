import { test, expect, type Page } from "@playwright/test";
import { CONSENT_WITHDRAWN, mock } from "./design-fixture";
// Ajustes › Perfil › Cómo estudias (P4, docs/HABLA_NATURAL.md): todo
// opcional, de listas cerradas; lo que se guarda es exactamente lo elegido.
test.use({ serviceWorkers: "block" });
const SHOTS = process.env.CAPTURAS_DIR;

async function open(page: Page, viewport = { width: 1280, height: 860 }) {
  await page.setViewportSize(viewport);
  const saved: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/dream-api") && r.method() === "POST") {
      const b = r.postDataJSON();
      if (b?.action === "onboarding_save") saved.push(b);
    }
  });
  await mock(page, {
    profile: { ...CONSENT_WITHDRAWN, ai_consent_at: "2026-10-20T10:00:00Z", academic_level: null, study_profile: {} },
  });
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Ajustes" }).waitFor();
  return saved;
}

test("an empty study profile is optional and saves only what was chosen", async ({ page }) => {
  const saved = await open(page);
  const row = page.locator(".group-row", { hasText: "Cómo estudias" });
  await expect(row).toContainText("Sin rellenar");
  await page.getByRole("button", { name: "Cambiar cómo estudias" }).click();
  const dialog = page.getByRole("dialog", { name: "Cómo estudias" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Curso").selectOption("2º Bachillerato");
  for (const s of ["Matemáticas", "Física", "Química", "Historia"]) await dialog.getByRole("button", { name: s }).click();
  // Up to four: the rest are disabled.
  await expect(dialog.getByRole("button", { name: "Lengua" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Historia" }).click();
  await expect(dialog.getByRole("button", { name: "Lengua" })).toBeEnabled();
  await dialog.getByLabel("Tu objetivo").selectOption("Preparar la PAU");
  await dialog.getByLabel("Cómo prefieres que te expliquen").selectOption("Con ejemplos");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/como-estudias-escritorio.png` });
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  const { request_id: _id, ...body } = saved.at(-1) ?? {};
  expect(_id).toBeTruthy();
  expect(body).toEqual({
    action: "onboarding_save",
    academic_level: "2º Bachillerato",
    study_profile: { hard: ["Matemáticas", "Física", "Química"], goal: "Preparar la PAU", style: "Con ejemplos" },
  });
  await expect(row).toContainText("2º Bachillerato · le cuesta Matemáticas, Física, Química · Preparar la PAU");
});

test("phone: the sheet fits without sideways scroll, light and dark", async ({ browser }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme, serviceWorkers: "block" });
    const page = await context.newPage();
    await open(page, { width: 390, height: 844 });
    await page.getByRole("button", { name: "Cambiar cómo estudias" }).click();
    await expect(page.getByRole("dialog", { name: "Cómo estudias" })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    // Let the sheet finish entering before the picture.
    if (SHOTS) await page.waitForTimeout(600);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/como-estudias-movil-${colorScheme === "light" ? "claro" : "oscuro"}.png` });
    await context.close();
  }
});
