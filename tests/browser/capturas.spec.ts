import { test } from "@playwright/test";
import { mock, SCREENS, VIEWPORTS, SCHEMES } from "./design-fixture";
// Visual evidence for DISENO_AUDITORIA.md / DISENO_EVIDENCIA.md. Runs only when
// CAPTURAS_DIR is set: every screen at phone and desktop width, light and dark.
const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, "Set CAPTURAS_DIR to take screenshots");
test.use({ serviceWorkers: "block" });

for (const screen of SCREENS)
  for (const vp of VIEWPORTS)
    for (const scheme of SCHEMES)
      test(`${screen.name} ${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        if (screen.signedOut)
          await page.addInitScript(() =>
            localStorage.setItem("dream-storage-notice-v1", "1"),
          );
        else
          await mock(page, {
            pendingChat: screen.pendingChat,
            profile: screen.profile,
          });
        await page.goto(screen.path);
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
        if (screen.ready) await screen.ready(page).catch(() => {});
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `${OUT}/${screen.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`,
          fullPage: true,
        });
      });
