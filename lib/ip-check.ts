import { getClientIp, isCloudflareIp, isValidIp } from "@/lib/client-ip";

type Env = Record<string, string | undefined>;

/**
 * Diagnóstico de la lectura de IP (docs/ip-real.md). Solo dice «sí» o «no»:
 * nunca devuelve ni registra una IP.
 */
export function ipCheck(headers: Headers, env: Env = process.env) {
  const vercel = headers.get("x-real-ip")?.trim() ?? "";
  const cf = headers.get("cf-connecting-ip")?.trim() ?? "";
  return {
    // Cloudflare añade cf-ray a todo lo que pasa por su proxy.
    pasa_por_cloudflare: headers.has("cf-ray"),
    en_vercel: env.VERCEL === "1",
    ip_de_vercel: !vercel ? "ninguna" : !isValidIp(vercel) ? "no_valida" : isCloudflareIp(vercel) ? "de_cloudflare" : "del_visitante",
    coincide_con_cloudflare: cf ? cf === vercel : null,
    ip_usable: getClientIp({ headers }, env) !== null,
  };
}
