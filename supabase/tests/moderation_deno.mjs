// El dream-api REAL contra un Supabase falso (supabase/tests/helpers/dream-harness.mjs).
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { goodUser, makeToken, profileRow, startHarness, USER_ID } from "./helpers/dream-harness.mjs";

const TOKEN = makeToken({ sub: USER_ID, aal: "aal1" });
const OTHER = "00000000-0000-4000-8000-000000000002";
const OTHER_TOKEN = makeToken({ sub: OTHER, aal: "aal1" });

const ACTIONS = [
  "chat", "conversations", "conversation_create", "messages", "exams", "exam_create", "exam_upload_start",
  "test_generate", "test_get", "test_check_answer", "test_submit", "attachment_upload", "ai_usage",
  "onboarding_save", "consent", "consent_withdraw", "upload_session_create", "conversation_delete",
  "conversations_delete_all", "exam_session_create", "anything_else",
];

function setup(banFor = USER_ID) {
  const bans = new Map([[banFor, { banned: true, id: "s1", rule: "G-SPAM", until: "2099-01-01T00:00:00Z", permanent: false }]]);
  return startHarness({
    users: { [TOKEN]: goodUser(USER_ID), [OTHER_TOKEN]: goodUser(OTHER, "otro@example.test") },
    tables: { dream_profiles: [profileRow(USER_ID), profileRow(OTHER)] },
    rpc: { mod_ban_state: ({ p_user }) => bans.get(p_user) ?? { banned: false } },
  });
}

Deno.test("a banned student cannot use ANY action, even with the session already open", async () => {
  const h = await setup();
  try {
    for (const action of ACTIONS) {
      const res = await h.call(TOKEN, { action, prompt: "hola", conversation_id: "00000000-0000-4000-8000-0000000000aa", title: "x" });
      assertEquals(res.status, 403, action);
      assertEquals(res.json.code, "banned", action);
      assertEquals(res.json.error, "Has sido baneado de la plataforma.");
    }
    // Nada llegó a tocar datos del alumno ni a gastar IA.
    const touched = h.requests.filter((r) => r.path.startsWith("/rest/v1/") && !r.path.includes("/rpc/") && !r.path.endsWith("dream_profiles"));
    assertEquals(touched.length, 0);
    assertEquals(h.requests.filter((r) => r.path.includes("/rpc/dream_")).length, 0, "ni admisión ni reservas");
  } finally {
    await h.stop();
  }
});

Deno.test("a banned student can still see the ban screen data and delete the account", async () => {
  const h = await setup();
  try {
    const profile = await h.call(TOKEN, { action: "profile" });
    assertEquals(profile.status, 200);
    assertEquals(profile.json.ban.permanent, false);
    assertEquals(profile.json.ban.rule, "G-SPAM");
    assert(profile.json.ban.until);
    const gone = await h.call(TOKEN, { action: "account_delete", confirm: "NO" });
    assertEquals(gone.status, 400, "account_delete llega a su propia validación, no se corta por el baneo");
  } finally {
    await h.stop();
  }
});

Deno.test("a ban on one account never affects another account", async () => {
  const h = await setup();
  try {
    const other = await h.call(OTHER_TOKEN, { action: "profile" });
    assertEquals(other.status, 200);
    assertEquals(other.json.ban, null);
    const unknown = await h.call(OTHER_TOKEN, { action: "nope" });
    assertEquals(unknown.status, 400);
  } finally {
    await h.stop();
  }
});

Deno.test("a lifted ban or an unreachable check does not lock the student out (fails open, logged)", async () => {
  const h = await startHarness({
    users: { [TOKEN]: goodUser(USER_ID) },
    tables: { dream_profiles: [profileRow(USER_ID)] },
    rpc: {},
  });
  try {
    const res = await h.call(TOKEN, { action: "profile" });
    assertEquals(res.status, 200);
    assertEquals(res.json.ban, null);
  } finally {
    await h.stop();
  }
});

Deno.test("the ban is read from the database on every request, with no cache", async () => {
  let calls = 0;
  let banned = false;
  const h = await startHarness({
    users: { [TOKEN]: goodUser(USER_ID) },
    tables: { dream_profiles: [profileRow(USER_ID)] },
    rpc: { mod_ban_state: () => (calls++, banned ? { banned: true, id: "s", rule: "G-BOT", until: null, permanent: true } : { banned: false }) },
  });
  try {
    assertEquals((await h.call(TOKEN, { action: "conversations" })).status, 200);
    banned = true; // Carlos lo escribe a mano en Supabase.
    const denied = await h.call(TOKEN, { action: "conversations" });
    assertEquals(denied.status, 403);
    assertEquals(denied.json.permanent, true);
    banned = false;
    assertEquals((await h.call(TOKEN, { action: "conversations" })).status, 200);
    assertEquals(calls, 3);
  } finally {
    await h.stop();
  }
});
