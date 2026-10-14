import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  // Contract fixtures must remain in Playwright's network layer, not be bypassed by a registered SW.
  use: { baseURL: "http://localhost:3000", headless: true, serviceWorkers: "block" },
  workers: 1,
  reporter: "list",
  timeout: 30000,
});
