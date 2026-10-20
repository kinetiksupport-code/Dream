import { expect, test, type Page } from "@playwright/test";
import { SENTENCES, mockSyntax } from "./sintagmas-fixture";
import { flatten } from "../../supabase/functions/dream-api/sintagmas.mjs";

// Actividad de sintagmas (prompt «sintagmas»). Con CAPTURAS_DIR guarda el
// flujo completo para la evidencia de diseño.
const shots = process.env.CAPTURAS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}
const desktop = { width: 1280, height: 800 };

/** Marca con el teclado: foco en la palabra, Mayús+→ para abarcar, Intro. */
async function mark(page: Page, start: number, end: number, label: string) {
  await page.locator("[data-word]").nth(start).focus();
  for (let i = start; i < end - 1; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Enter");
  await page
    .getByRole("group", { name: "Etiqueta de la raya" })
    .getByRole("button", { name: new RegExp(`^${label}:`) })
    .click();
}
/** Marca todo el análisis oficial de una frase de evals/sintagmas.json. */
async function solve(page: Page, n: number) {
  for (const m of flatten(SENTENCES[n].analysis)) await mark(page, m.start, m.end, m.label);
}
async function drag(page: Page, from: number, to: number) {
  const words = page.locator("[data-word]");
  const a = (await words.nth(from).boundingBox())!;
  const b = (await words.nth(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
}

test.describe("sintagmas · ordenador", () => {
  test.use({ viewport: desktop });

  test("tutorial al entrar: pasos, ejemplo, Esc, «?» y no volver a mostrarlo", async ({ page }) => {
    const calls = await mockSyntax(page, { order: [8] });
    await page.goto("/sintagmas");
    const dialog = page.getByRole("dialog", { name: "Cómo se marcan los sintagmas" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toBeFocused();
    await expect(dialog.locator("ol > li")).toHaveCount(4);
    await expect(dialog).toContainText("Arrastra sobre las palabras");
    await expect(dialog).toContainText("Elige la etiqueta");
    await expect(dialog).toContainText("Pulsa Comprobar");
    await expect(dialog).toContainText("marca primero el grande y luego el pequeño");
    await expect(dialog.getByRole("img", { name: /El perro de mi vecino/ })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "No volverme a mostrar este tutorial" })).not.toBeChecked();
    await shot(page, "sintagmas-tutorial-escritorio-claro");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Siempre se puede volver a ver con «?».
    await page.getByRole("button", { name: "Ver el tutorial" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("checkbox", { name: "No volverme a mostrar este tutorial" }).check();
    await dialog.getByRole("button", { name: "Entendido" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => calls.some((c) => c.action === "syntax_settings" && c.tutorial_hidden === true)).toBe(true);
    await page.reload();
    await expect(page.locator("[data-word]").first()).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test("antes de empezar: apuntes con «Cuantos más haya mejor», subir y Saltar", async ({ page }) => {
    const calls = await mockSyntax(page, { source: "standard", tutorialHidden: true, order: [1] });
    await page.goto("/sintagmas");
    await expect(page.getByRole("heading", { name: /apuntes o deberes antiguos/ })).toBeVisible();
    await expect(page.getByText("Cuantos más haya mejor.")).toBeVisible();
    await shot(page, "sintagmas-apuntes-escritorio-claro");
    await page.locator('input[type="file"]').setInputFiles({
      name: "deberes-sintagmas.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("GN: Det + N. El perro ladra."),
    });
    await expect(page.getByText("Listo")).toBeVisible();
    await page.getByRole("button", { name: "Usar estos apuntes" }).click();
    await expect(page.locator("[data-word]").first()).toBeVisible();
    const upload = calls.find((c) => c.action === "attachment_upload")!;
    const conventions = calls.find((c) => c.action === "syntax_conventions")!;
    expect(conventions.conversation_id).toBe(upload.conversation_id);
    expect(conventions.attachment_ids).toHaveLength(1);
    // Las convenciones del profesor mandan: GN en lugar de SN.
    await mark(page, 0, 2, "GN");
    await expect(page.getByRole("button", { name: /^GN, grupo nominal: El perro$/ })).toBeVisible();
  });

  test("Saltar usa las etiquetas estándar y lo dice con un aviso discreto", async ({ page }) => {
    await mockSyntax(page, { source: "standard", tutorialHidden: true, order: [1] });
    await page.goto("/sintagmas");
    await page.getByRole("button", { name: "Saltar" }).click();
    await expect(page.getByText("Uso las etiquetas estándar: SN, SV, SAdj, SAdv y SPrep.")).toBeVisible();
  });

  test("marcar con el ratón: raya azul al arrastrar, roja si cruza, gris sin etiqueta, doble clic", async ({ page }) => {
    await mockSyntax(page, { order: [8], tutorialHidden: true });
    await page.goto("/sintagmas");
    await drag(page, 0, 4);
    await expect(page.locator('[data-state="draft"]')).toHaveCount(1);
    await expect(page.locator('[data-word][data-active="draft"]')).toHaveCount(5);
    await shot(page, "sintagmas-arrastrar-escritorio-claro");
    await page.mouse.up();
    // Gris hasta que tiene etiqueta; las etiquetas salen junto a la raya.
    await expect(page.locator('[data-state="empty"]')).toHaveCount(1);
    const picker = page.getByRole("group", { name: "Etiqueta de la raya" });
    await expect(picker.getByRole("button", { name: /^SN: sintagma nominal$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprobar" })).toBeDisabled();
    await shot(page, "sintagmas-etiquetas-escritorio-claro");
    await picker.getByRole("button", { name: /^SN:/ }).click();
    await expect(page.locator('[data-state="labelled"]')).toHaveCount(1);
    // Cruzar «vecino ladra» con «El … vecino»: roja y no se suelta.
    await drag(page, 4, 5);
    await expect(page.locator('[data-state="bad"]')).toHaveCount(1);
    await shot(page, "sintagmas-cruce-escritorio-claro");
    await page.mouse.up();
    await expect(page.getByText("Las rayas no se pueden cruzar")).toBeVisible();
    await expect(page.locator('[data-state="bad"]')).toHaveCount(0);
    // Doble clic: una sola palabra.
    await page.locator("[data-word]").nth(5).dblclick();
    await picker.getByRole("button", { name: /^SV:/ }).click();
    await expect(page.getByRole("button", { name: /^SV, sintagma verbal: ladra$/ })).toBeVisible();
    // Deshacer y rehacer, con botón y con Ctrl+Z.
    await page.keyboard.press("Control+z");
    await expect(page.getByRole("button", { name: /^SV, sintagma verbal/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Rehacer" }).click();
    await expect(page.getByRole("button", { name: /^SV, sintagma verbal/ })).toHaveCount(1);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByRole("button", { name: /^SV, sintagma verbal/ })).toHaveCount(0);
  });

  test("asas para ajustar y Supr para borrar", async ({ page }) => {
    await mockSyntax(page, { order: [8], tutorialHidden: true });
    await page.goto("/sintagmas");
    await mark(page, 0, 2, "SN");
    await page.getByRole("button", { name: /^SN, sintagma nominal: El perro$/ }).click();
    const end = page.locator('[data-handle="end"]');
    const box = (await end.boundingBox())!;
    const target = (await page.locator("[data-word]").nth(4).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, box.y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: /^SN, sintagma nominal: El perro de mi vecino$/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^SN, sintagma nominal/ }).focus();
    await page.keyboard.press("Delete");
    await expect(page.getByRole("button", { name: /^SN, sintagma nominal/ })).toHaveCount(0);
  });

  test("Pista: primero dónde y qué falta, después cómo empieza la etiqueta", async ({ page }) => {
    const calls = await mockSyntax(page, { order: [8], tutorialHidden: true });
    await page.goto("/sintagmas");
    await page.getByRole("button", { name: "Pista" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aquí falta un sintagma." })).toBeVisible();
    await expect(page.locator("[data-word][data-hint]")).toHaveCount(5);
    await page.getByRole("button", { name: "Pista" }).click();
    await expect(page.getByText("su etiqueta empieza por «S…»")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pista" })).toBeDisabled();
    await shot(page, "sintagmas-pista-escritorio-claro");
    expect(calls.filter((c) => c.action === "syntax_hint").map((c) => c.level)).toEqual([1, 2]);
  });

  test("Comprobar: todo bien → ¡Perfecto!; con fallos → explicación y lo que faltaba", async ({ page }) => {
    await mockSyntax(page, { order: [2, 8], tutorialHidden: true });
    await page.goto("/sintagmas");
    await solve(page, 2);
    await page.getByRole("button", { name: "Comprobar" }).click();
    await expect(page.getByRole("heading", { name: "¡Perfecto! Todo bien marcado." })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progreso de la sesión" })).toHaveAttribute("aria-valuenow", "1");
    await shot(page, "sintagmas-perfecto-escritorio-claro");
    await page.getByRole("button", { name: "Siguiente frase" }).click();
    await expect(page.locator("[data-word]")).toHaveCount(6);
    await mark(page, 0, 5, "SN");
    await mark(page, 2, 5, "SN");
    await mark(page, 5, 6, "SV");
    await page.getByRole("button", { name: "Comprobar" }).click();
    await expect(page.getByRole("heading", { name: /^Bien: 2 de 10/ })).toBeVisible();
    await expect(page.getByText("Fíjate en la preposición")).toBeVisible();
    await expect(page.getByText("«de mi vecino» es un SPrep (sintagma preposicional), no SN.")).toBeVisible();
    await expect(page.getByText("esta frase volverá a salir más tarde")).toBeVisible();
    // Correcta con ✓, equivocada con ✗ (nunca solo color) y lo que faltaba, discontinuo.
    await expect(page.getByRole("button", { name: /^SN, sintagma nominal: El perro de mi vecino\. Correcto$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^SN, sintagma nominal: de mi vecino\. Revisar$/ })).toBeVisible();
    await expect(page.locator('[data-state="missing"]').first()).toBeVisible();
    await shot(page, "sintagmas-correccion-escritorio-claro");
  });

  test("fase avanzada: campo enfocado, autocompletado, recientes y Ver opciones", async ({ page }) => {
    await mockSyntax(page, { order: [8], tutorialHidden: true, phase: "write" });
    await page.goto("/sintagmas");
    await expect(page.getByText("Marca los sintagmas y escribe su etiqueta.")).toBeVisible();
    await page.locator("[data-word]").first().focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Enter");
    const input = page.getByRole("combobox", { name: "Escribe la etiqueta" });
    await expect(input).toBeFocused();
    await input.pressSequentially("s");
    const options = page.getByRole("option");
    await expect(options.first()).toHaveText("SN: sintagma nominal");
    await expect(options).toHaveCount(5);
    await shot(page, "sintagmas-escribir-escritorio-claro");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /^SN, sintagma nominal: El perro$/ })).toBeVisible();
    // Variantes: minúsculas, sin tildes, con paréntesis o el nombre completo.
    await page.locator("[data-word]").nth(5).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Últimas etiquetas usadas" })).toContainText("SN");
    await input.fill("(sintagma verbal)");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^SV, sintagma verbal: ladra$/ })).toBeVisible();
    await page.locator("[data-word]").nth(1).focus();
    await page.keyboard.press("Enter");
    await input.fill("nucleo");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^N, núcleo: perro$/ })).toBeVisible();
    await page.locator("[data-word]").nth(0).focus();
    await page.keyboard.press("Enter");
    await input.fill("xyz");
    await page.keyboard.press("Enter");
    await expect(page.getByText("No reconozco esa etiqueta.")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Raya sin etiqueta: El" }).click();
    await page.getByRole("button", { name: "Ver opciones" }).click();
    await expect(page.getByRole("group", { name: "Etiqueta de la raya" }).getByRole("button", { name: /^SN:/ })).toBeFocused();
  });

  test("adaptación: 5 frases bien → pasa a escribir con un mensaje positivo; resumen al final", async ({ page }) => {
    await mockSyntax(page, { order: [1, 2, 6], tutorialHidden: true });
    await page.goto("/sintagmas");
    const order = [1, 2, 6, 1, 2];
    for (const [i, n] of order.entries()) {
      await expect(page.locator("[data-word]")).toHaveCount(SENTENCES[n].words.length);
      if (i === 4) {
        // La última de la ventana con la fase fácil.
        await expect(page.getByText("Marca los sintagmas y elige su etiqueta.")).toBeVisible();
      }
      await solve(page, n);
      await page.getByRole("button", { name: "Comprobar" }).click();
      await expect(page.getByRole("heading", { name: "¡Perfecto! Todo bien marcado." })).toBeVisible();
      if (i < order.length - 1) await page.getByRole("button", { name: "Siguiente frase" }).click();
    }
    await expect(page.getByRole("status").filter({ hasText: "¡Lo dominas! Ahora escribe tú las etiquetas." })).toBeVisible();
    await shot(page, "sintagmas-cambio-fase-escritorio-claro");
    await page.getByRole("button", { name: "Siguiente frase" }).click();
    await expect(page.getByText("Marca los sintagmas y escribe su etiqueta.")).toBeVisible();
  });

  test("resumen: qué dominas, qué repasar, Repetir y volver al chat", async ({ page }) => {
    await mockSyntax(page, { order: [2], tutorialHidden: true });
    await page.goto("/sintagmas?c=33333333-3333-4333-8333-333333333333");
    for (let i = 0; i < 8; i++) {
      // Siempre «Marta canta»: el SN bien y el SV con la etiqueta equivocada.
      await mark(page, 0, 1, "SN");
      await mark(page, 0, 1, "N");
      await mark(page, 1, 2, "SAdv");
      await mark(page, 1, 2, "N");
      await page.getByRole("button", { name: "Comprobar" }).click();
      await page.getByRole("button", { name: i < 7 ? "Siguiente frase" : "Ver mi resumen" }).click();
    }
    await expect(page.getByRole("heading", { name: "¡Sesión terminada!" })).toBeVisible();
    await expect(page.locator("section").filter({ hasText: "Lo que dominas" })).toContainText("SN (sintagma nominal)");
    await expect(page.locator("section").filter({ hasText: "Para repasar" })).toContainText("SV (sintagma verbal)");
    await expect(page.getByRole("link", { name: "Volver al chat" })).toHaveAttribute("href", "/chat?c=33333333-3333-4333-8333-333333333333");
    await shot(page, "sintagmas-resumen-escritorio-claro");
    await page.getByRole("button", { name: "Repetir" }).click();
    await expect(page.locator("[data-word]").first()).toBeVisible();
  });

  test("backend sin desplegar: lo dice y deja volver", async ({ page }) => {
    await mockSyntax(page, { unavailable: true });
    await page.goto("/sintagmas");
    await expect(page.getByRole("heading", { name: "No se pudo abrir la actividad" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al chat" })).toBeVisible();
  });

  test("modo oscuro y movimiento reducido: la demo del tutorial queda quieta", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await mockSyntax(page, { order: [8] });
    await page.goto("/sintagmas");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const cursor = dialog.locator('[class*="demoCursor"]');
    await expect(cursor).toBeHidden();
    // Ningún bucle dentro del tutorial.
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && !!target.closest('[role="dialog"]') && a.effect?.getTiming().iterations === Infinity;
        }).length,
    );
    expect(running).toBe(0);
    await shot(page, "sintagmas-tutorial-escritorio-oscuro-reducido");
    await dialog.getByRole("button", { name: "Entendido" }).click();
    await mark(page, 0, 5, "SN");
    await shot(page, "sintagmas-raya-escritorio-oscuro");
  });
});

test.describe("sintagmas · móvil y tableta", () => {
  test("en móvil no se abre: «Esta experiencia solo se puede usar en un ordenador»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const calls = await mockSyntax(page);
    await page.goto("/sintagmas");
    await expect(page.getByText("Esta experiencia solo se puede usar en un ordenador")).toBeVisible();
    await expect(page.locator("[data-word]")).toHaveCount(0);
    expect(calls.some((c) => String(c.action).startsWith("syntax_"))).toBe(false);
    await shot(page, "sintagmas-solo-ordenador-movil-claro");
  });
  test("tableta táctil ancha tampoco", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await mockSyntax(page);
    await page.goto("/sintagmas");
    await expect(page.getByText("Esta experiencia solo se puede usar en un ordenador")).toBeVisible();
    await context.close();
  });
});
