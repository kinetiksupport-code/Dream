import { test, expect, type Page } from "@playwright/test";
import { mock, CONSENT_PENDING } from "./design-fixture";
// Login states and the sign-up consent step (Parte D). The `consent` action is
// only designed (docs/CONSENTIMIENTO.md): here it is answered by the fixture.
test.use({ serviceWorkers: "block" });

const AI = /Estoy de acuerdo en enviar mi información a proveedores de IA/;
const GUARDIAN = /Mi padre, madre o tutor legal me ha dado permiso/;
const birth = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years, d.getMonth(), d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
async function welcome(page: Page, path = "/chat") {
  await mock(page, { profile: CONSENT_PENDING });
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Antes de empezar" }),
  ).toBeVisible();
}
const consentRequests = (page: Page) => {
  const sent: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/dream-api")) {
      const body = r.postDataJSON();
      if (body?.action === "consent") sent.push(body);
    }
  });
  return sent;
};

test.describe("registro: casillas de consentimiento", () => {
  test("nothing is ticked in advance and the guardian box waits for the age", async ({
    page,
  }) => {
    await welcome(page);
    await expect(page.getByRole("checkbox", { name: AI })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: GUARDIAN })).toHaveCount(0);
    await expect(page.getByLabel("Fecha de nacimiento")).toHaveValue("");
  });

  test("it does not let you continue and focuses the first error, with its cause", async ({
    page,
  }) => {
    const sent = consentRequests(page);
    await welcome(page);
    await page.getByRole("button", { name: "Empezar" }).click();
    const date = page.getByLabel("Fecha de nacimiento");
    await expect(date).toBeFocused();
    await expect(date).toHaveAttribute("aria-invalid", "true");
    await expect(date).toHaveAccessibleDescription(
      /Escribe tu fecha de nacimiento/,
    );
    const ai = page.getByRole("checkbox", { name: AI });
    await expect(ai).toHaveAttribute("aria-invalid", "true");
    await expect(ai).toHaveAccessibleDescription(/Dream no puede responderte/);
    // Errors carry an icon next to the text, not colour alone.
    await expect(
      page.locator("p", { hasText: "Dream no puede responderte" }).locator("svg"),
    ).toHaveCount(1);
    expect(sent).toEqual([]);
    // Still no chat behind it.
    await expect(
      page.getByRole("textbox", { name: "Mensaje para Dream" }),
    ).toHaveCount(0);
  });

  test("under 14 sees the guardian box; 14 or older does not", async ({
    page,
  }) => {
    await welcome(page);
    const date = page.getByLabel("Fecha de nacimiento");
    await date.fill(birth(12));
    const guardian = page.getByRole("checkbox", { name: GUARDIAN });
    await expect(guardian).toBeVisible();
    await expect(guardian).not.toBeChecked();
    await guardian.check();
    await date.fill(birth(16));
    await expect(guardian).toHaveCount(0);
    // Back under 14: it comes back unticked, never pre-marked.
    await date.fill(birth(13));
    await expect(page.getByRole("checkbox", { name: GUARDIAN })).not.toBeChecked();
  });

  test("a minor without the guardian box is stopped at that box; then it saves", async ({
    page,
  }) => {
    const sent = consentRequests(page);
    await welcome(page);
    await page.getByLabel("Fecha de nacimiento").fill(birth(12));
    await page.getByRole("checkbox", { name: AI }).check();
    await page.getByRole("button", { name: "Empezar" }).click();
    const guardian = page.getByRole("checkbox", { name: GUARDIAN });
    await expect(guardian).toBeFocused();
    await expect(guardian).toHaveAccessibleDescription(/menos de 14 años/);
    expect(sent).toEqual([]);
    // Tapping the text ticks the box (the whole row is the label).
    await page.getByText(GUARDIAN).click();
    await expect(guardian).toBeChecked();
    await expect(guardian).not.toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(
      page.getByRole("textbox", { name: "Mensaje para Dream" }),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      action: "consent",
      birth_date: birth(12),
      guardian_confirmed: true,
      ai_consent: true,
    });
  });

  test("14 or older saves with the AI box only", async ({ page }) => {
    const sent = consentRequests(page);
    await welcome(page);
    await page.getByLabel("Fecha de nacimiento").fill(birth(16));
    await page.getByRole("checkbox", { name: AI }).check();
    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(
      page.getByRole("textbox", { name: "Mensaje para Dream" }),
    ).toBeVisible();
    expect(sent[0]).toMatchObject({ guardian_confirmed: false, ai_consent: true });
  });

  test("chat, apuntes and exámenes are closed; Ajustes stays open", async ({
    page,
  }) => {
    await welcome(page, "/notes");
    await page.goto("/exams");
    await expect(
      page.getByRole("heading", { name: "Antes de empezar" }),
    ).toBeVisible();
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Antes de empezar" }),
    ).toHaveCount(0);
  });

  test("today's dream-api (no consent fields) keeps the app as it was", async ({
    page,
  }) => {
    await mock(page);
    await page.goto("/chat");
    await expect(
      page.getByRole("textbox", { name: "Mensaje para Dream" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Antes de empezar" }),
    ).toHaveCount(0);
  });

  test("boxes and links have 44 px targets; links go to Términos and Política", async ({
    page,
  }) => {
    await welcome(page);
    await page.getByLabel("Fecha de nacimiento").fill(birth(12));
    // Measure the boxes at rest: mid-entrance (@starting-style rise) the
    // transformed box can read 43.9999 px (float rounding of a fractional y).
    await page.waitForFunction(() => document.getAnimations().length === 0);
    for (const name of [AI, GUARDIAN]) {
      const box = page.getByRole("checkbox", { name });
      const input = await box.boundingBox();
      expect(input!.width).toBeGreaterThanOrEqual(44);
      expect(input!.height).toBeGreaterThanOrEqual(44);
      const row = await box.locator("xpath=ancestor::label").boundingBox();
      expect(row!.height).toBeGreaterThanOrEqual(44);
    }
    const terms = page.getByRole("link", { name: /Términos y condiciones/ });
    const privacy = page.getByRole("link", { name: /Política de privacidad/ });
    await expect(terms).toHaveAttribute("href", "/terminos");
    await expect(privacy).toHaveAttribute("href", "/privacidad");
    for (const link of [terms, privacy]) {
      await expect(link).toHaveAttribute("target", "_blank");
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("a failed save says so and offers «Volver a intentarlo»", async ({
    page,
  }) => {
    await welcome(page);
    await page.route("**/functions/v1/dream-api", async (route) => {
      if (route.request().postDataJSON()?.action !== "consent")
        return route.fallback();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo guardar tu respuesta." }),
      });
    });
    await page.getByLabel("Fecha de nacimiento").fill(birth(16));
    await page.getByRole("checkbox", { name: AI }).check();
    await page.getByRole("button", { name: "Empezar" }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("No se pudo guardar tu respuesta.");
    await expect(
      alert.getByRole("button", { name: "Volver a intentarlo" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: AI })).toBeChecked();
  });

  test("reduced motion: the guardian box fades in without moving", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await welcome(page);
    await page.getByLabel("Fecha de nacimiento").fill(birth(12));
    const props = await page
      .getByRole("checkbox", { name: GUARDIAN })
      .evaluate((el) => {
        const wrap = el.closest("label")!.parentElement!;
        return getComputedStyle(wrap).transitionProperty;
      });
    expect(props).not.toMatch(/transform/);
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
    // Measure after the entrance (the button rises in with the rest).
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );
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
