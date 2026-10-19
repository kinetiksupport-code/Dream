import type { Page } from "@playwright/test";
/**
 * Whole-page screenshot for the Shell, whose scroll lives in .workspace-main
 * (Playwright's fullPage only sees the window). Grows the viewport to the
 * content height, takes the shot from the top and restores the size.
 */
export async function fullShot(page: Page, path: string) {
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  const height = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".workspace-main");
    main?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    const extra = main ? window.innerHeight - main.clientHeight : 0;
    return Math.max(
      document.documentElement.scrollHeight,
      main ? main.scrollHeight + extra : 0,
    );
  });
  await page.setViewportSize({ width: size.width, height: Math.min(height, 7000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await page.setViewportSize(size);
}
