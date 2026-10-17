import { test, expect, type Page } from "@playwright/test";
// Isolated contract fixtures: never used by the application or service worker.
const cid = "12345678-1234-1234-1234-123456789abc";
const tid = "22345678-1234-1234-1234-123456789abc";
const qid = "32345678-1234-1234-1234-123456789abc";
const profile = {
  email: "qa@example.test",
  display_name: "Alex",
};
async function authenticated(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sb-cxaujyagtpsxvkwkdxbc-auth-token",
      JSON.stringify({
        access_token: "qa-contract-fixture",
        refresh_token: "qa-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "42345678-1234-1234-1234-123456789abc",
          email: "qa@example.test",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
  });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    expect(request.headers()["authorization"]).toBe(
      "Bearer qa-contract-fixture",
    );
    expect(request.headers()["apikey"]).toMatch(/^sb_publishable_/);
    let data: unknown = { ok: true };
    switch (body.action) {
      case "profile":
        data = { profile, service_ready: true };
        break;
      case "conversations":
        data = {
          items: [
            {
              id: cid,
              title: "Una idea sobre el universo",
              updated_at: "2026-10-06T00:00:00Z",
            },
          ],
        };
        break;
      case "conversation_create":
        data = {
          conversation: {
            id: cid,
            title: "Nueva conversación",
            updated_at: "2026-10-06T00:00:00Z",
          },
        };
        break;
      case "messages":
        data = {
          items: [
            {
              id: "a",
              role: "user",
              content: "¿Cómo podemos entender esta idea?",
            },
            {
              id: "b",
              role: "assistant",
              content:
                'Una idea pequeña, bien entendida, abre muchas puertas.\n\n## Primero, lo esencial\n\nLa energía puede expresarse como \\(E=mc^2\\).\n\n```typescript\nconst dream = "una pregunta";\n```\n\n| Idea | Significado |\n| --- | --- |\n| Curiosidad | El comienzo |\n\n[Una fuente](https://example.com)',
            },
          ],
        };
        break;
      case "chat":
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: '{"type":"activity","activity":"searching"}\n{"type":"delta","text":"Una respuesta real del contrato de prueba."}\n{"type":"complete"}\n',
        });
        return;
      case "attachment_upload":
        data = { attachment: { id: qid, status: "processed" } };
        break;
      case "test_generate":
        data = {
          test: { id: tid },
          assistant_message: `Un test listo. <!--DREAM_WIDGET:{"type":"quiz","testId":"${tid}","title":"La energía","questionCount":1}-->`,
        };
        break;
      case "test_get":
        data = {
          test: {
            id: tid,
            title: "Una idea sobre la energía",
            subject: "Física",
            topic: "La energía",
            mode: "practice",
            status: "ready",
            difficulty: "intermedio",
            questions: [
              {
                id: qid,
                position: 0,
                type: "multiple_choice",
                prompt: "¿Qué representa \\(E\\) en la ecuación?",
                options: ["Energía", "Masa", "Velocidad", "Tiempo"],
                metadata: {},
              },
            ],
          },
        };
        break;
      case "test_check_answer":
        data = {
          evaluation: {
            is_correct: true,
            feedback: "La energía se representa con E.",
            correct_answer: "Energía",
          },
        };
        break;
      case "test_submit":
        data = {
          result: {
            attempt_id: qid,
            score: 1,
            total: 1,
            percentage: 100,
            mastered: ["Energía"],
            practice: [],
            items: [
              {
                question_id: qid,
                prompt: "¿Qué representa E?",
                answer: "Energía",
                is_correct: true,
                feedback: "Has aplicado bien el concepto.",
                correct_answer: "Energía",
              },
            ],
          },
        };
        break;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
test("unauthenticated routes redirect to minimal Google login", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/login/);
  await expect(
    page.getByRole("button", { name: "Continuar con Google" }),
  ).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
});
test("chat contract, real parser, markdown, attachments, widgets and theme", async ({
  page,
}) => {
  await authenticated(page);
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/chat-empty.png",
  });
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("Una pregunta");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(
    page.getByText("Una respuesta real del contrato de prueba."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar mensaje" }),
  ).toBeDisabled();
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".katex")).toBeVisible();
  await expect(page.locator(".code-block")).toContainText("const dream");
  await expect(page.locator("table")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/chat-content.png",
  });
  await page.goto("/chat");
  await page.locator("input[type=file]").setInputFiles({
    name: "ideas.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Una idea"),
  });
  await expect(page.locator(".attachment-chip")).toContainText("Listo");
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("hazme un test sobre energía");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator(".quiz-widget")).toBeVisible();
  await expect(page.locator(".message-thread")).not.toContainText(
    "DREAM_WIDGET",
  );
  await page.goto("/settings");
  // Ajustes shows the Google account behind the session; no help-style toggles.
  await expect(page.getByText("qa@example.test")).toBeVisible();
  await expect(page.getByText("Cómo te ayuda Dream")).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/settings-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/settings-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/chat-mobile-dark.png",
  });
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Más" })
    .click();
  await page.getByRole("link", { name: "Apuntes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Apuntes", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/notes-mobile-dark.png",
  });
});
test("practice corrects server-side and shows returned result", async ({
  page,
}) => {
  await authenticated(page);
  await page.goto(`/tests/${tid}`);
  await expect(
    page.getByRole("heading", { name: "Una idea sobre la energía" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/test-practice.png",
  });
  await page.getByRole("radio", { name: /Energía/ }).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.getByText("Bien pensado.")).toBeVisible();
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  await expect(page.getByRole("heading", { name: "1 / 1" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/test-result.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/test-result-mobile.png",
    fullPage: true,
  });
});

test("exam supports all eight question types and defers correction", async ({
  page,
}) => {
  await authenticated(page);
  const types = [
    "multiple_choice",
    "multiple_select",
    "true_false",
    "short_answer",
    "numeric",
    "fill_blank",
    "matching",
    "math",
  ];
  const questions = types.map((type, position) => ({
    id: `${position}2345678-1234-1234-1234-123456789abc`,
    position,
    type,
    prompt: `Pregunta ${position + 1}: ${type}`,
    options:
      type === "true_false"
        ? ["Verdadero", "Falso"]
        : ["Uno", "Dos", "Tres", "Cuatro"],
    metadata:
      type === "matching"
        ? { left: ["Primero", "Segundo"], right: ["B", "A"] }
        : {},
  }));
  let checks = 0;
  let submitted: unknown;
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "test_check_answer") {
      checks++;
      await route.fallback();
      return;
    }
    if (body.action === "test_submit") {
      submitted = body.answers;
      await route.fallback();
      return;
    }
    if (body.action !== "test_get") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        test: {
          id: tid,
          title: "Ocho formas de pensar",
          subject: "Práctica",
          topic: "Conceptos",
          mode: "exam",
          status: "ready",
          difficulty: "intermedio",
          questions,
        },
      }),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/tests/${tid}`);
  for (let i = 0; i < questions.length; i++) {
    await expect(
      page.getByText(`Pregunta ${i + 1}: ${types[i]}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Comprobar respuesta" }),
    ).toHaveCount(0);
    if (i === 0) await page.getByRole("radio", { name: /Uno/ }).check();
    else if (i === 1) {
      await page.getByRole("checkbox", { name: /Uno/ }).check();
      await page.getByRole("checkbox", { name: /Dos/ }).check();
    } else if (i === 2)
      await page.getByRole("radio", { name: /Verdadero/ }).check();
    else if (i === 6) {
      await page
        .getByRole("combobox", { name: "Relacionar Primero" })
        .selectOption("A");
      await page
        .getByRole("combobox", { name: "Relacionar Segundo" })
        .selectOption("B");
    } else
      await page
        .locator(".written-answer input,.written-answer textarea")
        .fill(i === 4 ? "3.14" : "Un razonamiento");
    if (i === 6)
      await page.screenshot({
        path: "test-results/test-matching-mobile.png",
        animations: "disabled",
      });
    if (i < 7) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  await page.getByRole("button", { name: "Terminar y ver resultado" }).click();
  await expect(page.getByRole("heading", { name: "1 / 1" })).toBeVisible();
  expect(checks).toBe(0);
  expect(Array.isArray(submitted) && submitted.length).toBe(8);
});

test("conversation rename/delete, keyboard dialog and PWA assets", async ({
  page,
}) => {
  await authenticated(page);
  await page.goto("/chat?view=recent");
  await page
    .getByRole("button", { name: "Opciones de Una idea sobre el universo" })
    .click();
  await page.getByRole("menuitem", { name: "Renombrar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre de conversación" })
    .fill("Otra perspectiva");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /^Otra perspectiva/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Opciones de Otra perspectiva" })
    .click();
  // Historial: delete has undo instead of a confirmation dialog.
  await page.getByRole("menuitem", { name: "Borrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(
    page.getByRole("link", { name: /^Otra perspectiva/ }),
  ).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  expect((await page.request.get("/icon-192.png")).ok()).toBeTruthy();
  expect((await page.request.get("/sw.js")).ok()).toBeTruthy();
});

test("stop preserves received text without starting another request", async ({
  page,
}) => {
  await authenticated(page);
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const qa = window as typeof window & { qaChatCalls: number };
    qa.qaChatCalls = 0;
    window.fetch = async (input, init) => {
      if (
        typeof init?.body === "string" &&
        JSON.parse(init.body).action === "chat"
      ) {
        qa.qaChatCalls++;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"type":"delta","text":"Este texto se conserva."}\n',
              ),
            );
            init.signal?.addEventListener(
              "abort",
              () =>
                controller.error(new DOMException("Detenido", "AbortError")),
              { once: true },
            );
          },
        });
        return new Response(body, {
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      return original(input, init);
    };
  });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("Una pregunta para detener");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText("Este texto se conserva.")).toBeVisible();
  await page.getByRole("button", { name: "Detener respuesta" }).click();
  await expect(
    page.getByText("Respuesta detenida · Lo recibido se conserva"),
  ).toBeVisible();
  await expect(page.getByText("Este texto se conserva.")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("Podemos continuar");
  await expect(
    page.getByRole("button", { name: "Enviar mensaje" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as typeof window & { qaChatCalls: number }).qaChatCalls,
    ),
  ).toBe(1);
});

test("automatic test marker generates one widget and hides internal comments", async ({
  page,
}) => {
  await authenticated(page);
  let generated = 0;
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "test_generate") {
      generated++;
      expect(body.persist_user_message).toBe(false);
      await route.fallback();
      return;
    }
    if (body.action === "chat") {
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: '{"type":"delta","text":"Vamos a practicar. <!--DREAM_ACTION:TEST-->"}\n{"type":"complete"}\n',
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("¿Lo he entendido bien?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator(".quiz-widget")).toBeVisible();
  await expect(page.locator(".message-thread")).not.toContainText(
    "DREAM_ACTION",
  );
  expect(generated).toBe(1);
});

test("visual sweep: tablet, mobile, light/dark, long chat and reduced viewport", async ({
  page,
}) => {
  test.setTimeout(240000);
  await authenticated(page);
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "messages") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: Array.from({ length: 12 }, (_, i) => ({
          id: String(i),
          role: i % 2 ? "assistant" : "user",
          content:
            i % 2
              ? "Una idea empieza por una pregunta.\n\nLa fórmula \\[E=mc^2\\] nos invita a entender la relación entre masa y energía.\n\n```python\ndef explorar(idea):\n    return idea.strip()\n```\n\nUna fuente: [Referencia](https://example.com)."
              : "¿Podemos explorar esta idea juntos?",
        })),
      }),
    });
  });
  for (const size of [
    { width: 375, height: 812, name: "375" },
    { width: 390, height: 844, name: "390" },
    { width: 393, height: 852, name: "393" },
    { width: 430, height: 932, name: "430" },
    { width: 768, height: 1024, name: "768" },
    { width: 834, height: 1112, name: "834" },
    { width: 1280, height: 800, name: "1280" },
    { width: 1440, height: 900, name: "1440" },
    { width: 1728, height: 1117, name: "1728" },
  ]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.goto("/settings");
      await page
        .getByRole("button", {
          name: theme === "light" ? "Claro" : "Oscuro",
          exact: true,
        })
        .click();
      await page
        .locator(".workspace-main")
        .evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({
        path: `test-results/settings-${size.name}-${theme}.png`,
        animations: "disabled",
      });
      await page.goto("/chat");
      await expect(
        page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/empty-${size.name}-${theme}.png`,
        animations: "disabled",
      });
      await page.goto(`/chat?c=${cid}`);
      await expect(page.locator(".message")).toHaveCount(12);
      await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
      await expect(
        page.getByRole("button", { name: "Volver al final" }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/long-${size.name}-${theme}.png`,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Volver al final" }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  await page.setViewportSize({ width: 390, height: 430 });
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("El composer sigue visible");
  const box = await page.locator(".composer").boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(430);
  await page.screenshot({
    path: "test-results/viewport-reduced.png",
    animations: "disabled",
  });
});

test("design states: test feedback, Orb, files, tab bar and editorial math", async ({
  page,
}) => {
  test.setTimeout(120000);
  await authenticated(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "test_get") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          test: {
            id: tid,
            title: "Ecuaciones de segundo grado",
            topic: "Ecuaciones",
            difficulty: "Nivel 1",
            subject: "Matemáticas",
            mode: "practice",
            status: "ready",
            questions: [
              {
                id: qid,
                position: 0,
                type: "multiple_choice",
                prompt:
                  "¿Cuáles son las soluciones de esta ecuación?\n\n\\[x^2-5x+6=0\\]",
                options: [
                  "x = −2 o x = −3",
                  "x = 2 o x = 3",
                  "x = 1 o x = 6",
                  "x = 5 o x = 6",
                ],
                metadata: {},
              },
            ],
          },
        }),
      });
      return;
    }
    if (body.action === "test_check_answer") {
      const correct = body.answer === "x = 2 o x = 3";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          evaluation: {
            is_correct: correct,
            correct_answer: "x = 2 o x = 3",
            feedback: correct
              ? "Al sustituir 2 o 3, la ecuación se cumple."
              : "Revisa los signos: las soluciones son 2 y 3.",
          },
        }),
      });
      return;
    }
    if (body.action === "messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "u",
              role: "user",
              content: "Explícame las ecuaciones de segundo grado.",
            },
            {
              id: "a",
              role: "assistant",
              content:
                "## Vamos a resolverla juntos.\n\n\\[x^2-5x+6=0\\]\n\nUna ecuación, dos soluciones.\n\n### 01 / FACTORIZA\n\nBuscamos dos números que sumen −5 y cuyo producto sea 6: −2 y −3.\n\n\\[(x-2)(x-3)=0\\]\n\n### 02 / IGUALA CADA FACTOR A CERO\n\nSi un producto vale cero, al menos uno de sus factores debe ser cero.\n\n\\[x=2 \\quad \\text{o} \\quad x=3\\]",
            },
          ],
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/tests/${tid}`);
  await expect(page.locator(".question-prompt")).toContainText(
    "¿Cuáles son las soluciones",
  );
  await page.screenshot({
    path: "test-results/figma-test-neutral.png",
    animations: "disabled",
  });
  await page.getByRole("radio", { name: /x = −2/ }).check();
  await page.screenshot({
    path: "test-results/figma-test-selected.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator(".test-option.incorrect")).toHaveCount(1);
  await expect(page.locator(".test-option.correct")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/figma-test-incorrect.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Volver a intentarlo" }).click();
  await page.getByRole("radio", { name: /x = 2 o x = 3/ }).check();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.getByText("Bien pensado.")).toBeVisible();
  await page.screenshot({
    path: "test-results/figma-test-correct.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "¿Qué quieres entender hoy?" }),
  ).toBeVisible();
  // Mobile tab bar: Inicio, Chat, Tareas, Más (design "Móvil · Inicio").
  const tabs = page.getByRole("navigation", { name: "Principal" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Inicio",
    "Chat",
    "Tareas",
    "Más",
  ]);
  await expect(tabs.getByRole("link", { name: "Inicio" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Más" }).click();
  await expect(page.getByRole("heading", { name: "Más" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Más" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.screenshot({
    path: "test-results/design-more.png",
    animations: "disabled",
  });
  await tabs.getByRole("link", { name: "Inicio" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Ecuaciones.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nQA fixture"),
  });
  await expect(page.locator(".attachment-chip")).toContainText("Listo · PDF");
  await page.screenshot({
    path: "test-results/figma-home-attachment.png",
    animations: "disabled",
  });
  await page.goto(`/chat?c=${cid}`);
  await expect(page.locator(".math-block")).toHaveCount(3);
  await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "test-results/figma-math.png",
    animations: "disabled",
  });
  // The Orb is the canvas SVG, not a redrawn mark.
  await expect(page.locator(".orb .orb-nucleus").first()).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("real UI states from stream events and failed upload recovery", async ({
  page,
}) => {
  test.setTimeout(120000);
  await authenticated(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const qa = window as typeof window & {
      qaStream?: ReadableStreamDefaultController<Uint8Array>;
    };
    window.fetch = async (input, init) => {
      if (
        typeof init?.body === "string" &&
        JSON.parse(init.body).action === "chat"
      ) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              qa.qaStream = controller;
              init.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("Detenido", "AbortError")),
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      }
      return original(input, init);
    };
  });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Mensaje para Dream" })
    .fill("Una idea actual");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator(".activity-thinking")).toBeVisible();
  // "Thinking" shows before the chat request starts: wait for the simulated
  // stream to exist so the events below are not dropped.
  await page.waitForFunction(
    () =>
      !!(
        window as typeof window & {
          qaStream?: ReadableStreamDefaultController<Uint8Array>;
        }
      ).qaStream,
  );
  await page.screenshot({
    path: "test-results/figma-thinking.png",
    animations: "disabled",
  });
  const emit = async (event: object) =>
    page.evaluate((event) => {
      const qa = window as typeof window & {
        qaStream?: ReadableStreamDefaultController<Uint8Array>;
      };
      qa.qaStream?.enqueue(
        new TextEncoder().encode(JSON.stringify(event) + "\n"),
      );
    }, event);
  await emit({ type: "activity", activity: "searching" });
  await expect(page.locator(".activity-searching")).toBeVisible();
  await page.screenshot({
    path: "test-results/figma-searching.png",
    animations: "disabled",
  });
  await emit({
    type: "delta",
    text: "## Una idea que empieza a encajar.\n\nBuscamos información actual.",
  });
  await expect(page.locator(".activity-composing")).toBeVisible();
  await page.screenshot({
    path: "test-results/figma-composing.png",
    animations: "disabled",
  });
  await emit({ type: "error", message: "No se pudo completar la búsqueda." });
  await expect(page.locator(".chat-error")).toContainText(
    "No se pudo completar",
  );
  await page.screenshot({
    path: "test-results/figma-recoverable-error.png",
    animations: "disabled",
  });
  await page.goto("/chat");
  let failed = false;
  await page.route("**/functions/v1/dream-api", async (route) => {
    if (
      route.request().postDataJSON().action === "attachment_upload" &&
      !failed
    ) {
      failed = true;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo cargar el archivo." }),
      });
      return;
    }
    await route.fallback();
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Subir apuntes", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Ecuaciones.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nQA fixture"),
  });
  await expect(page.locator(".composer .attachment-chip.error")).toBeVisible();
  await page.screenshot({
    path: "test-results/figma-attachment-error.png",
    animations: "disabled",
  });
  await page
    .locator(".composer")
    .getByRole("button", { name: "Reintentar Ecuaciones.pdf" })
    .click();
  await expect(page.locator(".file-card .attachment-chip.ready")).toBeVisible();
  await page.screenshot({
    path: "test-results/figma-file-card.png",
    animations: "disabled",
  });
  await page
    .locator(".file-card")
    .getByRole("button", { name: "Analizar archivo" })
    .click();
  await expect(page.locator(".message-user")).toContainText(
    "Analiza este archivo",
  );
  await page.getByRole("button", { name: "Detener respuesta" }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  for (const [name, path] of [
    ["progress", "/progress"],
    ["recents", "/chat?view=recent"],
    ["test", `/tests/${tid}`],
    ["math", `/chat?c=${cid}`],
  ]) {
    await page.goto(path);
    await expect(page.locator(".workspace-main")).toBeVisible();
    if (name === "test")
      await expect(page.locator(".test-options")).toBeVisible();
    if (name === "math") {
      await expect(page.locator(".message")).toHaveCount(2);
      await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
    }
    await page.screenshot({
      path: `test-results/figma-${name}-dark.png`,
      animations: "disabled",
    });
  }
});

test("Ajustes: delete history end to end, failure stays visible, account deletion with confirmation", async ({
  page,
}) => {
  await authenticated(page);
  let deleted = false;
  let failNext = true;
  await page.route("**/functions/v1/dream-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "conversations_delete_all") {
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 503,
          json: { error: "No se pudo borrar el historial. Inténtalo de nuevo." },
        });
        return;
      }
      deleted = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (body.action === "conversations" && deleted) {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fallback();
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Borrar historial" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("¿Borrar todo el historial?");
  await dialog.getByRole("button", { name: "Borrar historial" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "No se pudo borrar el historial",
  );
  await dialog.getByRole("button", { name: "Borrar historial" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Historial borrado." })).toContainText(
    "Ya no tienes conversaciones guardadas.",
  );
  expect(deleted).toBe(true);
  await page.goto("/chat?view=recent");
  await expect(
    page.getByRole("heading", { name: "Aún no hay conversaciones" }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  const account = page.getByRole("dialog");
  const remove = account.getByRole("button", { name: "Eliminar cuenta" });
  await expect(remove).toBeDisabled();
  await account
    .getByRole("textbox", { name: "Escribe ELIMINAR para confirmar" })
    .fill("ELIMINAR");
  const request = page.waitForRequest(
    (req) =>
      req.url().includes("/functions/v1/dream-api") &&
      req.postDataJSON()?.action === "account_delete",
  );
  await remove.click();
  expect((await request).postDataJSON().confirm).toBe("ELIMINAR");
  await expect(page).toHaveURL(/\/login/);
});
