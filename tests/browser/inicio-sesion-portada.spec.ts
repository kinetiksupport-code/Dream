// Con la sesión iniciada, abrir edudream.es lleva a Inicio sin pasar por la landing.
import { test, expect } from "@playwright/test";
import { mock } from "./design-fixture";

test.use({ serviceWorkers: "block" });

test("con sesión, la portada lleva a Inicio; con «?landing», se ve la landing", async ({ page }) => {
  await mock(page, {});
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto("/?landing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Saca\s*tu mejor\s*nota/i);
});

test("sin sesión, la portada se queda en la landing", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dream-storage-notice-v1", "1"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Saca\s*tu mejor\s*nota/i);
});
