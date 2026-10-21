// Moderación y antiabuso por tasa (bloques B1 y B2).
//
// Las normas son las de la tabla G de los términos (content/legal/terminos.ts,
// §6.G). Aquí solo hay datos y decisiones puras; nada se inventa:
//  - G-SPAM  «Spam, mensajes repetidos o saturar el chat»: 1.ª vez, limitación
//    automática de minutos u horas; reincidencia, baneo de 24 h y luego de 7 días.
//  - G-BOT   «Bots, scripts, scraping o sobrecargar el servicio»: baneo de 7 días
//    y, si se repite, permanente.
// Decisión de Carlos (20/10/2026): lo automático por tasa es SOLO un bloqueo
// temporal de 24 h. Los baneos de 7 días o más los propone el sistema (queda
// como sanción «revision_pendiente») y los confirma una persona.

import { isIP } from "node:net";

export const RULES = Object.freeze({
  spam: Object.freeze({ id: "G-SPAM", table: "Spam, mensajes repetidos o saturar el chat" }),
  bot: Object.freeze({ id: "G-BOT", table: "Bots, scripts, scraping o sobrecargar el servicio" }),
  multi: Object.freeze({ id: "G-MULTI", table: "Varias cuentas para saltarse límites, cola o un baneo" }),
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Umbrales. Sobre peticiones que consumen IA contadas ANTES de la admisión. */
export const THRESHOLDS = Object.freeze({
  // Con 5 cuentas distintas o más en la última hora la IP es una red compartida
  // (colegio, biblioteca, datos móviles): nunca se bloquea la IP entera.
  sharedNetworkMinUsers: 5,
  // Una IP con pocas cuentas: 4 cuentas × 6 por minuto (límite normal) = 24.
  burstPerMinute: 40,
  // 4 cuentas × 50 al día = 200 como máximo legítimo en un día; en una hora, menos.
  hourPerIp: 150,
  // Una cuenta que sigue insistiendo en una hora (el límite normal es 6 por minuto
  // y 50 al día, así que esto solo se supera martilleando tras los rechazos).
  userHour: 60,
  // Menores de 18: umbrales más estrictos para avisar, castigo nunca más duro.
  minorFactor: 0.75,
  ipBlockMs: DAY,
  firstLimitMs: HOUR,
  repeatLimitMs: DAY,
  // Reincidencia: a la 3.ª vez en 7 días se propone un baneo de 7 días.
  proposeBanAfterPrior: 2,
  proposedBanMs: 7 * DAY,
  repeatWindowDays: 7,
  // B3: cuentas nuevas desde la IP de una cuenta baneada.
  observationDays: 2,
  windowDays: 30,
  entryGapMinutes: 30,
  // 4 cuentas distintas o menos en 30 días: IP «de tamaño de hogar». Más: red compartida.
  homeMaxAccounts: 4,
  // Entradas mínimas para confirmar (configurable entre 4 y 7; empieza en 4).
  minEntries: 4,
  minEntriesRange: [4, 7],
  banDays: 7,
});

export const MESSAGES = Object.freeze({
  mod_ip_blocked:
    "Hemos detectado un uso anormal desde tu conexión y está bloqueada durante 24 h. Si crees que es un error, escríbenos.",
  mod_user_limited:
    "Hemos limitado tu cuenta durante un tiempo por un uso anormal. Si crees que es un error, escríbenos.",
});

/** 'off' no hace nada, 'observe' solo apunta, 'enforce' bloquea. Por defecto, off. */
export function modMode(value) {
  return value === "observe" || value === "enforce" ? value : "off";
}

// ── Dirección IP de confianza y huella ────────────────────────────────────────

function expandV6(address) {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  const mapped = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const [a, b, c, d] = mapped[2].split(".").map(Number);
    text = `${mapped[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail, extra] = text.split("::");
  if (extra !== undefined) return null;
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  if (tail !== undefined && fill < 1) return null;
  const groups = tail === undefined ? left : [...left, ...Array(fill).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

/**
 * IPv4 tal cual; IPv6 recortada a su prefijo /64 (un cliente recibe un /64 entero
 * y cambiar dentro de él no debe servir para evadir); IPv4 mapeada, como IPv4.
 */
export function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 64) return null;
  const kind = isIP(text);
  if (kind === 4) return text.split(".").map((n) => String(Number(n))).join(".");
  if (kind !== 6) return null;
  const groups = expandV6(text);
  if (!groups) return null;
  if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") {
    const hi = parseInt(groups[6], 16);
    const lo = parseInt(groups[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Cabecera de la que se lee la IP. Solo la pone la plataforma; ver docs/MODERACION.md. */
export const DEFAULT_IP_HEADER = "cf-connecting-ip";

/**
 * Lee la IP SOLO de una cabecera de confianza. Cualquier otra (X-Forwarded-For
 * escrito por el cliente, X-Real-IP, Forwarded…) se ignora. Con
 * x-forwarded-for se toma el salto desde la derecha que añadió la plataforma
 * (`hopsFromRight`, por defecto el último), nunca el primero, que escribe el cliente.
 * Si no hay cabecera de confianza o no es una IP válida devuelve null y no se
 * hace nada: más vale no moderar que moderar a la persona equivocada.
 */
export function trustedClientIp(headers, { header = DEFAULT_IP_HEADER, hopsFromRight = 1 } = {}) {
  const name = String(header || DEFAULT_IP_HEADER).toLowerCase();
  const raw = headers.get(name);
  if (!raw) return null;
  if (name === "x-forwarded-for") {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    const hops = Number.isInteger(hopsFromRight) && hopsFromRight >= 1 ? hopsFromRight : 1;
    return normalizeIp(parts[parts.length - hops]);
  }
  return normalizeIp(raw);
}

/** HMAC-SHA256 en hexadecimal. Sin secreto largo no hay huella. */
export async function ipFingerprint(ip, pepper) {
  if (typeof pepper !== "string" || pepper.length < 32) throw new Error("mod_pepper_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Decisión ──────────────────────────────────────────────────────────────────

/**
 * Decide qué hacer con una petición según los contadores. Pura.
 * signal: { hitsMinute, hitsHour, distinctUsers, userHitsHour }
 * Devuelve { action: 'none'|'block_ip'|'limit_user', rule, shared, reason }.
 */
export function decideAbuse(signal, { minor = false } = {}) {
  const factor = minor ? THRESHOLDS.minorFactor : 1;
  const burst = THRESHOLDS.burstPerMinute * factor;
  const hourIp = THRESHOLDS.hourPerIp * factor;
  const userHour = THRESHOLDS.userHour * factor;
  const shared = signal.distinctUsers >= THRESHOLDS.sharedNetworkMinUsers;
  const ipOver = signal.hitsMinute > burst || signal.hitsHour > hourIp;
  const userOver = signal.userHitsHour > userHour;
  if (!shared && ipOver) {
    // Pocas cuentas y ráfaga o volumen anormal: patrón de bot o script.
    const mostlyThisUser = signal.userHitsHour * 2 > signal.hitsHour;
    return { action: "block_ip", rule: RULES.bot.id, shared: false, reason: signal.hitsMinute > burst ? "burst" : "volume", mostlyThisUser };
  }
  if (userOver) {
    // Red compartida con una cuenta que martillea, o una cuenta sola que insiste.
    return { action: "limit_user", rule: RULES.spam.id, shared, reason: shared ? "shared_network_user_limit" : "user_hour" };
  }
  return { action: "none", rule: null, shared, reason: shared && ipOver ? "shared_network_ok" : "ok" };
}

function isoUntil(now, ms) {
  return new Date(now + ms).toISOString();
}

function reject(code, untilIso, now) {
  const retry = Math.max(1, Math.ceil((Date.parse(untilIso) - now) / 1000));
  return { status: 429, code, message: MESSAGES[code], retryAfter: retry };
}

/**
 * Puerta de moderación para las acciones que consumen IA (consumingActions).
 * No toca páginas legales, el inicio de sesión ni «Reclamar»: solo se llama
 * desde las acciones que gastan IA. Falla abierta: ante un error no bloquea.
 * Devuelve null (seguir) o { status, code, message, retryAfter }.
 */
export async function moderationGate({ rpc, headers, userId, ageBand, env, now = Date.now(), log = console.error }) {
  const mode = modMode(env.MOD_MODE);
  if (mode === "off") return null;
  try {
    const ip = trustedClientIp(headers, {
      header: env.MOD_IP_HEADER || DEFAULT_IP_HEADER,
      hopsFromRight: Number(env.MOD_IP_XFF_HOPS) || 1,
    });
    if (!ip) {
      log(JSON.stringify({ event: "mod_ip_unavailable" }));
      return null;
    }
    const hash = await ipFingerprint(ip, env.MOD_IP_PEPPER);
    const sig = await rpc("mod_ip_check", { p_ip_hash: hash, p_user: userId, p_record: true });
    const enforce = mode === "enforce";
    if (enforce && sig.ip_blocked_until && Date.parse(sig.ip_blocked_until) > now) return reject("mod_ip_blocked", sig.ip_blocked_until, now);
    if (enforce && sig.user_limited_until && Date.parse(sig.user_limited_until) > now) return reject("mod_user_limited", sig.user_limited_until, now);

    const decision = decideAbuse(
      { hitsMinute: sig.hits_minute, hitsHour: sig.hits_hour, distinctUsers: sig.distinct_users_hour, userHitsHour: sig.user_hits_hour },
      { minor: ageBand === "14_17" },
    );
    if (decision.action === "none") return null;

    const rule = decision.rule;
    const ref = `rate:${decision.reason}`;
    const eventRule = enforce ? rule : `${rule}:observe`;
    const prior = await rpc("mod_event_add", {
      p_user: userId, p_rule: eventRule, p_origin: "automatico", p_severity: "media", p_confidence: null, p_ref: ref,
      p_days: decision.action === "block_ip" ? 30 : THRESHOLDS.repeatWindowDays,
    });
    if (!enforce) return null;

    if (decision.action === "block_ip") {
      await rpc("mod_ip_block_set", { p_ip_hash: hash, p_until: isoUntil(now, THRESHOLDS.ipBlockMs), p_rule: rule });
      // El baneo de 7 días de la tabla G lo confirma una persona: solo se propone.
      if (decision.mostlyThisUser) {
        await rpc("mod_sanction_add", { p_user: userId, p_kind: "baneo", p_until: isoUntil(now, THRESHOLDS.proposedBanMs), p_rule: rule, p_status: "revision_pendiente", p_by: "sistema" });
      }
      return reject("mod_ip_blocked", isoUntil(now, THRESHOLDS.ipBlockMs), now);
    }
    const ms = prior === 0 ? THRESHOLDS.firstLimitMs : THRESHOLDS.repeatLimitMs;
    const until = isoUntil(now, ms);
    await rpc("mod_sanction_add", { p_user: userId, p_kind: "limitacion", p_until: until, p_rule: rule, p_status: "activa", p_by: "sistema" });
    if (prior >= THRESHOLDS.proposeBanAfterPrior) {
      await rpc("mod_sanction_add", { p_user: userId, p_kind: "baneo", p_until: isoUntil(now, THRESHOLDS.proposedBanMs), p_rule: rule, p_status: "revision_pendiente", p_by: "sistema" });
    }
    return reject("mod_user_limited", until, now);
  } catch {
    log(JSON.stringify({ event: "mod_gate_failed" }));
    return null;
  }
}

// ── B3: cuentas nuevas desde la IP de una cuenta baneada ─────────────────────

/** Entradas mínimas: configurable, siempre entre 4 y 7. */
export function minEntriesFrom(value) {
  const n = Number(value);
  const [low, high] = THRESHOLDS.minEntriesRange;
  return Number.isInteger(n) ? Math.min(high, Math.max(low, n)) : THRESHOLDS.minEntries;
}

/** El baneo automático por evasión solo se aplica con el interruptor encendido. */
export function autoBanEnabled(env) {
  return modMode(env.MOD_MODE) === "enforce" && env.MOD_AUTO_BAN_ENABLED === "true";
}

/**
 * Apunta la entrada de una cuenta y, si es una cuenta nueva desde la IP de una
 * cuenta baneada, la deja «en observación» 2 días. No cambia nada de lo que ve
 * el alumno: sigue con los límites normales y sin aviso de sospecha. Pasado el
 * plazo cierra la observación: sin entradas suficientes se descarta; en una red
 * compartida o con el interruptor apagado solo se propone; en una IP de hogar
 * con el interruptor encendido se aplica la fila de la tabla G.
 * Falla abierta: ante cualquier error no hace nada.
 */
export async function moderationEntry({ rpc, headers, userId, env, now = Date.now(), log = console.error }) {
  const mode = modMode(env.MOD_MODE);
  if (mode === "off") return null;
  try {
    const ip = trustedClientIp(headers, {
      header: env.MOD_IP_HEADER || DEFAULT_IP_HEADER,
      hopsFromRight: Number(env.MOD_IP_XFF_HOPS) || 1,
    });
    if (!ip) return null;
    const hash = await ipFingerprint(ip, env.MOD_IP_PEPPER);
    const obs = await rpc("mod_entry", {
      p_ip_hash: hash, p_user: userId,
      p_window_days: THRESHOLDS.windowDays, p_gap_minutes: THRESHOLDS.entryGapMinutes,
      p_observe_days: THRESHOLDS.observationDays, p_home_max: THRESHOLDS.homeMaxAccounts,
    });
    if (!obs || mode !== "enforce") return null;
    if (obs.status === "observando" && Date.parse(obs.ends_at) <= now) {
      await rpc("mod_observation_resolve", {
        p_id: obs.id, p_auto: autoBanEnabled(env), p_min_entries: minEntriesFrom(env.MOD_OBS_MIN_ENTRIES),
        p_home_max: THRESHOLDS.homeMaxAccounts, p_ban_days: THRESHOLDS.banDays, p_window_days: THRESHOLDS.windowDays,
      });
    }
    return null;
  } catch {
    log(JSON.stringify({ event: "mod_entry_failed" }));
    return null;
  }
}
