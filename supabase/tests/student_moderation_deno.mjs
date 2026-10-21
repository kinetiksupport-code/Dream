// B6, lado del alumno: el dream-api REAL contra un Supabase falso.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { goodUser, makeToken, profileRow, startHarness, USER_ID } from "./helpers/dream-harness.mjs";

const TOKEN = makeToken({ sub: USER_ID, aal: "aal1" });
const OTHER = "00000000-0000-4000-8000-000000000002";
const NOTICE_ID = "99999999-0000-4000-8000-000000000009";

function setup({ banned = true, rpcOverrides = {} } = {}) {
  const calls = [];
  const note = (name, fn) => (args) => (calls.push([name, args]), fn(args));
  return startHarness({
    users: { [TOKEN]: goodUser(USER_ID) },
    tables: { dream_profiles: [profileRow(USER_ID), profileRow(OTHER)] },
    rpc: {
      mod_ban_state: note("mod_ban_state", () =>
        banned ? { banned: true, id: "s1", rule: "G-MULTI", until: "2099-01-01T00:00:00Z", permanent: false } : { banned: false }),
      mod_appeal_code: note("mod_appeal_code", () => "DREAM-K7QM-2XPD"),
      mod_appeals_list: note("mod_appeals_list", () => [{ id: "a1", status: "abierta", code: "DREAM-K7QM-2XPD", created_at: "2026-10-20T10:00:00Z", due_at: "2026-11-19T10:00:00Z", resolution: null }]),
      mod_appeal_create: note("mod_appeal_create", () => ({ ok: true, id: "a2", code: "DREAM-AAAA-BBBB", due_at: "2026-11-19T10:00:00Z" })),
      mod_notices: note("mod_notices", () => [
        { id: NOTICE_ID, kind: "aviso", rule: "G-INSULT", until: null, created_at: "2026-10-22T10:00:00Z" },
        { id: "88888888-0000-4000-8000-000000000008", kind: "limitacion", rule: "G-SPAM:observe", until: "2099-01-01T00:00:00Z", created_at: "2026-10-22T09:00:00Z" },
        { id: "77777777-0000-4000-8000-000000000007", kind: "aviso", rule: "REGLA-RARA", until: null, created_at: "2026-10-21T09:00:00Z" },
      ]),
      mod_ack: note("mod_ack", () => true),
      ...Object.fromEntries(Object.entries(rpcOverrides).map(([k, v]) => [k, note(k, v)])),
    },
  }).then((h) => ({ h, calls }));
}

Deno.test("a banned student sees the reason in plain words, the duration and an appeal code", async () => {
  const { h, calls } = await setup();
  try {
    const res = await h.call(TOKEN, { action: "mod_ban_info" });
    assertEquals(res.status, 200);
    assertEquals(res.json.ban.rule, "G-MULTI");
    assert(res.json.ban.reason.includes("una persona, una cuenta"));
    assertEquals(res.json.ban.permanent, false);
    assertEquals(res.json.ban.until, "2099-01-01T00:00:00Z");
    assertEquals(res.json.code, "DREAM-K7QM-2XPD");
    assertEquals(res.json.deadline_days, 30);
    assertEquals(res.json.appeals[0].due_at, "2026-11-19T10:00:00Z");
    assertEquals(res.headers.get("cache-control"), "no-store");
    // Nada de la cuenta en la respuesta: ni correo ni identificador ni IP.
    assert(!res.text.includes("alumno@example.test") && !res.text.includes(USER_ID) && !/\d+\.\d+\.\d+\.\d+/.test(res.text));
    // Siempre sobre la cuenta autenticada, nunca la que diga el cuerpo (IDOR).
    await h.call(TOKEN, { action: "mod_ban_info", user_id: OTHER, p_user: OTHER });
    assert(calls.every(([, args]) => args.p_user === USER_ID));
  } finally {
    await h.stop();
  }
});

Deno.test("a banned student can appeal but cannot read notices or mark them seen", async () => {
  const { h } = await setup();
  try {
    assertEquals((await h.call(TOKEN, { action: "mod_appeal_create", body: "Creo que es un error" })).status, 200);
    for (const action of ["mod_notices", "mod_ack"]) {
      const res = await h.call(TOKEN, { action, id: NOTICE_ID });
      assertEquals(res.status, 403, action);
      assertEquals(res.json.code, "banned");
    }
  } finally {
    await h.stop();
  }
});

Deno.test("a student who is not banned gets no ban and no appeal row is created just by looking", async () => {
  const { h, calls } = await setup({ banned: false });
  try {
    const res = await h.call(TOKEN, { action: "mod_ban_info" });
    assertEquals(res.status, 200);
    assertEquals(res.json.ban, null);
    assertEquals(res.json.code, null);
    assertEquals(calls.filter(([n]) => n === "mod_appeal_code").length, 0);
  } finally {
    await h.stop();
  }
});

Deno.test("appeal form: 1 to 2000 characters, the code comes back, and the limit of open appeals is explained", async () => {
  const { h, calls } = await setup({ banned: false });
  try {
    for (const body of ["", "   ", "x".repeat(2001), 42, null])
      assertEquals((await h.call(TOKEN, { action: "mod_appeal_create", body })).status, 400, JSON.stringify(body).slice(0, 30));
    assertEquals(calls.filter(([n]) => n === "mod_appeal_create").length, 0, "lo no válido ni llega a la base de datos");
    const good = await h.call(TOKEN, { action: "mod_appeal_create", body: "  Hola, es un error.  ", sanction_id: "no-uuid" });
    assertEquals(good.json, { ok: true, code: "DREAM-AAAA-BBBB", due_at: "2026-11-19T10:00:00Z", deadline_days: 30 });
    const sent = calls.find(([n]) => n === "mod_appeal_create")[1];
    assertEquals(sent.p_body, "Hola, es un error.");
    assertEquals(sent.p_sanction, null, "una sanción que no es un uuid se ignora");
    assertEquals(sent.p_user, USER_ID);
  } finally {
    await h.stop();
  }
  const full = await setup({ banned: false, rpcOverrides: { mod_appeal_create: () => ({ ok: false, code: "demasiadas_abiertas" }) } });
  try {
    const res = await full.h.call(TOKEN, { action: "mod_appeal_create", body: "otra" });
    assertEquals(res.status, 409);
    assert(res.json.error.includes("3 reclamaciones"));
  } finally {
    await full.h.stop();
  }
});

Deno.test("notices: reasons in plain words, suffixes removed, unknown rules get a neutral text; ack only takes a valid id", async () => {
  const { h, calls } = await setup({ banned: false });
  try {
    const res = await h.call(TOKEN, { action: "mod_notices" });
    assertEquals(res.status, 200);
    assertEquals(res.json.items.length, 3);
    assert(res.json.items[0].reason.includes("respeto"));
    assertEquals(res.json.items[1].rule, "G-SPAM");
    assertEquals(res.json.items[2].reason, "las normas de uso de Dream");
    assertEquals((await h.call(TOKEN, { action: "mod_ack", id: "no-uuid" })).status, 400);
    assertEquals((await h.call(TOKEN, { action: "mod_ack", id: NOTICE_ID })).json, { ok: true });
    assertEquals(calls.filter(([n]) => n === "mod_ack").length, 1);
    assertEquals(calls.find(([n]) => n === "mod_ack")[1].p_user, USER_ID);
  } finally {
    await h.stop();
  }
});

Deno.test("if the database fails the student gets a calm message, never details", async () => {
  const boom = () => {
    throw new Error("relation mod_sanctions does not exist");
  };
  const { h } = await setup({ banned: false, rpcOverrides: { mod_notices: boom, mod_appeal_create: boom } });
  try {
    for (const body of [{ action: "mod_notices" }, { action: "mod_appeal_create", body: "hola" }]) {
      const res = await h.call(TOKEN, body);
      assertEquals(res.status, 503);
      assertEquals(res.json.code, "moderation_unavailable");
      assert(!res.text.includes("relation") && !res.text.includes("mod_sanctions"));
    }
  } finally {
    await h.stop();
  }
});
