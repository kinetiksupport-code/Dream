// Panel de administración (B5): comprobación de administrador y acciones.
//
// Reglas (todas se comprueban AQUÍ, en el servidor, en CADA petición):
//  1. Correo: el correo verificado del token ya validado por Supabase, en
//     minúsculas y sin espacios, debe ser ADMIN_EMAIL (secreto del servidor).
//  2. Fila en dream_private.admin_users con el id de la cuenta (alta solo a mano).
//  3. Identidad: solo Google con correo verificado; si la cuenta tiene otra
//     identidad (correo y contraseña…) NO es administrador.
//  4. Doble factor: el token debe ser aal2 (TOTP).
//  5. Sesión del panel: 30 min de inactividad; las acciones graves piden un
//     TOTP de los últimos 5 min y una confirmación en dos pasos.
// Quien no cumple cualquiera de las cinco recibe EXACTAMENTE la respuesta de una
// acción que no existe: handleAdminAction devuelve null y dream-api sigue por su
// camino normal hasta «Acción no válida». Nada de roles en user_metadata.

export const ADMIN_ACTIONS = new Set([
  "admin_mfa_status",
  "admin_session_start",
  "admin_inbox",
  "admin_user",
  "admin_sanction_resolve",
  "admin_ban_user",
  "admin_ban_lift",
  "admin_ip_block_user",
  "admin_ip_unblock",
  "admin_appeal_resolve",
  "admin_appeal_by_code",
  "admin_memory_stats",
  "admin_support",
  "admin_support_notice",
  "admin_privacy_hold",
  "admin_privacy_delete",
]);

export const ADMIN_LIMITS = Object.freeze({
  idleMs: 30 * 60_000,
  reauthMs: 5 * 60_000,
  confirmTtlMs: 120_000,
  deniedBeforeLock: 10,
  deniedLogCap: 20,
  actionsPerMinute: 60,
});

/** Motivos de «Eliminar cuenta por petición de privacidad». */
export const PRIVACY_REASONS = Object.freeze(["tutor_menor_14", "tutor_14_17", "titular", "otro"]);

/** Reglas que puede elegir el administrador al banear: todas filas de la tabla G. */
export const ADMIN_BAN_RULES = Object.freeze({
  "G-INSULT": "Insultos, acoso o lenguaje ofensivo",
  "G-JAILBREAK": "Trucos para que la IA dé la solución o ignore sus normas",
  "G-SPAM": "Spam, mensajes repetidos o saturar el chat",
  "G-BOT": "Bots, scripts, scraping o sobrecargar el servicio",
  "G-MULTI": "Varias cuentas para saltarse límites, cola o un baneo",
  "G-EDAD": "Compartir la cuenta o mentir sobre la edad",
  "G-EXAMEN": "Usar Dream en un examen oficial o prueba evaluable",
  "G-COPYRIGHT": "Subir material con derechos de autor sin permiso",
  "G-DATOS": "Subir datos personales de otras personas",
  "G-ILEGAL": "Contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño",
  "G-HACK": "Intentar acceder a datos de otros usuarios o hackear el sistema",
  "G-COMERCIAL": "Uso comercial o reventa sin permiso por escrito",
});

const DAY = 86_400_000;
const DURATIONS = Object.freeze({ "7d": 7 * DAY, "30d": 30 * DAY, permanent: null });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

/** «alumno@gmail.com» → «a***@gmail.com». El panel nunca enseña el correo entero. */
export function maskEmail(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** Claims del token. Solo se llama con un token que Supabase YA ha validado. */
export function decodeClaims(token) {
  try {
    const part = String(token).split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/** aal2 y cuándo fue el último TOTP (los `amr` de Supabase llevan segundos). */
export function mfaFromClaims(claims, now) {
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  const totp = amr.filter((m) => m && m.method === "totp" && Number.isFinite(Number(m.timestamp))).map((m) => Number(m.timestamp) * 1000);
  const last = totp.length ? Math.max(...totp) : null;
  return { aal2: claims?.aal === "aal2" && last !== null, lastTotpAt: last, fresh: last !== null && now - last <= ADMIN_LIMITS.reauthMs && now - last >= -60_000 };
}

/** Correo + identidad. No mira la base de datos. */
export function identityChecks(user, env) {
  const expected = normalizeEmail(env.ADMIN_EMAIL);
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const providers = new Set(identities.map((i) => i?.provider));
  return {
    email: expected.length > 3 && normalizeEmail(user?.email) === expected && Boolean(user?.email_confirmed_at),
    // Solo Google, con correo verificado por Google. Cualquier otra identidad (o
    // ninguna) deja la cuenta como usuario normal.
    google:
      user?.app_metadata?.provider === "google" &&
      providers.size > 0 && [...providers].every((p) => p === "google") &&
      identities.some((i) => i?.provider === "google" && i?.identity_data?.email_verified !== false),
  };
}

/** Todas las comprobaciones se hacen siempre (sin cortar en la primera) para no dar pistas por tiempos. */
export async function authorizeAdmin({ user, token, rpc, env, now }) {
  const claims = decodeClaims(token);
  const identity = identityChecks(user, env);
  let listed = false;
  try {
    listed = (await rpc("admin_check", { p_user: user.id })) === true;
  } catch {
    listed = false;
  }
  const mfa = mfaFromClaims(claims, now);
  const sameSubject = claims?.sub === user.id;
  return { isAdmin: identity.email && identity.google && listed && sameSubject, mfa };
}

// ── Confirmación en dos pasos ────────────────────────────────────────────────

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}
/** Token de confirmación ligado a quién, qué, sobre quién y con qué parámetros. */
export async function makeConfirmToken(secret, actor, action, target, param, now) {
  const exp = now + ADMIN_LIMITS.confirmTtlMs;
  return `${exp}.${await hmac(secret, `${actor}|${action}|${target}|${param}|${exp}`)}`;
}
export async function checkConfirmToken(secret, token, actor, action, target, param, now) {
  const [exp, mac] = String(token ?? "").split(".");
  if (!/^\d+$/.test(exp ?? "") || !/^[0-9a-f]{64}$/.test(mac ?? "") || Number(exp) < now) return false;
  const expected = await hmac(secret, `${actor}|${action}|${target}|${param}|${exp}`);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0;
}

// ── Acciones ─────────────────────────────────────────────────────────────────

async function emailsFor(db, ids) {
  const unique = [...new Set(ids.filter((id) => UUID.test(String(id))))].slice(0, 60);
  const out = new Map();
  await Promise.all(unique.map(async (id) => {
    try {
      const found = await db.auth.admin.getUserById(id);
      out.set(id, found?.data?.user?.email ? maskEmail(found.data.user.email) : "(cuenta borrada)");
    } catch {
      out.set(id, "(sin datos)");
    }
  }));
  return out;
}
const withUsers = (rows, emails) => (rows ?? []).map((row) => (row.user_id ? { ...row, user_short: String(row.user_id).slice(0, 8), user_email: emails.get(row.user_id) ?? "(sin datos)" } : row));

const fail = (status, code, error) => ({ status, body: { error, code } });
const ok = (body) => ({ status: 200, body });

/**
 * Devuelve { status, body } para un administrador, o null para cualquier otra
 * persona (dream-api responde entonces como ante una acción inexistente).
 */
export async function handleAdminAction({ action, body, user, token, origin, originAllowed, rpc, db, env, now = Date.now(), log = console.error }) {
  const actor = user.id;
  const audit = async (name, target, result, detail) => {
    try {
      await rpc("admin_audit_add", { p_actor: actor, p_action: name, p_target: target ?? null, p_result: result, p_detail: detail ?? null });
      return true;
    } catch {
      log(JSON.stringify({ event: "admin_audit_failed" }));
      return false;
    }
  };

  const auth = await authorizeAdmin({ user, token, rpc, env, now });
  let state = { last_ok: null, session_start: null, denied_15m: 0, ok_1m: 0 };
  try {
    state = (await rpc("admin_session_state", { p_actor: actor })) ?? state;
  } catch {
    log(JSON.stringify({ event: "admin_state_failed" }));
  }

  // No es administrador, o no viene de un origen conocido: como una acción inexistente.
  if (!auth.isAdmin || !origin || !originAllowed(origin)) {
    if (state.denied_15m < ADMIN_LIMITS.deniedLogCap) await audit(String(action).slice(0, 64), null, "denied", "no_admin");
    return null;
  }
  // Bloqueo tras intentos fallidos: aunque ahora acierte, deja de contestar un rato.
  if (state.denied_15m >= ADMIN_LIMITS.deniedBeforeLock) {
    if (state.denied_15m < ADMIN_LIMITS.deniedLogCap) await audit(action, null, "locked", "intentos_fallidos");
    return null;
  }

  // Estado del doble factor: lo único que se puede pedir sin aal2 (para inscribirlo).
  if (action === "admin_mfa_status") {
    return ok({ admin: true, aal2: auth.mfa.aal2, fresh: auth.mfa.fresh });
  }
  if (!auth.mfa.aal2) {
    if (state.denied_15m < ADMIN_LIMITS.deniedLogCap) await audit(action, null, "denied", "sin_aal2");
    return null;
  }
  if (state.ok_1m >= ADMIN_LIMITS.actionsPerMinute) return fail(429, "rate_limited", "Demasiadas acciones seguidas. Espera un minuto.");

  if (action === "admin_session_start") {
    if (!auth.mfa.fresh) return fail(403, "reauth_required", "Introduce un código nuevo del segundo factor.");
    if (!(await audit(action, null, "ok", "inicio_de_sesion"))) return fail(503, "audit_unavailable", "No se pudo registrar la acción.");
    return ok({ ok: true, idle_minutes: ADMIN_LIMITS.idleMs / 60_000 });
  }
  const lastOk = state.last_ok ? Date.parse(state.last_ok) : 0;
  const started = state.session_start ? Date.parse(state.session_start) : 0;
  if (!started || !lastOk || now - lastOk > ADMIN_LIMITS.idleMs) return fail(403, "session_expired", "La sesión del panel ha caducado. Vuelve a empezar.");

  const needUuid = (value) => (typeof value === "string" && UUID.test(value) ? value : null);
  const run = async (name, target, detail, work) => {
    if (!(await audit(name, target, "ok", detail))) return fail(503, "audit_unavailable", "No se pudo registrar la acción.");
    try {
      return await work();
    } catch {
      await audit(name, target, "error", "fallo_interno");
      return fail(503, "failed", "No se pudo completar la acción.");
    }
  };
  /** Acciones graves: TOTP reciente + confirmación en dos pasos. */
  const grave = async (name, target, param, work) => {
    if (!auth.mfa.fresh) return fail(403, "reauth_required", "Esta acción pide un código nuevo del segundo factor.");
    const secret = env.CONFIRM_SECRET;
    if (!secret) return fail(503, "confirm_unavailable", "La confirmación no está disponible.");
    if (!(await checkConfirmToken(secret, body.confirm_token, actor, name, target, param, now))) {
      const confirm = await makeConfirmToken(secret, actor, name, target, param, now);
      return ok({ needs_confirmation: true, confirm_token: confirm, expires_in: ADMIN_LIMITS.confirmTtlMs / 1000, summary: `${name} · ${param}` });
    }
    return run(name, target, `${param}`.slice(0, 100), work);
  };

  switch (action) {
    case "admin_inbox":
      return run(action, null, "bandeja", async () => {
        const data = await rpc("admin_inbox", {});
        const ids = ["appeals", "observations", "proposals", "active_bans", "events"].flatMap((k) => (data?.[k] ?? []).map((r) => r.user_id));
        const emails = await emailsFor(db, ids);
        return ok({
          ...data,
          appeals: withUsers(data?.appeals, emails), observations: withUsers(data?.observations, emails),
          proposals: withUsers(data?.proposals, emails), active_bans: withUsers(data?.active_bans, emails), events: withUsers(data?.events, emails),
        });
      });
    // Memoria del chat (docs/MEMORIA-CHAT.md, Bloque 4): totales por día, sin texto ni alumnos.
    case "admin_memory_stats":
      return run(action, null, "memoria_chat", async () => ok({ days: (await rpc("admin_memory_stats", {})) ?? [] }));
    case "admin_user": {
      const id = needUuid(body.user_id);
      if (!id) return fail(400, "invalid", "Cuenta no válida.");
      return run(action, id, "ficha", async () => {
        const [card, ban, emails] = await Promise.all([rpc("admin_user_card", { p_user: id }), rpc("mod_ban_state", { p_user: id }), emailsFor(db, [id])]);
        return ok({ user_short: id.slice(0, 8), user_email: emails.get(id), ban, ...card });
      });
    }
    case "admin_sanction_resolve": {
      const id = needUuid(body.id);
      if (!id || !["confirmar", "bajar_a_aviso", "levantar"].includes(body.action_type)) return fail(400, "invalid", "Datos no válidos.");
      let permanentBan = false;
      if (body.action_type === "confirmar") {
        const found = await db.from("mod_sanctions").select("kind,until").eq("id", id).maybeSingle();
        permanentBan = found?.data?.kind === "baneo" && found.data.until === null;
      }
      const work = async () => {
        const result = await rpc("mod_sanction_resolve", { p_id: id, p_action: body.action_type });
        return result?.ok ? ok(result) : fail(409, result?.code ?? "failed", "No se pudo aplicar.");
      };
      return permanentBan ? grave(action, id, `${body.action_type}:baneo_permanente`, work) : run(action, id, body.action_type, work);
    }
    case "admin_ban_user": {
      const id = needUuid(body.user_id);
      const rule = typeof body.rule === "string" && Object.hasOwn(ADMIN_BAN_RULES, body.rule) ? body.rule : null;
      const duration = typeof body.duration === "string" && Object.hasOwn(DURATIONS, body.duration) ? body.duration : null;
      if (!id || !rule || !duration) return fail(400, "invalid", "Datos no válidos.");
      if (id === actor) return fail(409, "not_allowed", "No se puede.");
      let isOtherAdmin = true;
      try {
        isOtherAdmin = (await rpc("admin_check", { p_user: id })) === true;
      } catch {
        isOtherAdmin = true;
      }
      if (isOtherAdmin) return fail(409, "not_allowed", "No se puede.");
      const work = async () => {
        const until = DURATIONS[duration] === null ? null : new Date(now + DURATIONS[duration]).toISOString();
        await rpc("mod_ban_set", { p_user: id, p_until: until, p_rule: rule, p_by: "admin" });
        return ok({ ok: true });
      };
      return duration === "permanent" ? grave(action, id, `${rule}:permanent`, work) : run(action, id, `${rule}:${duration}`, work);
    }
    // Soporte (Hugo, docs/HUGO_MCP.md): llamadas de Hugo sin datos personales y el aviso de estado.
    case "admin_support":
      return run(action, null, "soporte", async () => ok((await rpc("hugo_panel", {})) ?? {}));
    case "admin_support_notice": {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length > 280) return fail(400, "invalid", "Máximo 280 caracteres.");
      return run(action, null, "aviso", async () => {
        await rpc("hugo_set_notice", { p_text: text });
        return ok({ ok: true });
      });
    }
    // Privacidad: petición de padre, madre, tutor o titular por correo. El correo
    // solo se usa para buscar la cuenta: no se guarda ni entra en la auditoría.
    case "admin_privacy_hold":
    case "admin_privacy_delete": {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const reason = typeof body.reason === "string" && PRIVACY_REASONS.includes(body.reason) ? body.reason : null;
      if (!reason || email.length < 5 || email.length > 254 || !email.includes("@")) return fail(400, "invalid", "Datos no válidos.");
      let id = null;
      try { id = needUuid(await rpc("hugo_find_by_email", { p_email: email })); } catch { return fail(503, "failed", "No se pudo completar la acción."); }
      if (!id) return fail(404, "not_found", "No hay ninguna cuenta con ese correo.");
      if (id === actor) return fail(409, "not_allowed", "No se puede.");
      let isOtherAdmin = true;
      try { isOtherAdmin = (await rpc("admin_check", { p_user: id })) === true; } catch { isOtherAdmin = true; }
      if (isOtherAdmin) return fail(409, "not_allowed", "No se puede.");
      if (action === "admin_privacy_hold") {
        // Limitación sin norma G, reversible (admin_sanction_resolve > levantar).
        return run(action, id, `bloqueo_preventivo:${reason}`, async () => {
          await rpc("mod_sanction_add", { p_user: id, p_kind: "limitacion", p_until: null, p_rule: "ADMIN", p_status: "activa", p_by: "admin" });
          return ok({ ok: true });
        });
      }
      // El mismo borrado que account_delete (todo cae en cascada con auth.users).
      return grave(action, id, `privacidad:${reason}`, async () => {
        await db.schema("dream_private").from("leases").delete().eq("owner_id", id);
        const removed = await db.auth.admin.deleteUser(id);
        if (removed.error) return fail(503, "failed", "No se pudo eliminar la cuenta.");
        return ok({ ok: true, deleted: true });
      });
    }
    case "admin_ban_lift": {
      const id = needUuid(body.user_id);
      if (!id) return fail(400, "invalid", "Cuenta no válida.");
      return run(action, id, "levantar", async () => ok({ ok: true, lifted: await rpc("mod_ban_lift", { p_user: id }) }));
    }
    case "admin_ip_block_user": {
      const id = needUuid(body.user_id);
      if (!id) return fail(400, "invalid", "Cuenta no válida.");
      return run(action, id, "bloqueo_ip_24h", async () => ok({ ok: true, ip_prefix: await rpc("mod_ip_block_user", { p_user: id }) }));
    }
    case "admin_ip_unblock": {
      const prefix = typeof body.ip_prefix === "string" && /^[0-9a-f]{12}$/.test(body.ip_prefix) ? body.ip_prefix : null;
      if (!prefix) return fail(400, "invalid", "Datos no válidos.");
      return run(action, null, "desbloqueo_ip", async () => ok({ ok: true, removed: await rpc("mod_ip_unblock", { p_prefix: prefix }) }));
    }
    case "admin_appeal_by_code": {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^DREAM-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) return fail(400, "invalid", "Código no válido.");
      return run(action, null, "apelacion_por_codigo", async () => {
        const found = await rpc("admin_appeal_by_code", { p_code: code });
        if (!found) return ok({ appeal: null });
        const emails = await emailsFor(db, [found.user_id]);
        return ok({ appeal: { ...found, user_short: String(found.user_id).slice(0, 8), user_email: emails.get(found.user_id) } });
      });
    }
    case "admin_appeal_resolve": {
      const id = needUuid(body.id);
      const resolution = typeof body.resolution === "string" ? body.resolution.slice(0, 2000) : "";
      if (!id || !["aceptada", "rechazada"].includes(body.status)) return fail(400, "invalid", "Datos no válidos.");
      return run(action, id, body.status, async () => {
        const result = await rpc("admin_appeal_resolve", { p_id: id, p_status: body.status, p_resolution: resolution });
        return result?.ok ? ok({ ok: true }) : fail(409, result?.code ?? "failed", "No se pudo resolver.");
      });
    }
    default:
      return null;
  }
}

// ── Enlace «Panel de administración» y ruta configurable ─────────────────────

export const DEFAULT_PANEL_PATH = "/revision";
/** Ruta del panel: configurable en el servidor; si no es válida, la de por defecto. */
export function panelPath(value) {
  const path = String(value ?? "").trim();
  return /^\/[a-z0-9][a-z0-9-]{2,40}$/.test(path) && path !== "/panel-interno" ? path : DEFAULT_PANEL_PATH;
}

/**
 * Lo que `profile` cuenta sobre el panel. Solo se mira la base de datos si el
 * correo coincide, así que a un alumno normal no le cuesta nada ni le cambia
 * nada: para todos los demás el campo no existe. Ocultar el enlace no es la
 * seguridad; la seguridad es handleAdminAction.
 */
export async function adminLink({ user, rpc, env }) {
  const identity = identityChecks(user, env);
  if (!identity.email || !identity.google) return null;
  try {
    return (await rpc("admin_check", { p_user: user.id })) === true ? { path: panelPath(env.ADMIN_PANEL_PATH) } : null;
  } catch {
    return null;
  }
}
