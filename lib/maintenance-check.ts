/**
 * ¿La respuesta es un desafío de Cloudflare y no de Dream? Con «Under Attack
 * Mode» o una regla de desafío, Cloudflare contesta a las llamadas de la app con
 * su página (403 o 503) en vez de dejarlas pasar. Eso no es «mantenimiento» ni
 * «sin permiso»: no se debe cerrar la sesión del alumno por ello.
 * Cloudflare marca esas respuestas con `cf-mitigated: challenge`; además, las
 * respuestas de Dream a esta ruta siempre son JSON.
 */
export function cloudflareChallenge(response: Pick<Response, "headers" | "ok">): boolean {
  if (response.headers.get("cf-mitigated")) return true;
  if (response.ok) return false;
  const type = response.headers.get("content-type") ?? "";
  return !type.includes("application/json");
}
