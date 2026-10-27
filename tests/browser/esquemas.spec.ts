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
    if (b.action === "scheme_update") return route.fulfill({ json: { scheme: { id: sid, updated_at: new Date().toISOString() }, content: b.content } });
    if (b.action === "scheme_refine") {
      const section = structuredClone(example.sections[b.section_index]);
      section.bullets = [...section.bullets, { text: "Viñeta añadida por la IA desde los apuntes.", quote: "" }];
      return route.fulfill({ json: { section } });
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
  await expect(page.locator("summary", { hasText: "Descargar" })).toBeVisible();
});

test("sin apuntes, «hazme un esquema» pide los apuntes sin llamar a la IA", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.getByLabel("Mensaje para Dream").fill("Hazme un esquema de la fotosíntesis");
  await page.getByLabel("Enviar mensaje").click();
  await expect(page.getByText("Para hacerte un esquema fiable necesito tus apuntes")).toBeVisible();
  expect(calls.some((c) => c.action === "chat" || c.action === "scheme_generate")).toBe(false);
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

test("editar: texto en su sitio, deshacer, color, «Ampliar» y guardado automático", async ({ page }) => {
  const calls: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  await api(page, calls);
  await page.goto(`/esquemas/${sid}`);
  await page.getByRole("button", { name: "Editar" }).click();
  const title = page.getByRole("textbox", { name: "Título del esquema" });
  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Al-Ándalus, mi esquema");
  await page.keyboard.press("Enter");
  await expect.poll(() => calls.filter((c) => c.action === "scheme_update").at(-1)?.content?.title, { timeout: 5000 }).toBe("Al-Ándalus, mi esquema");
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  // Deshacer vuelve al título original.
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(title).toHaveText(example.title);
  // Color de la primera tarjeta.
  const tools = page.getByRole("group", { name: /Editar la tarjeta «La fragmentación/ });
  await tools.getByRole("radio", { name: "Verde" }).click();
  await expect(tools.getByRole("radio", { name: "Verde" })).toHaveAttribute("aria-checked", "true");
  // «Ampliar» con la IA: añade la viñeta que devuelve el servidor.
  await tools.getByRole("button", { name: "Ampliar" }).click();
  await expect(page.getByText("Viñeta añadida por la IA desde los apuntes.")).toBeVisible();
  expect(calls.find((c) => c.action === "scheme_refine")?.mode).toBe("ampliar");
  await page.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("descargar: Markdown, HTML autónomo y PNG se generan en el navegador", async ({ page }) => {
  await api(page);
  await page.goto(`/esquemas/${sid}`);
  const menu = page.locator("summary", { hasText: "Descargar" });
  for (const [item, ext] of [["Texto (Markdown)", "md"], ["Página web (HTML)", "html"], ["Imagen (PNG)", "png"]] as const) {
    await menu.click();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
    expect(file.suggestedFilename()).toBe(`esquema-la-evolucion-de-al-andalus-tras-el-final-del-califato.${ext}`);
    const path = await file.path();
    const body = readFileSync(path!);
    if (ext === "md") expect(body.toString()).toContain("## Ideas clave");
    if (ext === "html") {
      const html = body.toString();
      expect(html).toContain("La fragmentación de al-Ándalus");
      expect(html).toContain("data:font/woff2;base64");
      expect(html).not.toContain("contenteditable");
    }
    if (ext === "png") expect(body.subarray(1, 4).toString()).toBe("PNG");
    await page.keyboard.press("Escape");
    await menu.evaluate((el) => (el.parentElement as HTMLDetailsElement).removeAttribute("open"));
  }
});
