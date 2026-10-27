import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mock } from "./design-fixture";
// Esquemas (docs/ESQUEMAS.md): del chat con apuntes adjuntos a la tarjeta
// «Dreams» y a la pantalla del esquema. API simulada; el esquema es el ejemplo
// de al-Ándalus que pasa el validador.
test.use({ serviceWorkers: "block" });

const sid = "55555555-5555-4555-8555-555555555555";
const aid = "77777777-7777-4777-8777-777777777777";
const example = JSON.parse(readFileSync("supabase/functions/dream-api/scheme-example.json", "utf8"));

async function api(page: import("@playwright/test").Page, calls: Record<string, unknown>[] = []) {
  await mock(page);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b);
    if (b.action === "attachment_upload")
      return route.fulfill({ json: { attachment: { id: aid, file_name: b.file_name, status: "processed" } } });
    if (b.action === "scheme_generate") {
      const widget = { type: "scheme", schemeId: sid, title: example.title, subject: example.subject, sections: example.sections.length };
      return route.fulfill({ json: { scheme: { id: sid, title: example.title }, widget,
        assistant_message: `He preparado tu esquema de **${example.title}**.\n\n<!--DREAM_WIDGET:${JSON.stringify(widget)}-->` } });
    }
    if (b.action === "scheme_get")
      return route.fulfill({ json: { scheme: { id: sid, title: example.title, subject: example.subject, content: example, created_at: "2026-10-27T08:00:00Z" } } });
    return route.fallback();
  });
}

test("chat con apuntes: «hazme un esquema» crea la tarjeta «Dreams» y abre el esquema", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.locator('.composer input[type="file"]').setInputFiles({ name: "tema2.txt", mimeType: "text/plain", buffer: Buffer.from("Al-Ándalus tras el califato…") });
  await page.getByLabel("Mensaje para Dream").fill("Hazme un esquema de estos apuntes");
  await expect(page.getByLabel("Enviar mensaje")).toBeEnabled();
  await page.getByLabel("Enviar mensaje").click();
  const card = page.locator('a.quiz-widget[data-kind="scheme"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Dreams · Esquema");
  await expect(card).toHaveAttribute("href", `/esquemas/${sid}`);
  const generate = calls.find((c) => c.action === "scheme_generate");
  expect(generate?.attachment_ids).toEqual([aid]);
  expect(calls.some((c) => c.action === "chat")).toBe(false);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/esquemas/${sid}$`));
  await expect(page.getByRole("heading", { level: 2, name: example.title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir o guardar PDF" })).toBeVisible();
});

test("sin apuntes, «hazme un esquema» va al chat normal", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.getByLabel("Mensaje para Dream").fill("Hazme un esquema de la fotosíntesis");
  await page.getByLabel("Enviar mensaje").click();
  await expect.poll(() => calls.some((c) => c.action === "chat")).toBe(true);
  expect(calls.some((c) => c.action === "scheme_generate")).toBe(false);
});

for (const width of [390, 1280])
  test(`pantalla del esquema a ${width} px: sin desbordes y con las 5 tarjetas`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await api(page);
    await page.goto(`/esquemas/${sid}`);
    await expect(page.getByRole("heading", { level: 2, name: example.title })).toBeVisible();
    await expect(page.locator("article section h3")).toHaveCount(7); // 5 secciones + ideas + resumen
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
