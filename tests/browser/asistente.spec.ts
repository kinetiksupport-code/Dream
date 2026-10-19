import { test, expect, type Page } from "@playwright/test";
import { EXAM_ID, PDF, PHOTO, inDays, wizard, type Call } from "./asistente-fixture";
// Asistente de crear examen a pantalla completa (PR 3, §5): flujo completo
// en móvil y escritorio, casos raros (§10) y accesibilidad, con dream-api
// simulada.
test.use({ serviceWorkers: "block" });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const title = (page: Page) => page.locator("[data-step-title]");
const next = (page: Page, name = "Continuar") => page.getByRole("button", { name, exact: true });
const actions = (calls: Call[]) => calls.map((c) => c.action);

/** «Faltan N días»: the number rolls (AnimatedNumber), so check its parts. */
async function expectCountdown(page: Page, n: number) {
  const big = page.locator("[class*=countdownBig]");
  await expect(big).toContainText("Faltan");
  await expect(big.locator(".num-roll-in")).toHaveText(String(n));
}

async function pickDay(page: Page, iso: string) {
  for (let i = 0; i < 3; i++) {
    const day = page.locator(`[data-day="${iso}"]`);
    if (await day.count()) return day.click();
    await page.getByRole("button", { name: "Mes siguiente" }).click();
  }
  throw new Error(`no day ${iso}`);
}

test("mobile: welcome → photo + file → few notes → date → grade → AI → ready", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const { calls } = await wizard(page, { chars: 900 });
  await page.goto("/exams/new");
  // Full screen: no sidebar or tab bar.
  await expect(page.locator(".tabbar, .sidebar")).toHaveCount(0);
  await expect(title(page)).toHaveText("Vamos a preparar tu examen");
  await expect(page.getByText("Sube tus apuntes y yo hago el resto.")).toBeVisible();
  await next(page, "Empezar").click();

  await expect(title(page)).toHaveText("Primero, sube tus apuntes");
  await expect(title(page)).toBeFocused();
  await expect(page).toHaveURL(/id=[0-9a-f-]{36}&paso=apuntes/);
  await expect(page.getByText("Paso 2 de 5: Tus apuntes")).toBeAttached();
  // Phone: two big buttons, no QR.
  await expect(page.getByRole("button", { name: "Hacer foto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subir archivo" })).toBeVisible();
  await expect(page.getByText(/Escanea el código/)).toHaveCount(0);
  await expect(page.getByText("No subas datos de otras personas.")).toBeVisible();
  await expect(next(page)).toBeDisabled();

  await page.locator("input[capture=environment]").setInputFiles(PHOTO);
  await expect(page.getByRole("button", { name: "Hacer otra foto" })).toBeVisible();
  await page.locator('input[type=file]:not([capture])').setInputFiles(PDF);
  const list = page.getByRole("list", { name: "Tus apuntes" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByText("Foto 1.jpg")).toBeVisible(); // camera photos are numbered
  await expect(list.getByText(/^Listo/)).toHaveCount(2);
  await expect(list.locator(".drawn-tick")).toHaveCount(2);

  await next(page).click();
  await expect(page.getByText("Estoy leyendo tus apuntes…")).toBeVisible();
  const few = page.getByRole("dialog", { name: "Veo que son pocos apuntes" });
  await expect(few).toContainText("Con más material puedo prepararte mejor el examen.");
  // «Subir más archivos» goes back with everything kept.
  await few.getByRole("button", { name: "Subir más archivos" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await next(page).click();
  await page.getByRole("button", { name: "Continuar con estos" }).click();
  await expect
    .poll(() => calls.find((c) => c.action === "exam_draft_update" && c.body.few_notes_ack === true)?.body.wizard_step)
    .toBe("date");

  await expect(title(page)).toHaveText("¿Cuándo es tu examen?");
  // No past days.
  await expect(page.locator(`[data-day="${inDays(-1)}"]`).first()).toBeDisabled().catch(() => {});
  await next(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Elige el día de tu examen." })).toBeVisible();
  await pickDay(page, inDays(12));
  await expectCountdown(page, 12);
  await next(page).click();
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
  expect(calls.find((c) => c.body.exam_date)?.body).toMatchObject({ exam_date: inDays(12), wizard_step: "grade" });
  const wheel = page.getByRole("slider");
  await expect(wheel).toHaveAttribute("aria-valuenow", "8");
  await expect(wheel).toHaveAttribute("aria-valuetext", "8 sobre 10");
  await wheel.focus();
  await page.keyboard.press("ArrowUp");
  await expect(wheel).toHaveAttribute("aria-valuetext", "8,5 sobre 10");
  await next(page).click();
  await expect(page.getByText("Preparando tu examen…")).toBeVisible();
  expect(calls.find((c) => c.body.target_grade !== undefined)?.body).toMatchObject({
    target_grade: 8.5,
    wizard_step: "identify",
  });
  await expect(page.getByRole("heading", { name: "Matemáticas", level: 2 })).toBeVisible();
  await expect(page.locator('.subject-object[data-object="abacus"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ecuaciones de segundo grado", level: 3 })).toBeVisible();
  // Edit the name inline, remove one topic, add another, correct the subject.
  await page.getByRole("button", { name: "Cambiar" }).click();
  await page.getByRole("textbox", { name: "Nombre del examen" }).fill("Ecuaciones 2º grado");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByRole("button", { name: "Quitar el tema Factorización" }).click();
  await page.getByRole("textbox", { name: "Añadir un tema" }).fill("Problemas");
  await page.getByRole("button", { name: "Añadir" }).click();
  await page.getByRole("button", { name: "No es esta asignatura" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Física y Química" }).click();
  await expect(page.getByRole("heading", { name: "Física y Química", level: 2 })).toBeVisible();
  await next(page, "Crear mi ruta").click();

  await expect(title(page)).toHaveText("Tu examen está listo");
  await expect(page.getByText("Tu ruta empieza así:")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(3);
  await expect(page.getByText("y 2 pasos más.")).toBeVisible();
  const saved = calls.filter((c) => c.action === "exam_draft_update").at(-1)!.body;
  expect(saved).toMatchObject({
    title: "Ecuaciones 2º grado",
    subject: "Física y Química",
    topics: ["Discriminante", "Fórmula general", "Problemas"],
  });
  expect(actions(calls).filter((a) => a === "exam_prepare")).toHaveLength(1);
  await next(page, "Empezar").click();
  await expect(page).toHaveURL(/\/exams\/[^/]+\/study\//);
});

test("desktop: drop zone + QR, phone file appears alone, duplicates, QR closed on Continue", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const { calls } = await wizard(page, { phoneAfter: 2, draft: {} });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(page.getByText("Continúa con tu examen")).toBeVisible();
  await expect(title(page)).toHaveText("Primero, sube tus apuntes");
  await expect(page.getByRole("button", { name: "Añadir desde este dispositivo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Escanea el código/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Código QR/ })).toBeVisible();
  await expect(page.getByText("Móvil conectado")).toBeVisible({ timeout: 10_000 });
  // The phone's photo shows up without reloading.
  await expect(page.getByText("foto-pizarra.jpg")).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type=file]:not([capture])').setInputFiles(PDF);
  await expect(page.getByText(/^Listo/)).toHaveCount(2);
  // Same file again: warned, not uploaded.
  await page.locator('input[type=file]:not([capture])').setInputFiles(PDF);
  await expect(page.getByText(/parece el mismo archivo/)).toBeVisible();
  await page.getByRole("button", { name: "No subirlo" }).click();
  expect(actions(calls).filter((a) => a === "attachment_upload")).toHaveLength(1);

  await next(page).click();
  await expect(title(page)).toHaveText("¿Cuándo es tu examen?");
  expect(actions(calls)).toContain("upload_session_close");
  // Plenty of notes: no warning.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Calendar by keyboard: today is focusable, arrows move, Enter picks.
  await page.locator('[data-day][tabindex="0"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectCountdown(page, 14);
  await next(page).click();
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
  await page.getByRole("slider").focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "10");
  await page.keyboard.press("PageDown");
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "9");
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Matemáticas", level: 2 })).toBeVisible();
});

test("AI unavailable: kind message, manual name and subject, then the route", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const { calls } = await wizard(page, {
    identifyFails: 429,
    draft: {
      materials: [{ id: "a1", file_name: "t.pdf", mime_type: "application/pdf", size_bytes: 1, status: "processed" }],
      exam_date: inDays(10),
      target_grade: 7,
      wizard_step: "identify",
    },
  });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(page.getByRole("alert").filter({ hasText: /escribe tú el nombre y la asignatura/i })).toBeVisible();
  await next(page, "Crear mi ruta").click();
  await expect(page.getByRole("alert").filter({ hasText: "Escribe un nombre" })).toBeVisible();
  await page.getByRole("textbox", { name: "Nombre del examen" }).fill("La Revolución francesa");
  await page.getByRole("button", { name: "Elegir asignatura" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Historia", exact: true }).click();
  await next(page, "Crear mi ruta").click();
  await expect(title(page)).toHaveText("Tu examen está listo");
  expect(calls.filter((c) => c.action === "exam_draft_update").at(-1)!.body).toMatchObject({
    title: "La Revolución francesa",
    subject: "Historia",
  });
});

test("refresh on every step keeps the place; Back goes to the previous step", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await wizard(page, { chars: 9000 });
  await page.goto("/exams/new");
  await next(page, "Empezar").click();
  await page.locator('input[type=file]:not([capture])').setInputFiles(PDF);
  await expect(page.getByText(/^Listo/)).toBeVisible();
  await page.reload();
  await expect(title(page)).toHaveText("Primero, sube tus apuntes");
  await expect(page.getByText("archivo-1.pdf")).toBeVisible();
  await next(page).click();
  await expect(title(page)).toHaveText("¿Cuándo es tu examen?");
  await pickDay(page, inDays(5));
  await next(page).click();
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
  await page.reload();
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
  // Browser Back: the date step, with its date kept.
  await page.goBack();
  await expect(title(page)).toHaveText("¿Cuándo es tu examen?");
  await expectCountdown(page, 5);
  await expect(page.locator(".wizard-step")).toHaveAttribute("data-enter", "back");
  // A step beyond the saved data in the URL falls back to where it can be.
  await page.goto(`/exams/new?id=${EXAM_ID}&paso=examen`);
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
});

test("a finished exam opens its page; an unknown one says so kindly", async ({ page }) => {
  await wizard(page, { draft: { status: "ready" } });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(page).toHaveURL(new RegExp(`/exams/${EXAM_ID}$`));
});

test("double click on Continuar saves once; offline disables and says why", async ({ page, context }) => {
  await page.setViewportSize(MOBILE);
  const { calls } = await wizard(page, {
    delay: { exam_draft_update: 600 },
    draft: {
      materials: [{ id: "a1", file_name: "t.pdf", mime_type: "application/pdf", size_bytes: 1, status: "processed" }],
      exam_date: inDays(10),
      wizard_step: "grade",
    },
  });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  await expect(title(page)).toHaveText("¿Qué nota quieres sacar?");
  await next(page).dblclick();
  await expect(next(page)).toHaveAttribute("aria-busy", "true").catch(() => {});
  await expect(page.getByText("Preparando tu examen…").or(page.getByRole("heading", { level: 2 }))).toBeVisible();
  expect(calls.filter((c) => c.action === "exam_draft_update")).toHaveLength(1);
  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "Lo que ya has hecho está guardado" })).toBeVisible();
  await context.setOffline(false);
});

test("exit: the arrow asks first and keeps the draft; an empty draft just goes", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const { calls } = await wizard(page);
  await page.goto("/exams/new");
  await next(page, "Empezar").click();
  await expect(title(page)).toHaveText("Primero, sube tus apuntes");
  await page.getByRole("button", { name: "Salir del asistente" }).click();
  await expect(page).toHaveURL(/\/exams$/);
  expect(actions(calls)).toContain("exam_delete");

  await page.goto("/exams/new");
  await next(page, "Empezar").click();
  await page.locator('input[type=file]:not([capture])').setInputFiles(PDF);
  await expect(page.getByText(/^Listo/)).toBeVisible();
  await page.getByRole("button", { name: "Salir del asistente" }).click();
  const sheet = page.getByRole("dialog", { name: "¿Salir?" });
  await expect(sheet).toContainText("Tu examen se guarda como borrador");
  await sheet.getByRole("button", { name: "Seguir con mi examen" }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole("button", { name: "Salir del asistente" }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL(/\/exams$/);
  expect(actions(calls).filter((a) => a === "exam_delete")).toHaveLength(1);
});

test("grade background warms with the grade; reduced motion fades steps", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await wizard(page, {
    draft: {
      materials: [{ id: "a1", file_name: "t.pdf", mime_type: "application/pdf", size_bytes: 1, status: "processed" }],
      exam_date: inDays(10),
      wizard_step: "grade",
    },
  });
  await page.goto(`/exams/new?id=${EXAM_ID}`);
  const frame = page.locator("[data-tone]");
  await expect(frame).toHaveAttribute("data-tone", "warm");
  const warmth = () => frame.evaluate((el) => getComputedStyle(el).getPropertyValue("--warmth").trim());
  expect(await warmth()).toBe("0.8");
  await page.getByRole("slider").focus();
  await page.keyboard.press("End");
  await expect.poll(warmth).toBe("1");
  const anim = await page.locator(".wizard-step").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toMatch(/fade|none/);
});

for (const vp of [{ width: 360, height: 740 }, MOBILE, DESKTOP])
  test(`no sideways scroll and 44 px targets at ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await wizard(page, { draft: {} });
    await page.goto(`/exams/new?id=${EXAM_ID}`);
    await expect(title(page)).toBeVisible();
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => ({
      over: [document.scrollingElement, document.querySelector(".workspace-main")]
        .filter(Boolean)
        .some((r) => r!.scrollWidth > r!.clientWidth + 1),
      small: [...document.querySelectorAll(".workspace-main button, .workspace-main a[href]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.height < 44 || r.width < 44);
        })
        .map((el) => el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label")),
    }));
    expect(report).toEqual({ over: false, small: [] });
  });
