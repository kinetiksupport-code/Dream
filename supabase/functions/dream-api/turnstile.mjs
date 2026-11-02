// Cloudflare Turnstile: comprobación «no soy un robot» validada SIEMPRE aquí,
// en el servidor (docs/turnstile.md). Solo en tres sitios: la subida por QR
// desde el móvil, «Reclamar» y la primera acción de IA de una cuenta nueva
// cuando la app sospecha. Nunca en el inicio de sesión.
//
// - Sin TURNSTILE_SECRET_KEY no se pide nada (todavía no está configurado).
// - Con la clave, falla cerrado: si Cloudflare no responde, la acción no se hace.
// - El token vale una vez y 5 minutos. Cloudflare rechaza los repetidos
//   (timeout-or-duplicate) y además aquí se recuerdan los ya usados.
// - Se comprueban success, hostname y action. Nunca se registra el token.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTIONS = Object.freeze({ qr: "subida_qr", appeal: "reclamar", firstAi: "primera_ia" });
export const TURNSTILE_HOSTNAMES = Object.freeze(["edudream.es", "www.edudream.es"]);
export const TOKEN_MAX_LENGTH = 2048;
export const TOKEN_TTL_MS = 300_000;
export const TIMEOUT_MS = 5_000;
export const HUMAN_CHECK_MESSAGE = "No hemos podido comprobar que eres una persona, vuelve a intentarlo.";

/** Turnstile está activo si existe la clave secreta. */
export function turnstileEnabled(env) {
  return typeof env?.TURNSTILE_SECRET_KEY === "string" && env.TURNSTILE_SECRET_KEY.length > 0;
}

/** Dominios aceptados: los de Dream y, si se configuran, otros (p. ej. localhost para pruebas). */
export function allowedHostnames(env) {
  const extra = String(env?.TURNSTILE_EXTRA_HOSTNAMES ?? "")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set([...TURNSTILE_HOSTNAMES, ...extra]);
}

async function tokenKey(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tokens ya usados en esta instancia (huella, nunca el token), hasta que caducan. */
export function createSpentTokens(now = () => Date.now()) {
  const seen = new Map();
  return {
    /**
     * true si el token es nuevo, y lo marca como usado en el mismo paso (sin
     * ninguna espera entre mirar y marcar: dos peticiones a la vez con el mismo
     * token no pueden pasar las dos).
     */
    async claim(token) {
      const key = await tokenKey(token);
      const t = now();
      for (const [k, until] of seen) if (until <= t) seen.delete(k);
      if (seen.has(key)) return false;
      seen.set(key, t + TOKEN_TTL_MS);
      return true;
    },
  };
}
const spentDefault = createSpentTokens();

/** @typedef {{ ok: boolean, skipped?: boolean, status?: number, code?: string, message?: string }} HumanCheck */

/** @returns {HumanCheck} */
const fail = (code, status = 403) => ({ ok: false, status, code, message: HUMAN_CHECK_MESSAGE });

/**
 * Valida un token de Turnstile. Devuelve { ok: true } o
 * { ok: false, status, code, message }. Códigos:
 *  - turnstile_required: no hay token (el navegador debe mostrar el widget)
 *  - turnstile_failed: token inválido, repetido, caducado, de otro dominio o de otra acción
 *  - turnstile_unavailable: Cloudflare no responde (la acción no se hace)
 * @param {{ token: unknown, action: string, env: Record<string, string | undefined>, remoteip?: string | null,
 *   fetchImpl?: typeof fetch, spent?: ReturnType<typeof createSpentTokens>, now?: number, timeoutMs?: number,
 *   log?: (line: string) => void }} options
 * @returns {Promise<HumanCheck>}
 */
export async function verifyTurnstile({
  token,
  action,
  env,
  remoteip = null,
  fetchImpl = fetch,
  spent = spentDefault,
  now = Date.now(),
  timeoutMs = TIMEOUT_MS,
  log = console.error,
}) {
  if (!turnstileEnabled(env)) return { ok: true, skipped: true };
  if (typeof token !== "string" || !token) return fail("turnstile_required", 428);
  if (token.length > TOKEN_MAX_LENGTH) return fail("turnstile_failed");
  // Se marca antes de preguntar a Cloudflare.
  if (!(await spent.claim(token))) return fail("turnstile_failed");

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, idempotency_key: crypto.randomUUID() });
  if (remoteip) body.set("remoteip", remoteip);
  let data;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`siteverify_${response.status}`);
    data = await response.json();
  } catch {
    log(JSON.stringify({ event: "turnstile_unavailable", action }));
    return fail("turnstile_unavailable", 503);
  }
  if (!data || typeof data !== "object") return fail("turnstile_unavailable", 503);

  const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].map(String) : [];
  // Clave secreta mal puesta o error de Cloudflare: es fallo nuestro, no del alumno.
  if (codes.some((c) => c === "missing-input-secret" || c === "invalid-input-secret" || c === "internal-error")) {
    log(JSON.stringify({ event: "turnstile_unavailable", action, codes }));
    return fail("turnstile_unavailable", 503);
  }
  if (data.success !== true) {
    log(JSON.stringify({ event: "turnstile_rejected", action, codes }));
    return fail("turnstile_failed");
  }
  const hostname = String(data.hostname ?? "").toLowerCase();
  if (!allowedHostnames(env).has(hostname)) {
    log(JSON.stringify({ event: "turnstile_rejected", action, codes: ["hostname"] }));
    return fail("turnstile_failed");
  }
  if (data.action !== action) {
    log(JSON.stringify({ event: "turnstile_rejected", action, codes: ["action"] }));
    return fail("turnstile_failed");
  }
  const solved = Date.parse(String(data.challenge_ts ?? ""));
  if (!Number.isFinite(solved) || now - solved > TOKEN_TTL_MS) {
    log(JSON.stringify({ event: "turnstile_rejected", action, codes: ["expired"] }));
    return fail("turnstile_failed");
  }
  return { ok: true };
}
