import { test, expect } from "@playwright/test";
// Google sign-in (bloque 1): the button asks Supabase for the right return
// address, and every failed return lands on the login with a Spanish message.
test.use({ serviceWorkers: "block" });

test("«Continuar con Google» asks Supabase to return to /auth/callback", async ({
  page,
  baseURL,
}) => {
  await page.route("**/auth/v1/settings", (route) =>
    route.fulfill({ json: { external: { google: true } } }),
  );
  const authorize = new Promise<URL>((resolve) =>
    page.route("**/auth/v1/authorize**", (route) => {
      resolve(new URL(route.request().url()));
      return route.fulfill({ status: 200, body: "ok" });
    }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  const url = await authorize;
  expect(url.searchParams.get("provider")).toBe("google");
  // Local server: the return address is this origin, never another host.
  expect(url.searchParams.get("redirect_to")).toBe(
    `${new URL(baseURL!).origin}/auth/callback`,
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
});

for (const [query, message] of [
  [
    "?error=access_denied&error_description=User+denied",
    "Has cancelado el acceso con Google.",
  ],
  [
    "?error=server_error&error_description=Unable+to+exchange",
    "Google no pudo completar el acceso.",
  ],
  ["", "Google no devolvió el permiso de acceso."],
] as const)
  test(`callback «${query || "sin code"}» shows «${message}» and a retry button`, async ({
    page,
  }) => {
    await page.goto(`/auth/callback${query}`);
    await expect(page).toHaveURL(/\/login\?error=/);
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText(message);
    const retry = alert.getByRole("button", { name: "Volver a intentarlo" });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("body")).not.toContainText("requested path");
  });

test("an unknown error code still shows a Spanish message, never the raw text", async ({
  page,
}) => {
  await page.goto("/login?error=%3Cb%3Ex%3C%2Fb%3E");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "No se pudo completar el acceso. Inténtalo de nuevo.",
  );
  await expect(page.locator("main").getByRole("alert")).not.toContainText(
    "<b>",
  );
});
