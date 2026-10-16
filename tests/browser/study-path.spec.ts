import { test, expect, type Page } from "@playwright/test";
import type { DreamExam } from "../../lib/exam-plans";
test.use({ serviceWorkers: "block" });
// Datos de ejemplo solo para este test; la API está simulada y el reloj fijo.
const eid = "11111111-1111-4111-8111-111111111111";
const cid = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-16T10:00:00");
const shots = process.env.CAPTURAS_DIR ?? "test-results/ruta";
const titles = [
  "El lenguaje del álgebra",
  "Ecuaciones de primer grado",
  "Signos y soluciones",
  "Factorización",
  "Practica y conecta",
];
const uid = (i: number) => `55555555-5555-4555-8555-55555555555${i}`;
const base: DreamExam = {
  id: eid,
  title: "Álgebra · primer trimestre",
  subject: "Matemáticas",
  exam_date: "2026-10-30",
  topics: ["Ecuaciones"],
  difficulties: "Los signos",
  goal: "Comprender",
  daily_minutes: 20,
  status: "ready",
  conversation_id: cid,
  plan_error: null,
  materials: [],
  sessions: [
    {
      id: "77777777-7777-4777-8777-777777777771",
      mode: "practice",
      status: "completed",
      started_at: "2026-10-14T10:00:00Z",
      submitted_at: "2026-10-14T10:20:00Z",
      unit_id: uid(1),
      percentage: 70,
    },
  ],
  units: titles.map((title, i) => ({
    id: uid(i),
    position: i,
    title,
    topic: ["Lenguaje algebraico", "Ecuaciones", "Signos", "Factorización", "Problemas"][i],
    summary: "Comprende la idea y comprueba tu razonamiento.",
    estimated_minutes: 20,
    status: i < 2 ? "completed" : i === 2 ? "in_progress" : "pending",
    conversation_id: i < 3 ? cid : null,
  })),
};
const expected =
  "Voy por el 40 % de mi ruta para Matemáticas: 2 de 5 temas. Siguiente: Signos y soluciones. Con Dream — edudream.es";

type Handler = (body: Record<string, unknown>) => unknown;
async function fixture(
  page: Page,
  {
    share = "clipboard",
    exam = base,
    exams,
    handlers = {},
  }: {
    share?: "native" | "clipboard";
    exam?: DreamExam;
    exams?: unknown[];
    handlers?: Record<string, Handler>;
  } = {},
) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((mode) => {
    localStorage.setItem(
      "sb-cxaujyagtpsxvkwkdxbc-auth-token",
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "66666666-6666-4666-8666-666666666666",
          email: "qa@example.test",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    const w = window as unknown as { shared: unknown[]; copied: string[] };
    w.shared = [];
    w.copied = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value:
        mode === "native"
          ? async (data: unknown) => {
              w.shared.push(data);
            }
          : undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.copied.push(text);
        },
      },
    });
  }, share);
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b);
    let response: unknown;
    if (handlers[b.action]) response = handlers[b.action](b);
    else
      switch (b.action) {
        case "profile":
          response = {
            profile: { email: "qa@example.test", display_name: "Alex" },
            service_ready: true,
          };
          break;
        case "conversations":
        case "messages":
          response = { items: [] };
          break;
        case "exams":
          response = {
            exams: exams ?? [{ ...exam, units: exam.units, materials: [] }],
            next_offset: null,
          };
          break;
        case "exam_get":
          response = { exam };
          break;
        case "exam_unit_start":
          response = {
            unit: {
              ...exam.units.find((u) => u.id === b.unit_id),
              status: "in_progress",
              conversation_id: cid,
            },
          };
          break;
        default:
          await route.fulfill({
            status: 400,
            json: { error: `Acción inesperada en fixture: ${b.action}` },
          });
          return;
      }
    await route.fulfill({ json: response });
  });
  return calls;
}
const path = (page: Page) => page.getByRole("list", { name: "Tu camino" });
const steps = (page: Page) => path(page).getByRole("listitem");

test("el camino muestra cada nodo con su estado, cuándo toca y el ritmo", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/exams/${eid}`);
  await page.getByRole("link", { name: "Ver mi ruta de estudio" }).click();
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
  await expect(page.getByRole("heading", { name: "Faltan 14 días" })).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Unidades completadas: 40 %" }),
  ).toHaveAttribute("aria-valuenow", "40");
  // 60 min pendientes frente a 14 × 20 = 280 disponibles.
  await expect(page.getByText("Vas bien", { exact: true })).toBeVisible();
  await expect(page.getByText("Ruta automática")).toBeVisible();
  const list = steps(page);
  await expect(list).toHaveCount(9);
  expect(
    await list.evaluateAll((li) =>
      li.map((l) => `${l.getAttribute("data-type")}:${l.getAttribute("data-state")}`),
    ),
  ).toEqual([
    "study:completed",
    "study:completed",
    "study:next",
    "practice:pending",
    "study:pending",
    "study:pending",
    "practice:pending",
    "review:pending",
    "mock:pending",
  ]);
  // Estados con icono + texto, nunca solo color.
  await expect(list.nth(0)).toContainText("Completada");
  await expect(list.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(list.nth(2)).toContainText("A continuación · Ya la empezaste");
  await expect(list.nth(3)).toContainText("Pendiente");
  await expect(list.nth(2)).toContainText("Hoy");
  await expect(list.nth(3)).toContainText("Mañana");
  await expect(list.nth(8)).toContainText("Jue 29");
  // Anillo de dominio: con datos en «Ecuaciones», vacío en el resto.
  await expect(list.nth(1)).toContainText("70 %");
  await expect(list.nth(2)).toContainText("sin datos aún");
  // Nombre accesible del botón con su estado.
  await expect(
    list.nth(2).getByRole("button", {
      name: /^Signos y soluciones\. A continuación\. Toca hoy\. 20 min/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 de 5 temas completados, 40 %." })).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("bloqueo suave: un paso posterior pide confirmación y deja ir igualmente", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(`/exams/${eid}/ruta`);
  await steps(page).nth(4).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: "¿Saltar al siguiente paso?" });
  await expect(dialog).toContainText(
    "Te recomendamos terminar antes «Signos y soluciones». ¿Ir igualmente?",
  );
  await expect(dialog.getByRole("button", { name: "Ir a «Signos y soluciones»" })).toBeFocused();
  await dialog.getByRole("button", { name: "Ir igualmente" }).click();
  const sheet = page.getByRole("dialog", { name: "Factorización" });
  await expect(sheet.getByRole("link", { name: "Empezar" })).toHaveAttribute(
    "href",
    `/exams/${eid}/study/${uid(3)}`,
  );
  // Con teclado: Escape cierra y el foco vuelve al nodo.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await steps(page).nth(4).getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "¿Saltar al siguiente paso?" })).toBeVisible();
  await page.getByRole("button", { name: "Ir a «Signos y soluciones»" }).click();
  await expect(page.getByRole("dialog", { name: "Signos y soluciones" })).toBeVisible();
});

test("hoja inferior: resumen, minutos, «Empezar» y «Hacer un test de este tema»", async ({
  page,
}) => {
  const calls = await fixture(page, {
    handlers: {
      exam_session_create: (b) => ({
        session: {
          id: b.session_id,
          exam_id: eid,
          mode: "practice",
          status: "generating",
          started_at: NOW.toISOString(),
          submitted_at: null,
        },
      }),
      exam_session_get: () => ({ session: null }),
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/exams/${eid}/ruta`);
  await steps(page).nth(2).getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Signos y soluciones" });
  await expect(sheet).toContainText("Comprende la idea y comprueba tu razonamiento.");
  await expect(sheet).toContainText("20 min · Signos");
  // En móvil la hoja sale desde abajo.
  const box = await sheet.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(844 - 40);
  await expect(sheet.getByRole("link", { name: "Empezar" })).toHaveAttribute(
    "href",
    `/exams/${eid}/study/${uid(2)}`,
  );
  await sheet.getByRole("button", { name: "Hacer un test de este tema" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${eid}/sessions/`));
  const create = calls.find((c) => c.action === "exam_session_create")!;
  expect(create).toMatchObject({ unit_id: uid(2), mode: "practice" });
  // El simulacro enlaza a la generación existente.
  await page.goto(`/exams/${eid}/ruta`);
  await steps(page).nth(8).getByRole("button").click();
  await page.getByRole("button", { name: "Ir igualmente" }).click();
  await expect(page.getByRole("link", { name: "Ir al simulacro" })).toHaveAttribute(
    "href",
    `/exams/${eid}#simulacro`,
  );
});

test("al volver de una unidad completada, el check y el trazo se animan; con reduced-motion es instantáneo", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(`/exams/${eid}/ruta?hecho=${uid(1)}`);
  const done = steps(page).nth(1);
  await expect(done).toHaveAttribute("data-state", "completed");
  await expect(page).toHaveURL(`/exams/${eid}/ruta`);
  await expect(page.getByRole("status").filter({ hasText: "«Ecuaciones de primer grado» completada. A continuación: Signos y soluciones." })).toHaveCount(1);
  const motion = await done.evaluate((li) => {
    const mask = li.querySelector("[class*=checkMask]")!;
    const fill = li.querySelector("[class*=trailFill]")!;
    const next = li.parentElement!.querySelector("[data-state=next] [class*=marker]")!;
    return {
      mask: getComputedStyle(mask).transitionProperty + "|" + getComputedStyle(mask).transitionDuration,
      fill: getComputedStyle(fill).transitionProperty + "|" + getComputedStyle(fill).transitionDuration,
      pulse: getComputedStyle(next, "::after").animationName,
    };
  });
  expect(motion.mask).toBe("transform, opacity|0.25s, 0.12s");
  expect(motion.fill).toBe("transform|0.25s");
  expect(motion.pulse).toMatch(/routePulse/);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/exams/${eid}/ruta?hecho=${uid(1)}`);
  const reduced = await steps(page).nth(1).evaluate((li) => {
    const mask = li.querySelector("[class*=checkMask]")!;
    const fill = li.querySelector("[class*=trailFill]")!;
    const next = li.parentElement!.querySelector("[data-state=next] [class*=marker]")!;
    return {
      mask: getComputedStyle(mask).transitionDuration,
      fill: getComputedStyle(fill).transform,
      pulse: getComputedStyle(next, "::after").animationName,
    };
  });
  expect(reduced.mask).toBe("0s");
  expect(reduced.fill).toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(reduced.pulse).toBe("none");
});

test("estados: plan generándose, error con «Reintentar», sin unidades y sin conexión", async ({
  page,
}) => {
  let exam: DreamExam = { ...base, status: "preparing", units: [] };
  await fixture(page, {
    handlers: {
      exam_get: () => ({ exam }),
      exam_prepare: () => ({ exam: base }),
    },
  });
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.getByText("Dream está preparando tu plan")).toBeVisible();

  exam = { ...base, status: "failed", units: [], plan_error: "No se pudo preparar el plan. Tus temas y materiales están guardados." };
  await page.reload();
  await expect(page.getByText("No se pudo preparar tu plan")).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(steps(page)).toHaveCount(9);

  exam = { ...base, units: [] };
  await page.reload();
  await expect(page.getByText("Este examen aún no tiene unidades.")).toBeVisible();

  exam = base;
  await page.reload();
  await expect(steps(page)).toHaveCount(9);
  await page.context().setOffline(true);
  await expect(page.getByText("Sin conexión. Lo que ves puede no estar al día.")).toBeVisible();
  await page.context().setOffline(false);
});

test("ruta guardada por la IA: «Tu ruta se ha ajustado», ver cambios y «Rehacer mi ruta»", async ({
  page,
}) => {
  const ai: DreamExam = {
    ...base,
    route_source: "ai",
    route_updated_at: "2026-10-15T09:00:00Z",
    route_regenerated_on: "2026-10-15",
    route: {
      version: 1,
      nodes: [
        { id: "n1", type: "study", unit_id: uid(0), planned_date: null, minutes: 20, reason: "Base." },
        { id: "n2", type: "study", unit_id: uid(1), planned_date: null, minutes: 20, reason: "Base." },
        { id: "n3", type: "study", unit_id: uid(3), planned_date: "2026-10-16", minutes: 20, reason: "Pesa mucho en el examen." },
        { id: "n4", type: "study", unit_id: uid(2), planned_date: "2026-10-17", minutes: 20, reason: "Te cuestan los signos." },
        { id: "n5", type: "study", unit_id: uid(4), planned_date: "2026-10-18", minutes: 20, reason: "Aplica lo visto." },
        { id: "n6", type: "mock", planned_date: "2026-10-29", minutes: 20, reason: "Ensayo final." },
      ],
      changes: [{ kind: "moved", type: "study", unit_id: uid(3), from: "2026-10-19", to: "2026-10-16" }],
    },
  };
  const calls = await fixture(page, {
    exam: ai,
    handlers: {
      exam_route_regenerate: () => ({ exam: { ...ai, route_regenerated_on: "2026-10-16" } }),
    },
  });
  await page.goto(`/exams/${eid}/ruta`);
  await expect(page.getByText("Ruta de Dream")).toBeVisible();
  await expect(steps(page)).toHaveCount(6);
  await expect(steps(page).nth(2)).toContainText("Factorización");
  await page.getByText("Ver qué cambió").click();
  await expect(page.getByText("Estudiar: Factorización: del 19 oct 2026 al 16 oct 2026")).toBeVisible();
  await page.getByRole("button", { name: "Rehacer mi ruta" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Tu ruta se ha ajustado." }),
  ).toHaveCount(1);
  // Máximo una vez al día: el botón desaparece hasta mañana.
  await expect(page.getByRole("button", { name: /Rehacer|Rehaciendo/ })).toHaveCount(0);
  expect(calls.filter((c) => c.action === "exam_route_regenerate")).toEqual([
    expect.objectContaining({ exam_id: eid, trigger: "manual" }),
  ]);
});

test("«Compartir» usa navigator.share con un texto sin datos personales", async ({
  page,
}) => {
  await fixture(page, { share: "native" });
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Compartir" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { shared: unknown[] }).shared),
    )
    .toEqual([{ text: expected }]);
  expect(expected).not.toMatch(/Alex|qa@example|primer trimestre|33333333|70 %/);
  await expect(page.getByText("Copiado")).toHaveCount(0);
});

test("sin Web Share API, «Compartir» copia al portapapeles y avisa", async ({
  page,
}) => {
  await fixture(page, { share: "clipboard" });
  await page.goto(`/exams/${eid}/ruta`);
  await page.getByRole("button", { name: "Compartir" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copiado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual([expected]);
});

test("Inicio: tarjeta «A continuación» con el siguiente paso del examen más cercano", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  const card = page.getByTestId("home-next-step");
  await expect(card).toContainText("A continuación · Matemáticas");
  await expect(card).toContainText("Signos y soluciones");
  await expect(card).toContainText("Estudiar · Hoy · 20 min");
  await expect(card).toHaveAttribute("href", `/exams/${eid}/ruta`);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("Inicio: sin exámenes no aparece la tarjeta", async ({ page }) => {
  await fixture(page, { exams: [] });
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "¿Qué quieres entender hoy?" })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("home-next-step")).toHaveCount(0);
});

test("capturas de la ruta: móvil y escritorio, claro y oscuro", async ({
  page,
}) => {
  await fixture(page);
  for (const size of [
    { width: 390, height: 844, name: "movil" },
    { width: 1440, height: 900, name: "escritorio" },
  ])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await page.goto(`/exams/${eid}/ruta`);
      await expect(steps(page)).toHaveCount(9);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}.png`,
        animations: "disabled",
        fullPage: true,
      });
      await steps(page).nth(2).getByRole("button").click();
      await expect(page.getByTestId("route-sheet")).toBeVisible();
      await page.screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}-hoja.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await steps(page).nth(5).getByRole("button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({
        path: `${shots}/ruta-${size.name}-${colorScheme}-aviso.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.goto("/chat");
      await expect(page.getByTestId("home-next-step")).toBeVisible();
      await page.screenshot({
        path: `${shots}/inicio-${size.name}-${colorScheme}.png`,
        animations: "disabled",
      });
    }
});
