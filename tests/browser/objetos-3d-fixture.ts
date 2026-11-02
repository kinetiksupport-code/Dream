import type { Page } from "@playwright/test";
// Ayudas para las pruebas del objeto 3D (PR 6). Solo para pruebas.

/** Sin GPU en CI: WebGL 2 por software (SwiftShader). */
export const LAUNCH_3D = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
};

export const MOBILE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 800 };

/**
 * Equipo de escritorio «normal» en el navegador de pruebas: 8 núcleos (o los
 * que digas), 8 GB, y WebGL por software aceptado (en un equipo real sin GPU
 * la app se queda, a propósito, con el icono: failIfMajorPerformanceCaveat).
 */
export async function capableDesktop(page: Page, cores = 8) {
  await page.addInitScript((c: number) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      opts?: Record<string, unknown>,
    ) {
      const o = opts ? { ...opts, failIfMajorPerformanceCaveat: false } : opts;
      return (get as (t: string, o?: unknown) => RenderingContext | null).call(this, type, o);
    } as typeof HTMLCanvasElement.prototype.getContext;
  }, cores);
}

/** Apunta las peticiones del trozo 3D (three o la escena) y los errores. */
export function watch(page: Page) {
  const chunks: string[] = [];
  const errors: string[] = [];
  page.on("response", async (r) => {
    const url = r.url();
    if (!/\/_next\/static\/chunks\/.+\.js/.test(url)) return;
    const body = await r.text().catch(() => "");
    if (/WebGLRenderer|webglcontextlost/.test(body)) chunks.push(url);
  });
  page.on("console", (m) => {
    // Cookiebot no está autorizado en localhost: su 404 de configuración no es de la página.
    if (m.type() === "error" && !/\.cookiebot\.(com|eu)\//.test(m.location().url)) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return { chunks, errors };
}

export const object3d = (page: Page) => page.locator(".subject-object[data-3d]").first();
