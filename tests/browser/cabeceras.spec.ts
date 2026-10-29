import { test, expect, type APIResponse } from "@playwright/test";

// Cabeceras de seguridad en las rutas principales (Bloque B4, docs/cabeceras.md).
// Sin sesión: la ruta privada y /revision se sirven igual a cualquiera.
const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) ?? "";

function common(response: APIResponse, path: string) {
  const h = response.headers();
  expect(h["x-content-type-options"], path).toBe("nosniff");
  expect(h["x-frame-options"], path).toBe("DENY");
  expect(h["cross-origin-opener-policy"], path).toBe("same-origin");
  expect(h["permissions-policy"], path).toContain("microphone=()");
  expect(h["permissions-policy"], path).toContain("camera=(self)");
  expect(h["referrer-policy"], path).toMatch(/^(strict-origin-when-cross-origin|no-referrer)$/);
  // HSTS: nunca preload (y en local, sin HTTPS, nada).
  expect(h["strict-transport-security"] ?? "", path).not.toContain("preload");
  return h;
}

for (const path of ["/", "/login", "/chat"]) {
  test(`page ${path}: CSP with nonce, no eval, no framing`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    const h = common(response, path);
    const csp = h["content-security-policy"] ?? "";
    expect(directive(csp, "script-src")).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    // Nonce fresco en cada petición.
    const again = (await request.get(path, { maxRedirects: 0 })).headers()["content-security-policy"];
    expect(again).not.toBe(csp);
  });
}

test("API route: same headers, never cached", async ({ request }) => {
  const response = await request.get("/api/ip-check");
  common(response, "/api/ip-check");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

// Headers that change on every response (dates, nonces, sizes) are left out.
const VOLATILE = new Set(["date", "content-security-policy", "content-length", "etag", "link", "x-nextjs-stale-time"]);
const strip = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).filter(([k]) => !VOLATILE.has(k)));

test("decoy admin routes are exactly the 404 of any missing page", async ({ request }) => {
  const missing = strip((await request.get("/esta-pagina-no-existe", { maxRedirects: 0 })).headers());
  for (const path of ["/admin", "/panel", "/administracion"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    common(response, path);
    expect(strip(response.headers()), path).toEqual(missing);
  }
});

// /revision is the panel while ADMIN_PANEL_PATH is not set (docs/PANEL_ADMIN.md).
// For a non-admin it is a 404 too, but with the panel's stricter headers: anyone
// can tell it apart. The fix is a secret ADMIN_PANEL_PATH (docs/cabeceras.md).
test("/revision for a non-admin: 404 with strict headers, never the panel", async ({ request }) => {
  const response = await request.get("/revision", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  const h = response.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  expect(await response.text()).not.toMatch(/Panel de administración|Revisión pendiente/);
});
