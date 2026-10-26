// Prueba B5 (panel: administradores y auditoría inmutable) en un PostgreSQL
// local de usar y tirar. Crea y borra su propia base. Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/moderation-admin-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_mod_admin_test with (force)");
await admin.query("create database dream_mod_admin_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_mod_admin_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });

await pool.query(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key, created_at timestamptz not null default now());
  create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
for (const file of ["20261022090000_moderation_data.sql", "20261023090000_moderation_evasion.sql", "20261024090000_moderation_ban.sql", "20261025100000_admin_panel.sql", "20261026090000_moderation_student.sql", "20261026100000_admin_appeal_code.sql"])
  await pool.query(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));

const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
async function rpc(fn, args) {
  const client = await pool.connect();
  try {
    await client.query("set role service_role");
    return (await client.query(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as r`, args)).rows[0].r;
  } finally {
    await client.query("reset role");
    client.release();
  }
}
/** Ejecuta con un rol y siempre deshace. */
async function as(role, sql, args = [], uid) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (uid) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    return await client.query(sql, args);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
const user = async () => {
  const id = randomUUID();
  await pool.query("insert into auth.users(id) values ($1)", [id]);
  return id;
};
const hex = (n) => n.toString(16).padStart(64, "0");

try {
  const ADMIN = await user();
  const STUDENT = await user();
  // El alta de administrador es SOLO a mano, con el superusuario de la base de datos.
  await pool.query("insert into dream_private.admin_users(user_id) values ($1)", [ADMIN]);
  assert.equal(await rpc("admin_check", [ADMIN]), true);
  assert.equal(await rpc("admin_check", [STUDENT]), false);

  // 1. Ningún rol de la aplicación toca admin_users, ni siquiera service_role.
  for (const role of ["anon", "authenticated", "service_role"])
    for (const sql of [
      "select * from dream_private.admin_users",
      "insert into dream_private.admin_users(user_id) values (gen_random_uuid())",
      `update dream_private.admin_users set user_id = '${STUDENT}'`,
      "delete from dream_private.admin_users",
      "truncate dream_private.admin_users",
    ])
      await assert.rejects(as(role, sql), /permission denied/, `${role}: ${sql}`);
  console.log("PASS ni anon, ni authenticated, ni service_role pueden leer ni escribir admin_users");

  // 2. Ninguna función puede dar de alta a un administrador.
  const writers = (await pool.query(
    "select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','dream_private') and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+dream_private\\.admin_users'",
  )).rows;
  assert.deepEqual(writers, [], "ninguna función escribe en admin_users");
  console.log("PASS ninguna función de la base de datos escribe en admin_users");

  // 3. Auditoría inmutable: solo insertar, también para el dueño de la tabla.
  await rpc("admin_audit_add", [ADMIN, "admin_inbox", null, "ok", "bandeja"]);
  await rpc("admin_audit_add", [STUDENT, "admin_inbox", null, "denied", "no_admin"]);
  assert.equal((await one("select count(*)::int n from dream_private.admin_audit_log")).n, 2);
  for (const sql of ["update dream_private.admin_audit_log set result = 'ok'", "delete from dream_private.admin_audit_log", "truncate dream_private.admin_audit_log"])
    await assert.rejects(pool.query(sql), /inmutable/, `dueño: ${sql}`);
  for (const role of ["anon", "authenticated", "service_role"])
    for (const sql of ["select * from dream_private.admin_audit_log", "insert into dream_private.admin_audit_log(action, result) values ('x','ok')", "update dream_private.admin_audit_log set result='ok'", "delete from dream_private.admin_audit_log", "truncate dream_private.admin_audit_log"])
      await assert.rejects(as(role, sql), /permission denied/, `${role}: ${sql}`);
  await assert.rejects(rpc("admin_audit_add", [ADMIN, "x", null, "inventado", null]), /violates check constraint/);
  await rpc("admin_audit_add", [ADMIN, "y".repeat(200), null, "ok", "z".repeat(500)]);
  assert.equal((await one("select max(char_length(detail))::int n from dream_private.admin_audit_log")).n, 200);
  assert.equal((await one("select count(*)::int n from dream_private.admin_audit_log")).n, 3);
  console.log("PASS el registro de auditoría no admite UPDATE, DELETE ni TRUNCATE (ni siquiera su dueño) y solo se escribe por la función");

  // 4. El registro sobrevive al borrado de cuentas (y el borrado de la cuenta no falla).
  const GONE = await user();
  await rpc("admin_audit_add", [GONE, "admin_inbox", null, "denied", "no_admin"]);
  await pool.query("delete from auth.users where id = $1", [GONE]);
  assert.equal((await one("select count(*)::int n from dream_private.admin_audit_log where actor = $1", [GONE])).n, 1);
  console.log("PASS borrar una cuenta no rompe ni vacía la auditoría");

  // 5. Un alumno normal no puede llamar a ninguna función del panel.
  for (const sql of [
    "select public.admin_inbox()", `select public.admin_user_card('${STUDENT}')`, `select public.admin_check('${ADMIN}')`,
    `select public.admin_session_state('${ADMIN}')`, `select public.admin_audit_add('${STUDENT}','x',null,'ok',null)`,
    `select public.admin_appeal_resolve(gen_random_uuid(),'aceptada','x')`, `select public.mod_ip_block_user('${STUDENT}')`, "select public.mod_ip_unblock('aaaaaaaaaaaa')",
  ]) {
    await assert.rejects(as("authenticated", sql, [], STUDENT), /permission denied/, sql);
    await assert.rejects(as("anon", sql), /permission denied/, sql);
  }
  console.log("PASS ni un alumno ni anon pueden llamar a ninguna función del panel (IDOR y escalada)");

  // 6. Estado de la sesión del panel a partir del registro.
  const state = await rpc("admin_session_state", [STUDENT]);
  assert.equal(state.denied_15m, 1);
  assert.equal(state.last_ok, null);
  assert.equal((await rpc("admin_session_state", [ADMIN])).ok_1m, 2);
  console.log("PASS el estado de la sesión sale del propio registro");

  // 7. Bandeja: sin IP en claro ni huellas completas, solo prefijos de 12.
  await pool.query("insert into public.mod_appeals(user_id, body) values ($1, $2)", [STUDENT, "<script>alert(1)</script> quiero apelar"]);
  await pool.query("insert into dream_private.mod_ip_blocks(ip_hash, until, rule) values ($1, now() + interval '1 day', 'G-BOT')", [hex(0xabc)]);
  await pool.query("insert into dream_private.mod_ip_signals(ip_hash, user_id) values ($1, $2)", [hex(0xabc), STUDENT]);
  await pool.query("insert into public.mod_sanctions(user_id, kind, rule, status, decided_by) values ($1,'baneo','G-MULTI','revision_pendiente','sistema')", [STUDENT]);
  const inbox = await rpc("admin_inbox", []);
  const text = JSON.stringify(inbox);
  assert.equal(inbox.appeals.length, 1);
  assert.ok(inbox.appeals[0].days_left >= 29 && inbox.appeals[0].days_left <= 30, "plazo de 30 días a la vista");
  assert.equal(inbox.proposals.length, 1);
  assert.equal(inbox.ip_blocks[0].ip_prefix.length, 12);
  assert.ok(!/[0-9a-f]{64}/.test(text), "ninguna huella completa en la bandeja");
  assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text), "ninguna IP en claro");
  const card = JSON.stringify(await rpc("admin_user_card", [STUDENT]));
  assert.ok(!/[0-9a-f]{64}/.test(card));
  console.log("PASS la bandeja y la ficha solo enseñan prefijos de huella, plazo de 30 días y nada de IP en claro");

  // 8. Bloquear 24 h la última huella de una cuenta y quitarla por prefijo.
  const prefix = await rpc("mod_ip_block_user", [STUDENT]);
  assert.equal(prefix, hex(0xabc).slice(0, 12));
  const until = (await one("select until from dream_private.mod_ip_blocks where ip_hash = $1", [hex(0xabc)])).until;
  assert.ok(Date.parse(until) - Date.now() > 23 * 3600_000);
  assert.equal(await rpc("mod_ip_block_user", [ADMIN]), null, "una cuenta sin huellas no bloquea nada");
  await assert.rejects(rpc("mod_ip_unblock", ["1.2.3.4"]), /prefix_invalid/);
  assert.equal(await rpc("mod_ip_unblock", [prefix]), 1);
  assert.equal((await one("select count(*)::int n from dream_private.mod_ip_blocks")).n, 0);
  console.log("PASS bloquear 24 h por cuenta y desbloquear por prefijo; un prefijo no válido se rechaza");

  // 9. Resolver apelaciones.
  const appeal = inbox.appeals[0].id;
  assert.equal((await rpc("admin_appeal_resolve", [appeal, "otra", "x"])).code, "estado_no_valido");
  assert.equal((await rpc("admin_appeal_resolve", [appeal, "aceptada", "ok"])).ok, true);
  assert.equal((await rpc("admin_appeal_resolve", [appeal, "rechazada", "ok"])).code, "ya_resuelta");
  assert.equal((await rpc("admin_inbox", [])).appeals.length, 0);
  console.log("PASS resolver apelaciones: una sola vez y con estados válidos");

  // 10. Buscar una apelación por su código (solo la función; el alumno no puede).
  const created = await rpc("mod_appeal_create", [STUDENT, "Quiero apelar", null]);
  assert.equal(created.ok, true);
  const code = created.code;
  const byCode = await rpc("admin_appeal_by_code", [` ${code.toLowerCase()} `]);
  assert.equal(byCode.user_id, STUDENT);
  assert.equal(await rpc("admin_appeal_by_code", ["DREAM-AAAA-BBBB"]), null);
  await assert.rejects(as("authenticated", "select public.admin_appeal_by_code('DREAM-AAAA-BBBB')", [], STUDENT), /permission denied/);
  console.log("PASS buscar una apelación por su código: insensible a mayúsculas y espacios; un alumno no puede");
} finally {
  await pool.end();
  await admin.query("drop database if exists dream_mod_admin_test with (force)");
  await admin.end();
}
