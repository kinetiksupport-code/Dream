/**
 * La única lectura de la IP del visitante en la web (Next.js). docs/ip-real.md.
 *
 * - Solo en Vercel: Vercel sobrescribe `x-real-ip` con la IP que ve y no deja
 *   pasar la que mande el cliente. Fuera de Vercel (local, otro servidor) esa
 *   cabecera la puede escribir cualquiera, así que no hay IP.
 * - Nunca se lee `cf-connecting-ip`, `x-forwarded-for` (primer valor),
 *   `true-client-ip` ni `forwarded`: quien entre por *.vercel.app sin pasar por
 *   Cloudflare puede escribirlas.
 * - Si la IP que da Vercel es de Cloudflare (Vercel no hubiera traducido la
 *   cabecera de Cloudflare), no es la del alumno: devuelve null. Una IP de
 *   Cloudflare la comparten miles de personas y no se puede limitar ni bloquear.
 * - Ante cualquier duda, null: más vale no limitar que limitar a otra persona.
 *
 * Sin dependencias de Node: vale en middleware y en rutas.
 */

type Env = Record<string, string | undefined>;

/** Rangos oficiales de Cloudflare (https://www.cloudflare.com/ips/, 2026-10-29). */
export const CLOUDFLARE_RANGES: readonly string[] = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** IP como bits (32 para IPv4, 128 para IPv6), o null si no es una IP. */
function toBits(value: string): { v: 4 | 6; bits: bigint } | null {
  if (V4.test(value)) {
    const bits = value.split(".").reduce((acc, part) => (acc << 8n) | BigInt(Number(part)), 0n);
    return { v: 4, bits };
  }
  if (!value.includes(":") || value.length > 45 || /[^0-9a-f:.]/i.test(value)) return null;
  let host: string;
  try {
    host = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [head, tail] = host.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return { v: 6, bits: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n) };
}

export function isValidIp(value: string): boolean {
  return toBits(value) !== null;
}

export function inRange(ip: string, cidr: string): boolean {
  const [base, size] = cidr.split("/");
  const a = toBits(ip);
  const b = toBits(base);
  if (!a || !b || a.v !== b.v) return false;
  const total = a.v === 4 ? 32n : 128n;
  const shift = total - BigInt(Number(size));
  return a.bits >> shift === b.bits >> shift;
}

export const isCloudflareIp = (ip: string) => CLOUDFLARE_RANGES.some((cidr) => inRange(ip, cidr));

export function getClientIp(request: { headers: Headers }, env: Env = process.env): string | null {
  if (env.VERCEL !== "1") return null;
  const ip = request.headers.get("x-real-ip")?.trim() ?? "";
  if (!ip || ip.length > 45 || !isValidIp(ip)) return null;
  if (isCloudflareIp(ip)) return null;
  return ip;
}
