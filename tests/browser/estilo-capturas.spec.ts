import { test } from "@playwright/test";
import { mock, SCREENS, SCHEMES } from "./design-fixture";
// Evidence for the «estilo» screen PRs (chat, tareas, apuntes): phone 390 px
// and desktop 1280 px, light and dark, plus one reduced-motion capture per
// screen. Runs only with CAPTURAS_DIR set; ESTILO_PANTALLAS picks the screens
// by their design-fixture name (comma separated).
const OUT = process.env.CAPTURAS_DIR;
const ONLY = (process.env.ESTILO_PANTALLAS ?? "").split(",").filter(Boolean);
test.skip(!OUT || ONLY.length === 0, "Set CAPTURAS_DIR and ESTILO_PANTALLAS");
test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { name: "movil", width: 390, height: 844 },
  { name: "escritorio", width: 1280, height: 800 },
] as const;
const VARIANTS = [
  ...VIEWPORTS.flatMap((vp) =>
    SCHEMES.map((scheme) => ({ vp, scheme, reduced: false })),
  ),
  { vp: VIEWPORTS[0], scheme: "light" as const, reduced: true },
];

for (const screen of SCREENS.filter((s) => ONLY.includes(s.name)))
  for (const { vp, scheme, reduced } of VARIANTS)
    test(`${screen.name} ${vp.name} ${scheme}${reduced ? " reducido" : ""}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({
        colorScheme: scheme,
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await mock(page, {
        pendingChat: screen.pendingChat,
        profile: screen.profile,
      });
      await page.goto(screen.path);
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
      if (screen.ready) await screen.ready(page).catch(() => {});
      await page.waitForTimeout(700);
      const tail = reduced
        ? "reducido"
        : scheme === "light"
          ? "claro"
          : "oscuro";
      await page.screenshot({
        path: `${OUT}/${screen.name}-${vp.name}-${tail}.png`,
        fullPage: true,
      });
    });
