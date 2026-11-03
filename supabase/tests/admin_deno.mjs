// Panel de administración: el dream-api REAL contra un Supabase falso.
// Incluye la prueba de penetración propia: todo lo que no sea el administrador,
// con su doble factor y su sesión de panel, recibe lo mismo que una acción que no existe.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.14";
import { goodUser, makeToken, profileRow, startHarness } from "./helpers/dream-harness.mjs";

const ADMIN_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN_EMAIL = "hellodream@edudream.es";
const STUDENT_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const VICTIM_ID = "cccccccc-0000-4000-8000-000000000003";
const OTHER_ADMIN_ID = "dddddddd-0000-4000-8000-000000000004";
// Hora fija por ejecución: dos llamadas en segundos distintos darían tokens distintos.
const BASE_S = Math.floor(Date.now() / 1000);
const NOW_S = () => BASE_S;

const ADMIN_ACTIONS = [
  "admin_mfa_status", "admin_session_start", "admin_inbox", "admin_user", "admin_sanction_resolve",
  "admin_ban_user", "admin_ban_lift", "admin_ip_block_user", "admin_ip_unblock", "admin_appeal_resolve", "admin_appeal_by_code",
];
const tokenFor = (sub, { aal = "aal2", totpAgoS = 30 } = {}) =>
  makeToken({ sub, aal, amr: aal === "aal2" ? [{ method: "totp", timestamp: NOW_S() - totpAgoS }, { method: "oauth", timestamp: NOW_S() - 9000 }] : [{ method: "oauth", timestamp: NOW_S() - 30 }] });

async function setup({ extraUsers = {}, listed = [ADMIN_ID, OTHER_ADMIN_ID], sessionState, auditFails = false } = {}) {
  const audit = [];
  const calls = [];
  const adminUser = goodUser(ADMIN_ID, ADMIN_EMAIL);
  const users = {
    [tokenFor(ADMIN_ID)]: adminUser,
    [tokenFor(ADMIN_ID, { aal: "aal1" })]: adminUser,
    [tokenFor(ADMIN_ID, { totpAgoS: 900 })]: adminUser,
    [tokenFor(STUDENT_ID)]: goodUser(STUDENT_ID, "alumno@example.test"),
    [tokenFor(VICTIM_ID, { aal: "aal1" })]: goodUser(VICTIM_ID, "victima@example.test"),
    ...extraUsers,
  };
  const h = await startHarness({
    users,
    env: { ADMIN_EMAIL },
    tables: { dream_profiles: [profileRow(ADMIN_ID), profileRow(STUDENT_ID), profileRow(VICTIM_ID), profileRow(OTHER_ADMIN_ID)], mod_sanctions: [{ id: "eeeeeeee-0000-4000-8000-000000000005", kind: "baneo", until: null }] },
    rpc: {
      admin_check: ({ p_user }) => listed.includes(p_user),
      admin_audit_add: (a) => {
        if (auditFails) throw new Error("audit down");
        audit.push({ ...a, at: Date.now() });
      },
      admin_session_state: ({ p_actor }) => {
        if (sessionState) return sessionState(audit, p_actor);
        const mine = audit.filter((r) => r.p_actor === p_actor);
        const oks = mine.filter((r) => r.p_result === "ok");
        const last = (list) => (list.length ? new Date(Math.max(...list.map((r) => r.at))).toISOString() : null);
        return {
          last_ok: last(oks), session_start: last(oks.filter((r) => r.p_action === "admin_session_start")),
          denied_15m: mine.filter((r) => ["denied", "locked"].includes(r.p_result)).length,
          ok_1m: oks.filter((r) => Date.now() - r.at < 60_000).length,
        };
      },
      admin_inbox: () => ({
        appeals: [{ id: "a1", user_id: STUDENT_ID, body: "<img src=x onerror=alert(1)>", status: "abierta", days_left: 28 }],
        observations: [], proposals: [{ id: "p1", user_id: VICTIM_ID, kind: "baneo", rule: "G-MULTI" }], active_bans: [], ip_blocks: [{ ip_prefix: "abcdef012345", until: "2099-01-01T00:00:00Z" }], events: [],
      }),
      admin_user_card: () => ({ sanctions: [], events: [], appeals: [], observations: [] }),
      mod_ban_state: () => ({ banned: false }),
      mod_ban_set: (a) => (calls.push(["mod_ban_set", a]), "s-new"),
      mod_ban_lift: (a) => (calls.push(["mod_ban_lift", a]), 1),
      mod_sanction_resolve: (a) => (calls.push(["mod_sanction_resolve", a]), { ok: true }),
      mod_ip_block_user: (a) => (calls.push(["mod_ip_block_user", a]), "abcdef012345"),
      mod_ip_unblock: (a) => (calls.push(["mod_ip_unblock", a]), 1),
      admin_appeal_resolve: (a) => (calls.push(["admin_appeal_resolve", a]), { ok: true }),
      admin_appeal_by_code: ({ p_code }) => (p_code === "DREAM-K7QM-2XPD" ? { id: "a1", user_id: STUDENT_ID, status: "abierta", body: "hola", due_at: "2099-01-01" } : null),
    },
  });
  return { h, audit, calls, adminToken: tokenFor(ADMIN_ID), aal1Token: tokenFor(ADMIN_ID, { aal: "aal1" }), staleToken: tokenFor(ADMIN_ID, { totpAgoS: 900 }) };
}
const shape = (r) => JSON.stringify([r.status, r.json, r.headers.get("content-type")]);
async function start(h, token) {
  const r = await h.call(token, { action: "admin_session_start" });
  assertEquals(r.status, 200, r.text);
}

Deno.test("PENTEST: a non-admin gets EXACTLY what a nonexistent action gets, for every admin action", async () => {
  const { h } = await setup();
  try {
    const studentToken = tokenFor(STUDENT_ID);
    const baseline = await h.call(studentToken, { action: "esta_accion_no_existe" });
    assertEquals(baseline.status, 400);
    for (const action of ADMIN_ACTIONS) {
      const res = await h.call(studentToken, { action, user_id: VICTIM_ID, rule: "G-SPAM", duration: "7d", id: VICTIM_ID, confirm_token: "x" });
      assertEquals(shape(res), shape(baseline), action);
    }
    // El mismo resultado para un nombre inventado con el prefijo admin_.
    assertEquals(shape(await h.call(studentToken, { action: "admin_grant_role", user_id: STUDENT_ID })), shape(baseline));
  } finally {
    await h.stop();
  }
});

Deno.test("PENTEST: every missing condition on its own leaves a user as an ordinary user", async () => {
  const sub = (id, email) => ({ [tokenFor(id)]: goodUser(id, email) });
  const cases = {
    "right email, NOT in admin_users": { id: "11111111-0000-4000-8000-000000000001", email: ADMIN_EMAIL, listed: false },
    "listed in admin_users, WRONG email": { id: OTHER_ADMIN_ID, email: "otra@example.test", listed: true },
    "email with other case/spaces is normalised but a lookalike is not": { id: "22222222-0000-4000-8000-000000000002", email: "hellodream@edudream.es.evil.test", listed: true },
  };
  for (const [name, c] of Object.entries(cases)) {
    const { h, audit } = await setup({ extraUsers: sub(c.id, c.email), listed: c.listed ? [c.id] : [] });
    try {
      const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
      for (const action of ["admin_mfa_status", "admin_session_start", "admin_inbox"]) {
        assertEquals(shape(await h.call(tokenFor(c.id), { action })), shape(baseline), `${name}: ${action}`);
      }
      assert(audit.some((r) => r.p_result === "denied"), `${name}: el intento queda registrado`);
    } finally {
      await h.stop();
    }
  }
});

Deno.test("PENTEST: unverified email, extra password identity, role in user_metadata, missing/foreign origin, or someone else's token are all refused", async () => {
  const id = ADMIN_ID;
  const mutate = (patch) => ({ ...goodUser(id, ADMIN_EMAIL), ...patch });
  const variants = {
    unconfirmed: mutate({ email_confirmed_at: null }),
    passwordIdentity: mutate({ identities: [{ provider: "google", identity_data: { email_verified: true } }, { provider: "email", identity_data: {} }], app_metadata: { provider: "google", providers: ["google", "email"] } }),
    emailProvider: mutate({ app_metadata: { provider: "email" }, identities: [{ provider: "email", identity_data: {} }] }),
    googleUnverified: mutate({ identities: [{ provider: "google", identity_data: { email_verified: false } }] }),
    roleInMetadata: mutate({ user_metadata: { role: "admin", is_admin: true }, app_metadata: { provider: "magic", role: "admin" } }),
  };
  for (const [name, user] of Object.entries(variants)) {
    const token = makeToken({ sub: id, aal: "aal2", amr: [{ method: "totp", timestamp: NOW_S() - 10 }] });
    const { h } = await setup({ extraUsers: { [token]: user } });
    try {
      const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
      assertEquals(shape(await h.call(token, { action: "admin_mfa_status" })), shape(baseline), name);
      assertEquals(shape(await h.call(token, { action: "admin_inbox" })), shape(baseline), name);
    } finally {
      await h.stop();
    }
  }
  // Token de otra persona: el `sub` no coincide con el usuario validado.
  const forged = makeToken({ sub: STUDENT_ID, aal: "aal2", amr: [{ method: "totp", timestamp: NOW_S() - 10 }] });
  const { h, adminToken } = await setup({ extraUsers: { [forged]: goodUser(ADMIN_ID, ADMIN_EMAIL) } });
  try {
    const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
    assertEquals(shape(await h.call(forged, { action: "admin_mfa_status" })), shape(baseline), "sub distinto");
    assertEquals(shape(await h.call(adminToken, { action: "admin_mfa_status", }, { origin: "" })), shape(baseline), "sin Origin");
    const foreign = { origin: "https://evil.example" };
    assertEquals(shape(await h.call(adminToken, { action: "admin_mfa_status" }, foreign)), shape(await h.call(adminToken, { action: "nope" }, foreign)), "Origin ajeno: igual que cualquier otra acción");
    assertEquals((await h.call(adminToken, { action: "admin_mfa_status" }, foreign)).status, 403);
    assertEquals(shape(await h.call(null, { action: "admin_mfa_status" })).includes("401"), true, "sin sesión: el 401 normal");
  } finally {
    await h.stop();
  }
});

Deno.test("PENTEST: without aal2 (second factor) the admin gets nothing, only the enrollment status", async () => {
  const { h, aal1Token } = await setup();
  try {
    const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
    const status = await h.call(aal1Token, { action: "admin_mfa_status" });
    assertEquals(status.status, 200);
    assertEquals(status.json, { admin: true, aal2: false, fresh: false });
    for (const action of ["admin_session_start", "admin_inbox", "admin_user", "admin_ban_user", "admin_ban_lift", "admin_ip_unblock"]) {
      assertEquals(shape(await h.call(aal1Token, { action, user_id: VICTIM_ID, rule: "G-SPAM", duration: "7d", ip_prefix: "abcdef012345" })), shape(baseline), action);
    }
  } finally {
    await h.stop();
  }
});

Deno.test("the admin flow: session start needs a fresh code, data needs an open session, idle 30 min closes it", async () => {
  let idle = false;
  const { h, adminToken, staleToken, audit } = await setup({
    sessionState: (log, actor) => {
      const mine = log.filter((r) => r.p_actor === actor && r.p_result === "ok");
      const t = (r) => new Date(r.at - (idle ? 31 * 60_000 : 0)).toISOString();
      const starts = mine.filter((r) => r.p_action === "admin_session_start");
      return { last_ok: mine.length ? t(mine.at(-1)) : null, session_start: starts.length ? t(starts.at(-1)) : null, denied_15m: 0, ok_1m: 0 };
    },
    extraUsers: {},
  });
  try {
    assertEquals((await h.call(adminToken, { action: "admin_inbox" })).json.code, "session_expired", "sin sesión de panel no hay datos");
    const stale = await h.call(staleToken, { action: "admin_session_start" });
    assertEquals(stale.status, 403);
    assertEquals(stale.json.code, "reauth_required", "un TOTP de hace 15 min no vale");
    await start(h, adminToken);
    const inbox = await h.call(adminToken, { action: "admin_inbox" });
    assertEquals(inbox.status, 200);
    assertEquals(inbox.headers.get("cache-control"), "no-store");
    // Mínimo de datos personales: correo enmascarado, nunca entero; sin IP.
    assert(!inbox.text.includes("alumno@example.test"));
    assert(!inbox.text.includes("victima@example.test"));
    assert(inbox.json.appeals[0].user_email.startsWith("a***@"));
    assertEquals(inbox.json.appeals[0].user_short, STUDENT_ID.slice(0, 8));
    assert(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(inbox.text), "ninguna IP en claro");
    assert(audit.some((r) => r.p_action === "admin_inbox" && r.p_result === "ok"), "queda en el registro");
    idle = true;
    assertEquals((await h.call(adminToken, { action: "admin_inbox" })).json.code, "session_expired", "30 min de inactividad");
  } finally {
    await h.stop();
  }
});

Deno.test("lockout after repeated failures and a per-minute action limit", async () => {
  const { h, adminToken } = await setup({ sessionState: () => ({ last_ok: new Date().toISOString(), session_start: new Date().toISOString(), denied_15m: 10, ok_1m: 0 }) });
  try {
    const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
    assertEquals(shape(await h.call(adminToken, { action: "admin_inbox" })), shape(baseline), "bloqueado tras 10 intentos fallidos");
  } finally {
    await h.stop();
  }
  const limited = await setup({ sessionState: () => ({ last_ok: new Date().toISOString(), session_start: new Date().toISOString(), denied_15m: 0, ok_1m: 60 }) });
  try {
    assertEquals((await limited.h.call(limited.adminToken, { action: "admin_inbox" })).status, 429);
  } finally {
    await limited.h.stop();
  }
});

Deno.test("grave actions: fresh code + two-step confirmation bound to who, what and on whom", async () => {
  const { h, adminToken, staleToken, calls } = await setup();
  try {
    await start(h, adminToken);
    const body = { action: "admin_ban_user", user_id: VICTIM_ID, rule: "G-SPAM", duration: "permanent" };
    const first = await h.call(adminToken, body);
    assertEquals(first.json.needs_confirmation, true);
    assertEquals(calls.length, 0, "el primer paso no hace nada");
    // Otra cuenta, otra regla o una acción distinta no aprovechan ese token.
    const token = first.json.confirm_token;
    for (const variant of [{ user_id: STUDENT_ID }, { rule: "G-BOT" }]) {
      const res = await h.call(adminToken, { ...body, ...variant, confirm_token: token });
      assertNotEquals(res.json.ok, true);
      assertEquals(calls.filter((c) => c[0] === "mod_ban_set" && c[1].p_user === STUDENT_ID && variant.user_id).length, 0);
    }
    assertEquals(calls.filter((c) => c[0] === "mod_ban_set" && c[1].p_until === null).length, 0);
    // Un token manipulado o caducado tampoco.
    assertEquals((await h.call(adminToken, { ...body, confirm_token: token.replace(/.$/, (c) => (c === "0" ? "1" : "0")) })).json.needs_confirmation, true);
    assertEquals((await h.call(adminToken, { ...body, confirm_token: `1.${"0".repeat(64)}` })).json.needs_confirmation, true);
    // Sin un código reciente no se llega ni al primer paso.
    assertEquals((await h.call(staleToken, body)).json.code, "reauth_required");
    // Con el token correcto y un código reciente, se aplica.
    const done = await h.call(adminToken, { ...body, confirm_token: token });
    assertEquals(done.json.ok, true, done.text);
    const applied = calls.filter((c) => c[0] === "mod_ban_set");
    assertEquals(applied.length, 1);
    assertEquals(applied[0][1].p_user, VICTIM_ID);
    assertEquals(applied[0][1].p_until, null);
    assertEquals(applied[0][1].p_by, "admin");
  } finally {
    await h.stop();
  }
});

Deno.test("ban user: only table-G rules and fixed durations; never yourself nor another admin; temporary bans need no confirmation", async () => {
  const { h, adminToken, calls } = await setup();
  try {
    await start(h, adminToken);
    for (const bad of [{ rule: "G-INVENTADA" }, { rule: "__proto__" }, { duration: "999d" }, { duration: "constructor" }, { user_id: "no-uuid" }])
      assertEquals((await h.call(adminToken, { action: "admin_ban_user", user_id: VICTIM_ID, rule: "G-SPAM", duration: "7d", ...bad })).status, 400, JSON.stringify(bad));
    assertEquals((await h.call(adminToken, { action: "admin_ban_user", user_id: ADMIN_ID, rule: "G-SPAM", duration: "7d" })).status, 409, "a sí mismo");
    assertEquals((await h.call(adminToken, { action: "admin_ban_user", user_id: OTHER_ADMIN_ID, rule: "G-SPAM", duration: "7d" })).status, 409, "a otro administrador");
    assertEquals(calls.length, 0);
    const ok = await h.call(adminToken, { action: "admin_ban_user", user_id: VICTIM_ID, rule: "G-SPAM", duration: "7d" });
    assertEquals(ok.json.ok, true);
    const days = (Date.parse(calls[0][1].p_until) - Date.now()) / 86_400_000;
    assert(days > 6.9 && days < 7.1);
    assertEquals((await h.call(adminToken, { action: "admin_ban_lift", user_id: VICTIM_ID })).json.ok, true);
    assertEquals((await h.call(adminToken, { action: "admin_ip_block_user", user_id: VICTIM_ID })).json.ip_prefix, "abcdef012345");
    assertEquals((await h.call(adminToken, { action: "admin_ip_unblock", ip_prefix: "abcdef012345" })).json.removed, 1);
    assertEquals((await h.call(adminToken, { action: "admin_ip_unblock", ip_prefix: "1.2.3.4" })).status, 400, "una IP en claro no es un prefijo válido");
    assertEquals((await h.call(adminToken, { action: "admin_appeal_resolve", id: VICTIM_ID, status: "aceptada", resolution: "ok" })).json.ok, true);
    assertEquals((await h.call(adminToken, { action: "admin_appeal_resolve", id: VICTIM_ID, status: "hackeada" })).status, 400);
  } finally {
    await h.stop();
  }
});

Deno.test("confirming a PERMANENT ban from the inbox is a grave action; downgrading or lifting is not", async () => {
  const { h, adminToken, calls } = await setup();
  try {
    await start(h, adminToken);
    const id = "eeeeeeee-0000-4000-8000-000000000005"; // la tabla falsa dice: baneo permanente
    const res = await h.call(adminToken, { action: "admin_sanction_resolve", id, action_type: "confirmar" });
    assertEquals(res.json.needs_confirmation, true);
    assertEquals(calls.length, 0);
    assertEquals((await h.call(adminToken, { action: "admin_sanction_resolve", id, action_type: "levantar" })).json.ok, true);
    assertEquals((await h.call(adminToken, { action: "admin_sanction_resolve", id, action_type: "borrar_todo" })).status, 400);
  } finally {
    await h.stop();
  }
});

Deno.test("every action is written to the audit log first; if the log is down, no data comes back", async () => {
  const down = await setup({ auditFails: true });
  try {
    // Con el registro caído ni siquiera se puede abrir sesión.
    assertEquals((await down.h.call(down.adminToken, { action: "admin_session_start" })).status, 503);
  } finally {
    await down.h.stop();
  }
  const { h, adminToken, audit } = await setup();
  try {
    await start(h, adminToken);
    await h.call(adminToken, { action: "admin_inbox" });
    await h.call(adminToken, { action: "admin_user", user_id: VICTIM_ID });
    const names = audit.filter((r) => r.p_result === "ok").map((r) => r.p_action);
    assertEquals(names, ["admin_session_start", "admin_inbox", "admin_user"]);
    assertEquals(audit.find((r) => r.p_action === "admin_user").p_target, VICTIM_ID);
    // Nada de datos personales en el detalle del registro.
    assert(audit.every((r) => !/@|\d+\.\d+\.\d+\.\d+/.test(String(r.p_detail ?? ""))));
  } finally {
    await h.stop();
  }
});

Deno.test("the admin cannot grant, edit or create administrators through any action", async () => {
  const { h, adminToken, calls, audit } = await setup();
  try {
    await start(h, adminToken);
    const baseline = await h.call(adminToken, { action: "esta_accion_no_existe" });
    for (const action of ["admin_grant", "admin_add_admin", "admin_set_role", "admin_users_insert", "grant_admin", "set_admin"]) {
      assertEquals(shape(await h.call(adminToken, { action, user_id: STUDENT_ID, role: "admin" })), shape(baseline), action);
    }
    assertEquals(calls.length, 0);
    assert(!audit.some((r) => /grant|add_admin|role/.test(r.p_action)));
  } finally {
    await h.stop();
  }
});

Deno.test("the profile shows the panel link only to the real administrator and costs others nothing", async () => {
  const { h, adminToken, requests } = await (async () => {
    const r = await setup();
    return { ...r, requests: r.h.requests };
  })();
  try {
    const mine = await h.call(adminToken, { action: "profile" });
    assertEquals(mine.json.profile.admin_panel, { path: "/revision" });
    const before = requests.filter((q) => q.path.endsWith("/rpc/admin_check")).length;
    const student = await h.call(tokenFor(STUDENT_ID), { action: "profile" });
    assertEquals("admin_panel" in student.json.profile, false, "para los demás el campo no existe");
    assertEquals(requests.filter((q) => q.path.endsWith("/rpc/admin_check")).length, before, "ni siquiera se consulta la tabla");
    // Mismo correo pero sin fila en admin_users: tampoco.
    const lookalike = tokenFor(OTHER_ADMIN_ID);
    h.state.users[lookalike] = goodUser(OTHER_ADMIN_ID, ADMIN_EMAIL);
    h.state.rpc.admin_check = ({ p_user }) => p_user === ADMIN_ID;
    assertEquals("admin_panel" in (await h.call(lookalike, { action: "profile" })).json.profile, false);
  } finally {
    await h.stop();
  }
});

Deno.test("the administrator finds an appeal by its code; bad codes are rejected and the email stays masked", async () => {
  const { h, adminToken } = await setup();
  try {
    await start(h, adminToken);
    const hit = await h.call(adminToken, { action: "admin_appeal_by_code", code: " dream-k7qm-2xpd " });
    assertEquals(hit.status, 200, hit.text);
    assertEquals(hit.json.appeal.user_short, STUDENT_ID.slice(0, 8));
    assert(hit.json.appeal.user_email.startsWith("a***@"));
    assert(!hit.text.includes("alumno@example.test"));
    assertEquals((await h.call(adminToken, { action: "admin_appeal_by_code", code: "DREAM-AAAA-BBBB" })).json.appeal, null);
    for (const bad of ["", "x", "DREAM-1111-1111", "DREAM-K7QM-2XPD; drop", { $ne: 1 }, ["DREAM-K7QM-2XPD"]])
      assertEquals((await h.call(adminToken, { action: "admin_appeal_by_code", code: bad })).status, 400, JSON.stringify(bad));
    // Un alumno no puede usarlo: mismo resultado que una acción inexistente.
    const baseline = await h.call(tokenFor(STUDENT_ID), { action: "nope" });
    assertEquals(shape(await h.call(tokenFor(STUDENT_ID), { action: "admin_appeal_by_code", code: "DREAM-K7QM-2XPD" })), shape(baseline));
  } finally {
    await h.stop();
  }
});
