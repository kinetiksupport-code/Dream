import { test, expect, type Page } from "@playwright/test";
import { mock } from "./design-fixture";
import { emptyBoard, routeByRules, updateBoard } from "../../supabase/functions/dream-api/conversation-memory.mjs";
// Dreams interactivos (docs/ESQUEMAS.md, Bloque 7): del chat a la tarjeta, el
// juego en su iframe aislado (teclado y arrastrar), el aislamiento frente a un
// juego malicioso y la sección «Dreams» con filtro. API simulada.
test.use({ serviceWorkers: "block" });

const gid = "66666666-6666-4666-8666-666666666666";
const mid = "88888888-8888-4888-8888-888888888888";
const sid = "55555555-5555-4555-8555-555555555555";
const aid = "77777777-7777-4777-8777-777777777777";

const classify = {
  kind: "classify",
  title: "Tipos de sintagma",
  instructions: "Coloca cada sintagma en su tipo.",
  categories: ["Sintagma nominal", "Sintagma verbal"],
  items: [
    { text: "la casa blanca", category: "Sintagma nominal", explanation: "El núcleo es «casa»." },
    { text: "come manzanas", category: "Sintagma verbal", explanation: "El núcleo es «come»." },
    { text: "el perro", category: "Sintagma nominal", explanation: "El núcleo es «perro»." },
    { text: "corre mucho", category: "Sintagma verbal", explanation: "El núcleo es «corre»." },
  ],
};
const match = {
  kind: "match",
  title: "La célula",
  instructions: "Une cada concepto con su definición.",
  pairs: [
    { concept: "Fotosíntesis", definition: "Las plantas fabrican materia orgánica con luz." },
    { concept: "Mitocondria", definition: "Orgánulo de la respiración celular." },
    { concept: "Cloroplasto", definition: "Orgánulo donde se hace la fotosíntesis." },
  ],
};

// Router de dream-api simulado con la lógica real (conversation-memory.mjs) y
// su pizarra, para que el navegador pruebe el flujo de verdad.
function routeMock() {
  let board = emptyBoard();
  let files: string[] = [];
  return (b: { prompt: string; attachment_ids: string[] }) => {
    files = [...files, ...b.attachment_ids];
    const r = routeByRules({ prompt: b.prompt, board, hasFiles: files.length > 0, attached: b.attachment_ids.length });
    board = updateBoard(board, { prompt: b.prompt, route: r });
    if (["dreams_game", "dreams_scheme", "test"].includes(r.intent)) board = updateBoard(board, { prompt: b.prompt, delivered: { type: r.intent, title: "x" } });
    return { route: { intent: r.intent, kind: r.kind ?? null, topic: r.topic ?? "", ask: r.ask ?? null, attachment_ids: r.intent === "chat" ? [] : files.slice(-1) } };
  };
}

async function api(page: Page, calls: Record<string, unknown>[] = []) {
  await mock(page);
  const router = routeMock();
  await page.route("**/functions/v1/dream-api", async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b);
    if (b.action === "chat_route") return route.fulfill({ json: router(b) });
    if (b.action === "attachment_upload")
      return route.fulfill({ json: { attachment: { id: aid, file_name: b.file_name, status: "processed" } } });
    if (b.action === "game_generate") {
      const widget = { type: "game", gameId: gid, title: classify.title, kind: "classify", count: 4 };
      return route.fulfill({ json: { game: { id: gid, title: classify.title, kind: "classify" }, widget,
        assistant_message: `He preparado un juego para practicar **${classify.title}**.\n\n<!--DREAM_WIDGET:${JSON.stringify(widget)}-->` } });
    }
    if (b.action === "game_get") {
      const content = b.game_id === mid ? match : classify;
      return route.fulfill({ json: { game: { id: b.game_id, kind: content.kind, title: content.title, content, best_score: null, total: null, plays: 0 } } });
    }
    if (b.action === "game_result")
      return route.fulfill({ json: { result: { best_score: b.aciertos, last_score: b.aciertos, total: b.total, plays: 1 } } });
    if (b.action === "dreams_list")
      return route.fulfill({ json: { dreams: [
        { type: "game", id: gid, title: classify.title, kind: "classify", best_score: 3, total: 4, updated_at: "2026-10-27T10:00:00Z" },
        { type: "scheme", id: sid, title: "Al-Ándalus", subject: "Historia", updated_at: "2026-10-27T09:00:00Z" },
      ] } });
    return route.fallback();
  });
}

test("chat con apuntes: «clasifica los sintagmas» crea un juego «Dreams» sin pasar por el chat", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.locator('.composer input[type="file"]').setInputFiles({ name: "sintagmas.txt", mimeType: "text/plain", buffer: Buffer.from("El sintagma nominal…") });
  await page.getByLabel("Mensaje para Dream").fill("Hazme un juego para clasificar los sintagmas");
  await expect(page.getByLabel("Enviar mensaje")).toBeEnabled();
  await page.getByLabel("Enviar mensaje").click();
  const card = page.locator('a.quiz-widget[data-kind="game"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Dreams · Clasificar");
  await expect(card).toHaveAttribute("href", `/juegos/${gid}`);
  const generate = calls.find((c) => c.action === "game_generate");
  expect(generate?.attachment_ids).toEqual([aid]);
  expect(generate?.kind).toBe("classify");
  expect(calls.some((c) => c.action === "chat")).toBe(false);
});

test("sin apuntes, «hazme un juego» los pide sin gastar cupo", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.getByLabel("Mensaje para Dream").fill("Hazme un juego de la célula");
  await page.getByLabel("Enviar mensaje").click();
  await expect(page.getByText("Para hacerte un juego fiable necesito tus apuntes")).toBeVisible();
  expect(calls.some((c) => c.action === "chat" || c.action === "game_generate")).toBe(false);
});

test("el caso de Carlos: «genérame un Dreams» pregunta el tipo y «un juego» lo crea sin pedir otra vez el archivo", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto("/chat");
  await page.locator('.composer input[type="file"]').setInputFiles({ name: "apuntes-sintagmas.txt", mimeType: "text/plain", buffer: Buffer.from("El sintagma nominal…") });
  await page.getByLabel("Mensaje para Dream").fill("genérame un Dreams de los sintagmas");
  await expect(page.getByLabel("Enviar mensaje")).toBeEnabled();
  await page.getByLabel("Enviar mensaje").click();
  await expect(page.getByText("¿Cómo lo quieres")).toBeVisible();
  await page.getByLabel("Mensaje para Dream").fill("un juego");
  await page.getByLabel("Enviar mensaje").click();
  const card = page.locator('a.quiz-widget[data-kind="game"]');
  await expect(card).toBeVisible();
  const generate = calls.find((c) => c.action === "game_generate");
  expect(generate?.attachment_ids).toEqual([aid]);
  expect(generate?.kind).toBe("classify");
  await expect(page.getByText(/necesito tus apuntes|vuelve a subir|súbeme/i)).toHaveCount(0);
  expect(calls.some((c) => c.action === "chat")).toBe(false);
});

test("clasificar solo con el teclado: colocar, comprobar, explicación del fallo y resultado guardado", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.goto(`/juegos/${gid}`);
  await expect(page.getByRole("heading", { level: 1, name: classify.title })).toBeVisible();
  await expect(page.getByText("Generado por IA a partir de tus apuntes. Revísalo")).toBeVisible();
  const frame = page.frameLocator('[data-testid="game-frame"]');
  const place = async (text: string, category: string) => {
    await frame.getByRole("button", { name: text, exact: true }).focus();
    await page.keyboard.press("Enter");
    await frame.getByRole("button", { name: `Colocar en ${category}` }).focus();
    await page.keyboard.press("Enter");
  };
  await expect(frame.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  await place("la casa blanca", "Sintagma nominal");
  await place("come manzanas", "Sintagma verbal");
  await place("el perro", "Sintagma nominal");
  await place("corre mucho", "Sintagma nominal"); // fallo a propósito
  await expect(frame.getByRole("button", { name: "Comprobar" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(frame.locator("#score")).toHaveText("3 de 4 bien");
  await expect(frame.getByText("Va en «Sintagma verbal»: El núcleo es «corre».")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "3 de 4" })).toBeVisible();
  await expect.poll(() => calls.find((c) => c.action === "game_result")).toMatchObject({ game_id: gid, aciertos: 3, total: 4 });
  await expect(page.getByText("Tu mejor marca:")).toContainText("3 de 4");
  await frame.getByRole("button", { name: "Volver a jugar" }).click();
  await expect(frame.getByRole("button", { name: "Comprobar" })).toBeDisabled();
});

test("emparejar: tocar y arrastrar, deshacer una pareja y todo bien", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/juegos/${mid}`);
  const frame = page.frameLocator('[data-testid="game-frame"]');
  const concept = (name: string) => frame.getByRole("button", { name: new RegExp(`^${name}`) });
  const definition = (text: string) => frame.getByRole("button", { name: new RegExp(`^${text}`) });
  await concept("Fotosíntesis").click();
  await definition("Orgánulo de la respiración").click(); // mal
  await concept("Fotosíntesis").click(); // deshacer
  await expect(concept("Fotosíntesis")).toHaveAttribute("aria-label", "Fotosíntesis");
  await concept("Fotosíntesis").click();
  await definition("Las plantas fabrican").click();
  // Arrastrar con el ratón (pointer events, igual que con el dedo).
  const from = (await concept("Mitocondria").boundingBox())!;
  const to = (await definition("Orgánulo de la respiración").boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + from.height / 2 + 10, { steps: 4 });
  await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(concept("Mitocondria")).toHaveAttribute("aria-label", /pareja 2/);
  await concept("Cloroplasto").click();
  await definition("Orgánulo donde se hace").click();
  await frame.getByRole("button", { name: "Comprobar" }).click();
  await expect(frame.locator("#score")).toHaveText("3 de 3 bien");
  await expect(page.getByRole("status").filter({ hasText: "¡Todo bien!" })).toBeVisible();
  // Sin scroll horizontal en el móvil.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("aislamiento: un juego malicioso no lee el almacenamiento ni las cookies de Dream, no hace peticiones y Dream ignora sus mensajes", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await api(page, calls);
  const leaked: string[] = [];
  await page.route("**/robado**", (route) => {
    leaked.push(route.request().url());
    return route.fulfill({ body: "ok" });
  });
  await page.goto(`/juegos/${gid}`);
  await page.evaluate(() => {
    localStorage.setItem("dream-secreto", "token-de-prueba");
    document.cookie = "dream_cookie=secreta; path=/";
  });
  await expect(page.locator('[data-testid="game-frame"]')).toHaveAttribute("sandbox", "allow-scripts");
  const report = await page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve) => {
        const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="game-frame"]')!;
        window.addEventListener("message", (e) => {
          if (e.source === iframe.contentWindow && e.data?.tipo === "informe") resolve(e.data);
        });
        // Un «Dream malicioso de prueba»: mismo documento y misma CSP que un
        // juego real, con un script hostil al final.
        const evil = `<script>
          (async function () {
            const out = { tipo: "informe" };
            try { out.storage = String(localStorage.getItem("dream-secreto")); } catch (e) { out.storage = "bloqueado:" + e.name; }
            try { out.cookie = document.cookie || "vacía"; } catch (e) { out.cookie = "bloqueado:" + e.name; }
            try { out.parent = String(parent.document.title); } catch (e) { out.parent = "bloqueado:" + e.name; }
            try { await fetch("${location.origin}/robado?f=1"); out.fetch = "hecho"; } catch (e) { out.fetch = "bloqueado"; }
            try { new Image().src = "${location.origin}/robado?img=1"; } catch (e) {}
            try { parent.location.href = "${location.origin}/settings"; out.nav = "hecho"; } catch (e) { out.nav = "bloqueado"; }
            parent.postMessage({ tipo: "resultado", aciertos: 99, total: 4 }, "*");
            parent.postMessage({ tipo: "resultado", aciertos: 1, total: 4, extra: "x" }, "*");
            setTimeout(() => parent.postMessage(out, "*"), 300);
          })();
        <\/script>`;
        iframe.srcdoc = iframe.srcdoc.replace("</body>", `${evil}</body>`);
      }),
  );
  expect(report.storage).toMatch(/^bloqueado/);
  expect(report.cookie).not.toContain("secreta");
  expect(report.parent).toMatch(/^bloqueado/);
  expect(report.fetch).toBe("bloqueado");
  await page.waitForTimeout(500);
  expect(leaked).toEqual([]);
  await expect(page).toHaveURL(new RegExp(`/juegos/${gid}$`));
  expect(calls.some((c) => c.action === "game_result")).toBe(false);
  await expect(page.getByRole("status").filter({ hasText: "de 4" })).toHaveCount(0);
});

test("sección «Dreams»: esquemas y juegos con filtro por tipo, y entrada en la navegación", async ({ page }) => {
  await api(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/dreams");
  await expect(page.getByRole("heading", { level: 1, name: "Dreams" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dreams" }).first()).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("list", { name: "Tus Dreams" });
  await expect(list.getByRole("link")).toHaveCount(2);
  await expect(list.getByRole("link").first()).toContainText("mejor marca 3/4");
  await page.getByRole("button", { name: "Juegos" }).click();
  await expect(page.getByRole("button", { name: "Juegos" })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list.getByRole("link")).toHaveAttribute("href", `/juegos/${gid}`);
  await page.getByRole("button", { name: "Esquemas" }).click();
  await expect(list.getByRole("link")).toHaveAttribute("href", `/esquemas/${sid}`);
  // Móvil: «Más» lleva a Dreams.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/more");
  await expect(page.getByRole("link", { name: "Dreams" })).toHaveAttribute("href", "/dreams");
});
