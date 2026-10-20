import { test, expect, type Page } from "@playwright/test";
import { mock, atStep, CONSENT_PENDING, CONSENT_WITHDRAWN } from "./design-fixture";
import { TERMS_VERSION } from "../../lib/consent";
// Login states and the welcome for new students (prompt «bienvenida» §4).
// The welcome actions are only designed (docs/CONSENTIMIENTO.md): here the
// fixture answers them.
test.use({ serviceWorkers: "block" });

const AI = /Estoy de acuerdo en enviar mi información a proveedores de IA/;
const TERMS = /He leído y acepto los Términos y la Política de privacidad/;
const CHAT = { name: "Mensaje para Dream" };
const birth = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years, d.getMonth(), d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
async function open(page: Page, profile: Record<string, unknown> = CONSENT_PENDING, path = "/chat") {
  await mock(page, { profile });
  await page.goto(path);
}
const requests = (page: Page) => {
  const sent: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/dream-api")) {
      const body = r.postDataJSON();
      if (/^(onboarding_|consent)/.test(body?.action ?? "")) sent.push(body);
    }
  });
  return sent;
};
const title = (page: Page, name: RegExp | string) => page.getByRole("heading", { level: 1, name });
/** Waits for one-off animations (loops like the breathing orb never end). */
const settled = (page: Page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity),
  );
const next = (page: Page, name = "Continuar") => page.getByRole("button", { name }).click();

test.describe("bienvenida: usuario nuevo", () => {
  test("it replaces the whole app, Ajustes included; only «Salir»", async ({ page }) => {
    await open(page);
    await expect(title(page, /Hola! Soy Dream/)).toBeVisible();
    await expect(page.getByRole("textbox", CHAT)).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Paso anterior" })).toHaveCount(0);
    await expect(page.getByRole("progressbar", { name: "Progreso de la bienvenida" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    for (const path of ["/notes", "/exams", "/settings"]) {
      await page.goto(path);
      await expect(title(page, /Hola! Soy Dream/)).toBeVisible();
    }
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the whole flow saves each step and ends in the app", async ({ page }) => {
    const sent = requests(page);
    await open(page);
    await next(page, "Empezar");

    // Nombre: Google's name, editable; required with a kind error.
    const name = page.getByRole("textbox", { name: "Tu nombre" });
    await expect(title(page, /Cómo te llamas/)).toBeFocused();
    await expect(name).toHaveValue("Alex");
    await name.fill("  ");
    await next(page);
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription(/Escribe cómo te llamas/);
    await name.fill("Lucía");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await name.press("Enter");

    // Gustos: chips and a custom one.
    await expect(title(page, /Qué te gusta/)).toBeFocused();
    await expect(page.getByRole("button", { name: "Saltar" })).toBeVisible();
    await page.getByRole("button", { name: "Fútbol" }).click();
    await page.getByRole("button", { name: "Música" }).click();
    await expect(page.getByRole("button", { name: "Música" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Añadir otra" }).click();
    const custom = page.getByRole("textbox", { name: "Otra cosa que te guste" });
    await expect(custom).toBeFocused();
    await custom.fill("Ajedrez");
    await custom.press("Enter");
    await expect(page.getByRole("button", { name: "Ajedrez" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("3 de 8")).toBeVisible();
    await next(page);

    // Apodo: suggestions from the name, free text.
    await expect(title(page, /Cómo quieres que te llame la IA/)).toBeFocused();
    await expect(page.getByRole("button", { name: "Lucía" })).toBeVisible();
    await page.getByLabel("U otro nombre").fill("Lu");
    await next(page);

    // Edad: untouched wheels are not an answer.
    await expect(title(page, /Cuántos años tienes/)).toBeFocused();
    await expect(page.getByText("Sirve para saber si puedes usar Dream. No la usamos para nada más.")).toBeVisible();
    await next(page);
    await expect(page.locator("main").getByRole("alert")).toContainText("Mueve las ruedas");
    await page.getByRole("button", { name: "Escribir la fecha" }).click();
    await page.getByLabel("Fecha de nacimiento").fill(birth(16));
    await next(page);

    // Vas a hablar con una IA: nothing ticked; both needed.
    await expect(title(page, /Vas a hablar con una IA/)).toBeFocused();
    await expect(
      page.getByText("Dream funciona con inteligencia artificial. Estás hablando con una IA, no con una persona."),
    ).toBeVisible();
    const ai = page.getByRole("checkbox", { name: AI });
    const terms = page.getByRole("checkbox", { name: TERMS });
    await expect(ai).not.toBeChecked();
    await expect(terms).not.toBeChecked();
    await next(page, "Aceptar y seguir");
    await expect(ai).toBeFocused();
    await expect(ai).toHaveAccessibleDescription(/Dream no puede responderte/);
    await expect(terms).toHaveAttribute("aria-invalid", "true");
    await page.getByText(AI).click(); // the whole row is the label
    await expect(ai).toBeChecked();
    await expect(ai).not.toHaveAttribute("aria-invalid", "true");
    await next(page, "Aceptar y seguir");
    await expect(terms).toBeFocused();
    await terms.check();
    await next(page, "Aceptar y seguir");

    // ¡Listo, Lu!
    await expect(title(page, /Listo, Lu/)).toBeFocused();
    await next(page, "Ir a Dream");
    await expect(page.getByRole("textbox", CHAT)).toBeVisible();

    expect(sent.map((x) => x.action)).toEqual([
      "onboarding_save",
      "onboarding_save",
      "onboarding_save",
      "onboarding_save",
      "onboarding_age",
      "consent",
    ]);
    expect(sent[1]).toMatchObject({ step: 2, display_name: "Lucía" });
    expect(sent[2]).toMatchObject({ step: 3, interests: ["Fútbol", "Música", "Ajedrez"] });
    expect(sent[3]).toMatchObject({ step: 4, nickname: "Lu" });
    expect(sent[4]).toMatchObject({ action: "onboarding_age", birth_date: birth(16) });
    expect(sent[5]).toMatchObject({
      action: "consent",
      birth_date: birth(16),
      ai_consent: true,
      terms_accepted: true,
      terms_version: TERMS_VERSION,
    });
  });

  test("an empty nickname means the first name; back keeps what was written", async ({ page }) => {
    const sent = requests(page);
    await open(page, atStep(3, { display_name: "Javier Gómez" }));
    await expect(title(page, /Cómo quieres que te llame la IA/)).toBeVisible();
    await expect(page.getByText("Si lo dejas vacío, te llamaré Javier.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Javi", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Paso anterior" }).click();
    await expect(title(page, /Qué te gusta/)).toBeVisible();
    await page.getByRole("button", { name: "Paso anterior" }).click();
    await expect(page.getByRole("textbox", { name: "Tu nombre" })).toHaveValue("Javier Gómez");
    await next(page);
    await next(page, "Saltar");
    await expect(title(page, /Cómo quieres que te llame la IA/)).toBeVisible();
    await next(page);
    await expect(title(page, /Cuántos años tienes/)).toBeVisible();
    expect(sent.at(-1)).toMatchObject({ action: "onboarding_save", step: 4, nickname: "Javier" });
  });

  test("a reload resumes at the saved step", async ({ page }) => {
    await open(page, atStep(2, { interests: ["Moda"] }));
    await expect(title(page, /Qué te gusta/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Moda" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  test("up to 8 hobbies: the rest wait, with the reason", async ({ page }) => {
    await open(page, atStep(2));
    for (const x of ["Fútbol", "Baloncesto", "Música", "Videojuegos", "Dibujo", "Leer", "Baile", "Cocina"])
      await page.getByRole("button", { name: x, exact: true }).click();
    await expect(page.getByText("Ya tienes 8. Quita una para elegir otra.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Moda" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Añadir otra" })).toBeDisabled();
    await page.getByRole("button", { name: "Leer" }).click();
    await expect(page.getByRole("button", { name: "Moda" })).toBeEnabled();
  });

  test("the birth wheels work with the keyboard and read their value", async ({ page }) => {
    await open(page, atStep(4));
    const year = page.getByRole("slider", { name: "Año" });
    const month = page.getByRole("slider", { name: "Mes" });
    await expect(month).toHaveAttribute("aria-valuetext", "enero");
    await month.focus();
    await page.keyboard.press("ArrowDown");
    await expect(month).toHaveAttribute("aria-valuetext", "febrero");
    const before = Number(await year.getAttribute("aria-valuenow"));
    await year.focus();
    await page.keyboard.press("ArrowUp");
    await expect(year).toHaveAttribute("aria-valuenow", String(before - 1));
    await expect(page.getByText(`1 de febrero de ${before - 1}`)).toBeVisible();
    await next(page);
    await expect(title(page, /Vas a hablar con una IA/)).toBeVisible();
  });

  test("under 14: a kind goodbye, nothing kept, the session closes", async ({ page }) => {
    const sent = requests(page);
    await open(page, atStep(4, { display_name: "Pablo", interests: ["Fútbol"], nickname: "Pablito" }));
    await page.getByRole("button", { name: "Escribir la fecha" }).click();
    await page.getByLabel("Fecha de nacimiento").fill(birth(12));
    await next(page);
    await expect(title(page, /Dream es para mayores de 14 años/)).toBeFocused();
    await expect(page.getByText("¡Te esperamos!")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    expect(sent.map((x) => x.action)).toEqual(["onboarding_age"]);
    await next(page, "Salir");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a failed save says so and keeps the step", async ({ page }) => {
    await open(page, atStep(1));
    await page.route("**/functions/v1/dream-api", async (route) => {
      if (route.request().postDataJSON()?.action !== "onboarding_save") return route.fallback();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo guardar tu respuesta." }),
      });
    });
    await next(page);
    await expect(page.locator("main").getByRole("alert")).toContainText("No se pudo guardar tu respuesta.");
    await expect(page.getByRole("textbox", { name: "Tu nombre" })).toHaveValue("Alex");
  });

  test("44 px targets: chips, boxes, links, back and «Salir»", async ({ page }) => {
    await open(page, atStep(2));
    await settled(page);
    for (const el of [
      page.getByRole("button", { name: "Fútbol" }),
      page.getByRole("button", { name: "Añadir otra" }),
      page.getByRole("button", { name: "Paso anterior" }),
      page.getByRole("button", { name: "Salir" }),
    ])
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.goto("about:blank");
    await open(page, CONSENT_WITHDRAWN);
    await settled(page);
    for (const name of [AI, TERMS]) {
      const box = (await page.getByRole("checkbox", { name }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const [name, href] of [
      ["Términos", "/terminos"],
      ["Política de privacidad", "/privacidad"],
    ]) {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("reduced motion: steps and the reward only fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, CONSENT_WITHDRAWN);
    await page.getByRole("checkbox", { name: AI }).check();
    await page.getByRole("checkbox", { name: TERMS }).check();
    await next(page, "Aceptar y seguir");
    await expect(title(page, /Listo/)).toBeVisible();
    const moving = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation)
        .filter((a) => (a.effect as KeyframeEffect).getTiming().iterations !== Infinity)
        .filter((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => k.transform && k.transform !== "none"))
        .map((a) => (a as CSSAnimation).animationName),
    );
    expect(moving).toEqual([]);
  });
});

test.describe("bienvenida: después", () => {
  test("today's dream-api (no welcome fields) keeps the app as it was", async ({ page }) => {
    await mock(page);
    await page.goto("/chat");
    await expect(page.getByRole("textbox", CHAT)).toBeVisible();
    await expect(title(page, /Hola! Soy Dream/)).toHaveCount(0);
  });

  test("a withdrawn permission asks only the consent; Ajustes stays open", async ({ page }) => {
    await open(page, CONSENT_WITHDRAWN, "/notes");
    await expect(title(page, /Vas a hablar con una IA/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Paso anterior" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByText("Retirado. Dream no puede responderte.")).toBeVisible();
  });

  test("Ajustes › Perfil edits the name, nickname and hobbies", async ({ page }) => {
    const sent = requests(page);
    await open(page, { ...CONSENT_WITHDRAWN, ai_consent_at: "2026-10-20T10:00:00Z" }, "/settings");
    await expect(page.getByText("Música")).toBeVisible();
    await page.getByRole("button", { name: "Cambiar nombre, apodo y gustos" }).click();
    const dialog = page.getByRole("dialog", { name: "Tu perfil en Dream" });
    await dialog.getByLabel("Cómo quieres que te llame la IA").fill("Alexito");
    await dialog.getByRole("button", { name: "Fútbol" }).click();
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Alexito")).toBeVisible();
    expect(sent.at(-1)).toMatchObject({
      action: "onboarding_save",
      display_name: "Alex",
      nickname: "Alexito",
      interests: ["Música", "Fútbol"],
    });
  });

  test("Ajustes › Privacidad withdraws the AI permission after a warning", async ({ page }) => {
    const sent = requests(page);
    await open(page, { ...CONSENT_WITHDRAWN, ai_consent_at: "2026-10-20T10:00:00Z" }, "/settings");
    await page.getByRole("button", { name: "Retirar", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "¿Retirar el permiso?" });
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Retirar permiso" }).click();
    await expect(page.getByText("Retirado. Dream no puede responderte.")).toBeVisible();
    expect(sent.at(-1)).toMatchObject({ action: "consent_withdraw", kind: "ai" });
    await page.goto("/chat");
    await expect(title(page, /Vas a hablar con una IA/)).toBeVisible();
  });
});

test.describe("login: estados del botón de Google y mensajes", () => {
  const google = (page: Page) =>
    page.getByRole("button", { name: /Continuar con Google|Abriendo Google/ });

  test("rest, hover with a fine pointer, pressed and keyboard focus", async ({
    page,
  }) => {
    await page.goto("/login");
    const button = google(page);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute("aria-busy", "false");
    const bg = () =>
      button.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rest = await bg();
    await button.hover();
    await page.waitForTimeout(200);
    expect(await bg()).not.toBe(rest);
    await page.mouse.down();
    await page.waitForTimeout(220);
    expect(
      await button.evaluate((el) => getComputedStyle(el).transform),
    ).toBe("matrix(0.97, 0, 0, 0.97, 0, 0)");
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await button.focus();
    const ring = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(ring).toBe("solid 2px");
  });

  test("loading: aria-busy, ring and «Abriendo Google…», still focusable", async ({
    page,
  }) => {
    await page.route("**/auth/v1/settings", () => {}); // never answers
    await page.goto("/login");
    await google(page).click();
    const button = google(page);
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveText("Abriendo Google…");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    // aria-disabled, not `disabled`: the focus stays on the button.
    expect(await button.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(
      false,
    );
    expect(
      await button.evaluate(
        (el) => getComputedStyle(el.querySelector("span")!).animationName,
      ),
    ).toMatch(/spin/);
  });

  test("reduced motion: no press scale and the ring breathes instead of turning", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/auth/v1/settings", () => {});
    await page.goto("/login");
    const button = google(page);
    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect(
      await button.evaluate((el) => getComputedStyle(el).transform),
    ).toBe("none");
    await page.mouse.up();
    await expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      await button.evaluate(
        (el) => getComputedStyle(el.querySelector("span")!).animationName,
      ),
    ).toMatch(/breathe/);
  });

  test("disabled look while Dream is not ready", async ({ page }) => {
    await page.goto("/login");
    const button = google(page);
    // `ready` comes from the local session at once, so force the attribute
    // the page sets before that moment and check how it looks.
    const look = await button.evaluate((el) => {
      el.setAttribute("disabled", "");
      const s = getComputedStyle(el);
      return { opacity: s.opacity, cursor: s.cursor };
    });
    expect(look).toEqual({ opacity: "0.5", cursor: "not-allowed" });
  });

  test("error: icon + Spanish text + «Volver a intentarlo»", async ({ page }) => {
    await page.goto("/login?error=cancelled");
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("Has cancelado el acceso con Google.");
    await expect(alert.locator("svg").first()).toBeVisible();
    await expect(
      alert.getByRole("button", { name: "Volver a intentarlo" }),
    ).toBeVisible();
  });

  test("an expired session is a calm notice, not an error", async ({ page }) => {
    await page.goto("/login?expired=1");
    await expect(page.getByRole("status")).toContainText(
      "Tu sesión ha terminado. Entra para continuar.",
    );
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("legal links point to Términos and Política with 44 px targets", async ({
    page,
  }) => {
    await page.goto("/login");
    for (const [name, href] of [
      ["Términos y condiciones", "/terminos"],
      ["Política de privacidad", "/privacidad"],
    ]) {
      const link = page.getByRole("link", { name });
      await expect(link).toHaveAttribute("href", href);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(
      page.getByRole("heading", { level: 1, name: "Entrar en Dream" }),
    ).toBeVisible();
  });
});

test("the AI notice is fixed in the chat from the first message, also on phones", async ({
  page,
}) => {
  const notice = "Estás hablando con una IA. Puede equivocarse: contrasta lo importante.";
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await mock(page);
    await page.goto("/chat");
    await expect(page.getByText(notice)).toBeVisible();
    await page.goto("/chat?c=33333333-3333-4333-8333-333333333333");
    await expect(page.getByText("¿El 2 y el 3?")).toBeVisible();
    await expect(page.getByText(notice)).toBeVisible();
  }
});
