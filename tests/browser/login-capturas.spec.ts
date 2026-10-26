import { test } from "@playwright/test";
import { fullShot } from "./full-shot";
import { mock, SCREENS } from "./design-fixture";
// Visual evidence for docs/diseno/login (PR «estilo login»): sign-in and the
// first-run welcome (name, hobbies, nickname, age and consent), phone (390) and desktop (1280),
// light and dark, plus a reduced-motion pass. Runs only with CAPTURAS_DIR.
const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 900 },
] as const;
const NAMES = [
  "login",
  "login-error",
  "login-registro",
  "bienvenida-nombre",
  "bienvenida-nombre-error",
  "bienvenida-gustos",
  "bienvenida-apodo",
  "bienvenida-edad",
  "bienvenida-ia",
  "bienvenida-ia-error",
  "bienvenida-listo",
  "bienvenida-menor",
];

for (const screen of SCREENS.filter((s) => NAMES.includes(s.name)))
  for (const vp of VIEWPORTS)
    for (const scheme of ["light", "dark"] as const)
      test(`${screen.name} ${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        if (screen.signedOut)
          await page.addInitScript(() =>
            localStorage.setItem("dream-storage-notice-v1", "1"),
          );
        else await mock(page, { profile: screen.profile });
        await page.goto(screen.path);
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
        if (screen.ready) await screen.ready(page).catch(() => {});
        await page.waitForTimeout(700);
        await fullShot(
          page,
          `${OUT}/${screen.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
        );
      });

test("login movimiento reducido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() =>
    localStorage.setItem("dream-storage-notice-v1", "1"),
  );
  await page.goto("/login");
  await page.getByRole("heading").first().waitFor();
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/login-reducido-60ms-movil-claro.png` });
  await page.waitForTimeout(700);
  await fullShot(page, `${OUT}/login-reducido-movil-claro.png`);
});

// GRABAR=<carpeta>: a short video of the login entry (mascot, headline,
// marker), the Google button's hover and press, and the registration step.
const REC = process.env.GRABAR;
for (const vp of VIEWPORTS)
  test(`login grabación ${vp.name}`, async ({ browser }) => {
    test.skip(!REC, "Set GRABAR to record the video");
    const size = { width: vp.width, height: vp.name === "movil" ? 844 : 800 };
    const context = await browser.newContext({
      viewport: size,
      recordVideo: { dir: `${REC}/${vp.name}`, size },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem("dream-storage-notice-v1", "1"),
    );
    await page.route("**/auth/v1/settings", () => {}); // never leaves the page
    await page.goto("/login");
    await page.waitForTimeout(1500);
    const google = page.getByRole("button", { name: "Continuar con Google" });
    await google.hover();
    await page.waitForTimeout(400);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await page.waitForTimeout(600);
    await context.close();

    const second = await browser.newContext({
      viewport: size,
      recordVideo: { dir: `${REC}/${vp.name}-registro`, size },
      serviceWorkers: "block",
    });
    const reg = await second.newPage();
    const welcome = SCREENS.find((s) => s.name === "bienvenida-menor");
    await mock(reg, { profile: welcome?.profile });
    await reg.goto("/chat");
    await reg.locator("h1").first().waitFor();
    await reg.waitForTimeout(1200);
    if (welcome?.ready) await welcome.ready(reg).catch(() => {});
    await reg.waitForTimeout(1200);
    await second.close();
  });
