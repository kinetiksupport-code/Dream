import { test, expect, type Page, type Request } from "@playwright/test";
// /subir/[token]: the phone page of the QR upload, with dream-api mocked.
// With CAPTURAS_DIR set it also saves the screenshots for docs/diseno/subir.
test.use({ serviceWorkers: "block" });

const TOKEN = "q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe";
const DEVICE = "Dv1c3-k3y_0000000000000000000000000000000000".slice(0, 43);
const API = "**/functions/v1/dream-api";

type Body = Record<string, unknown>;
async function mockApi(
  page: Page,
  handler: (
    body: Body,
    request: Request,
  ) =>
    { status?: number; body: Body } | Promise<{ status?: number; body: Body }>,
) {
  const seen: { body: Body; headers: Record<string, string> }[] = [];
  await page.route(API, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const body = request.postDataJSON() as Body;
    seen.push({ body, headers: request.headers() });
    const answer = await handler(body, request);
    await route.fulfill({
      status: answer.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(answer.body),
    });
  });
  return seen;
}

const connected = {
  ok: true,
  device_key: DEVICE,
  expires_at: "2099-01-01T00:00:00Z",
  uploads: 0,
  max_uploads: 10,
};

test("connects, uploads with Procesando archivo… then the tick, and counts", async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  let uploads = 0;
  const seen = await mockApi(page, async (body) => {
    if (body.action === "upload_qr_connect") return { body: connected };
    await held;
    uploads++;
    return {
      body: {
        ok: true,
        file: { file_name: body.file_name, status: "processed" },
        uploads,
        max_uploads: 10,
      },
    };
  });
  const telemetry: string[] = [];
  page.on("request", (r) => {
    if (/posthog|sentry|ingest/i.test(r.url())) telemetry.push(r.url());
  });

  const response = await page.goto(`/subir/${TOKEN}`);
  const headers = response!.headers();
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );

  await expect(
    page.getByRole("heading", { name: "Conectado con tu ordenador" }),
  ).toBeVisible();
  await expect(
    page.getByText("Este código es solo para ti y caduca."),
  ).toBeVisible();
  // No app chrome: no menu, no tab bar, no links into the account.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);

  const camera = page.locator('input[capture="environment"]');
  await expect(camera).toHaveAttribute("accept", "image/*");
  await camera.setInputFiles({
    name: "pizarra.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  });
  const row = page.getByRole("listitem").filter({ hasText: "pizarra.jpg" });
  await expect(row.getByText("Procesando archivo…")).toBeVisible();
  release();
  await expect(row.getByText("Listo. Ya está en tu ordenador.")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Has subido 1 archivo de 10" }),
  ).toBeVisible();

  // «Subir otro» picks more files, one request each.
  await expect(page.getByRole("button", { name: "Subir otro" })).toBeVisible();
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: "tema2.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Tema 2"),
    },
  ]);
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "tema2.txt" })
      .getByText("Listo. Ya está en tu ordenador."),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Has subido 2 archivos de 10" }),
  ).toBeVisible();

  const [connect, ...files] = seen;
  expect(connect.body).toMatchObject({
    action: "upload_qr_connect",
    token: TOKEN,
  });
  for (const call of seen) {
    expect(call.headers["x-dream-channel"]).toBe("qr");
    expect(call.headers.authorization).toBeUndefined();
    expect(call.headers.referer).toBeUndefined();
  }
  expect(
    files.map((f) => [f.body.action, f.body.device_key, f.body.file_name]),
  ).toEqual([
    ["upload_qr_file", DEVICE, "pizarra.jpg"],
    ["upload_qr_file", DEVICE, "tema2.txt"],
  ]);
  expect(
    Buffer.from(String(files[1].body.content_base64), "base64").toString(),
  ).toBe("Tema 2");
  expect(telemetry).toEqual([]);
});

test("a rejected file shows the reason and can be retried", async ({
  page,
}) => {
  let first = true;
  await mockApi(page, (body) => {
    if (body.action === "upload_qr_connect") return { body: connected };
    if (first) {
      first = false;
      return {
        status: 422,
        body: {
          error:
            "No se pudo procesar el archivo. Comprueba que no esté dañado o protegido.",
          code: "upload_file_rejected",
        },
      };
    }
    return { body: { ok: true, uploads: 1, max_uploads: 10 } };
  });
  await page.goto(`/subir/${TOKEN}`);
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "apuntes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  const row = page.getByRole("listitem").filter({ hasText: "apuntes.pdf" });
  await expect(row.getByText(/dañado o protegido/)).toBeVisible();
  await row.getByRole("button", { name: "Reintentar" }).click();
  await expect(row.getByText("Listo. Ya está en tu ordenador.")).toBeVisible();
});

test("invalid, expired or malformed codes get one friendly page without reasons", async ({
  page,
}) => {
  const seen = await mockApi(page, () => ({
    status: 404,
    body: {
      error: "Este código ya no vale. Escanea uno nuevo desde tu ordenador.",
      code: "upload_link_invalid",
    },
  }));
  await page.goto(`/subir/${TOKEN}`);
  await expect(
    page.getByRole("heading", { name: "Este código ya no vale" }),
  ).toBeVisible();
  await expect(page.getByText(/caducad|inválid|no existe/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Hacer foto|Subir archivo/ }),
  ).toHaveCount(0);
  expect(seen).toHaveLength(1);

  await page.goto("/subir/esto-no-es-un-codigo");
  await expect(
    page.getByRole("heading", { name: "Este código ya no vale" }),
  ).toBeVisible();
  expect(seen).toHaveLength(1); // malformed: no request at all
});

test("the code expiring mid-session switches to the friendly page", async ({
  page,
}) => {
  await mockApi(page, (body) =>
    body.action === "upload_qr_connect"
      ? { body: connected }
      : { status: 404, body: { error: "x", code: "upload_link_invalid" } },
  );
  await page.goto(`/subir/${TOKEN}`);
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("a"),
  });
  await expect(
    page.getByRole("heading", { name: "Este código ya no vale" }),
  ).toBeVisible();
});

test("no connection: says so and retries", async ({ page }) => {
  let fail = true;
  await page.route(API, (route) =>
    fail
      ? route.abort("internetdisconnected")
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(connected),
        }),
  );
  await page.goto(`/subir/${TOKEN}`);
  await expect(
    page.getByRole("heading", { name: "No hay conexión" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Volver a probar" }).click();
  await expect(
    page.getByRole("heading", { name: "Conectado con tu ordenador" }),
  ).toBeVisible();
});

test("reduced motion: no movement, the tick appears without drawing", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await mockApi(page, (body) =>
    body.action === "upload_qr_connect"
      ? { body: connected }
      : { body: { ok: true, uploads: 1, max_uploads: 10 } },
  );
  await page.goto(`/subir/${TOKEN}`);
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("a"),
  });
  const tick = page.getByRole("listitem").locator("svg path").first();
  await expect(tick).toBeVisible();
  expect(await tick.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  const row = page.getByRole("listitem").first();
  expect(
    await row.evaluate((el) => getComputedStyle(el).animationName),
  ).toMatch(/fadeIn/);
  await context.close();
});

// ---- Evidence (CAPTURAS_DIR=docs/diseno/subir)
const OUT = process.env.CAPTURAS_DIR;
const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 800 },
];
for (const vp of VIEWPORTS)
  for (const scheme of ["light", "dark"] as const)
    test(`capturas subir ${vp.name} ${scheme}`, async ({ page }) => {
      test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: scheme });
      let release: () => void = () => {};
      const held = new Promise<void>((r) => (release = r));
      let n = 0;
      await mockApi(page, async (body) => {
        if (body.action === "upload_qr_connect") return { body: connected };
        if (body.file_name === "tema-3.pdf") await held;
        n++;
        return { body: { ok: true, uploads: n, max_uploads: 10 } };
      });
      const suffix = `${vp.name}-${scheme === "light" ? "claro" : "oscuro"}`;
      await page.goto(`/subir/${TOKEN}`);
      await page
        .getByRole("heading", { name: "Conectado con tu ordenador" })
        .waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${OUT}/conectado-${suffix}.png`,
        fullPage: true,
      });
      await page.locator('input[type="file"][multiple]').setInputFiles([
        {
          name: "tema-1.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF"),
        },
        {
          name: "foto-pizarra.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff]),
        },
        {
          name: "tema-3.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF"),
        },
      ]);
      await page.getByText("Procesando archivo…").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${OUT}/subiendo-${suffix}.png`,
        fullPage: true,
      });
      release();
      await page
        .getByRole("status")
        .filter({ hasText: "Has subido 3 archivos" })
        .waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${OUT}/subidos-${suffix}.png`,
        fullPage: true,
      });
      await page.goto("/subir/codigo-no-valido");
      await page
        .getByRole("heading", { name: "Este código ya no vale" })
        .waitFor();
      await page.screenshot({
        path: `${OUT}/no-vale-${suffix}.png`,
        fullPage: true,
      });
    });

test("capturas subir movimiento reducido", async ({ browser }) => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await mockApi(page, (body) =>
    body.action === "upload_qr_connect"
      ? { body: connected }
      : { body: { ok: true, uploads: 1, max_uploads: 10 } },
  );
  await page.goto(`/subir/${TOKEN}`);
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "tema-1.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF"),
  });
  await page.getByText("Listo. Ya está en tu ordenador.").waitFor();
  await page.screenshot({
    path: `${OUT}/subidos-movil-claro-reducido.png`,
    fullPage: true,
  });
  await context.close();
});

test("grabación subir", async ({ browser }) => {
  test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: `${OUT}/video`, size: { width: 390, height: 844 } },
    serviceWorkers: "block",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await mockApi(page, async (body) => {
    if (body.action === "upload_qr_connect") return { body: connected };
    await new Promise((r) => setTimeout(r, 1200));
    return { body: { ok: true, uploads: 1, max_uploads: 10 } };
  });
  await page.goto(`/subir/${TOKEN}`);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Subir archivo" }).hover();
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles({
      name: "tema-1.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF"),
    });
  await page.getByText("Listo. Ya está en tu ordenador.").waitFor();
  await page.waitForTimeout(1200);
  await context.close();
});
