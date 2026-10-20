import { expect, test, type Page } from "@playwright/test";
import { mock } from "./design-fixture";

// Entrada a la actividad de sintagmas desde el chat (prompt «sintagmas» §1).
const shots = process.env.CAPTURAS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}
const desktop = { width: 1280, height: 800 };

test.describe("sintagmas · entrada", () => {
  async function chatWithMarker(page: Page) {
    await mock(page);
    await page.route("**/functions/v1/dream-api", async (route) => {
      const b = route.request().postDataJSON();
      if (b.action !== "messages") return route.fallback();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            { id: "u1", role: "user", content: "Necesito ayuda con los sintagmas" },
            { id: "a1", role: "assistant", content: "¡Vamos a practicarlos!\n\n<!--DREAM_ACTION:SINTAGMAS-->" },
          ],
          next_offset: null,
        }),
      });
    });
    await page.goto("/chat?c=33333333-3333-4333-8333-333333333333");
  }
  test("ordenador: tarjeta con Empezar que abre la actividad de esa conversación", async ({ page }) => {
    await page.setViewportSize(desktop);
    await chatWithMarker(page);
    const card = page.getByRole("link", { name: /Repasa los sintagmas/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Empezar");
    await expect(page.getByText("DREAM_ACTION")).toHaveCount(0);
    await expect(card).toHaveAttribute("href", "/sintagmas?c=33333333-3333-4333-8333-333333333333");
    await shot(page, "sintagmas-tarjeta-chat-escritorio-claro");
  });
  test("móvil: en el sitio de la tarjeta, el aviso de solo ordenador", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chatWithMarker(page);
    await expect(page.getByText("Esta experiencia solo se puede usar en un ordenador")).toBeVisible();
    await expect(page.getByRole("link", { name: /Repasa los sintagmas/ })).toHaveCount(0);
    await shot(page, "sintagmas-tarjeta-chat-movil-claro");
  });
});

test("«Más» lleva a la actividad", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/more");
  await expect(page.getByRole("link", { name: "Sintagmas" })).toHaveAttribute("href", "/sintagmas");
});
