// Prueba la migración de moderación (20261022090000_moderation_data.sql) en un
// PostgreSQL local de usar y tirar. Crea su propia base (dream_mod_test) y no
// toca nada más. Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/moderation-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_mod_test with (force)");
await admin.query("create database dream_mod_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_mod_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });

await pool.query(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
await pool.query(readFileSync(new URL("../../supabase/migrations/20261022090000_moderation_data.sql", import.meta.url), "utf8"));

const hash = (n) => n.toString(16).padStart(64, "0");
const A = randomUUID(), B = randomUUID();
await pool.query("insert into auth.users(id) values ($1), ($2)", [A, B]);

/** Ejecuta con un rol y, si se pide, como un usuario concreto de Supabase. */
async function as(role, uid, sql, args = []) {
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
const svc = async (sql, args = []) => (await pool.query(sql, args)).rows;
// service_role llama a funciones que escriben: sin rollback.
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

try {
  // 1. El alumno solo lee sus sanciones y reclamaciones; no escribe nada.
  await svc("insert into public.mod_sanctions(user_id, kind, rule, decided_by) values ($1,'aviso','G-SPAM','sistema'), ($2,'limitacion','G-SPAM','sistema')", [A, B]);
  await svc("insert into public.mod_appeals(user_id, body) values ($1,'x'), ($2,'y')", [A, B]);
  const mine = await as("authenticated", A, "select user_id from public.mod_sanctions");
  assert.deepEqual(mine.rows.map((r) => r.user_id), [A]);
  assert.equal((await as("authenticated", A, "select user_id from public.mod_appeals")).rows.length, 1);
  for (const sql of [
    "insert into public.mod_sanctions(user_id, kind, rule, decided_by) values (auth.uid(),'aviso','x','admin')",
    "update public.mod_sanctions set status='levantada'",
    "delete from public.mod_sanctions",
    "insert into public.mod_appeals(user_id, body) values (auth.uid(),'z')",
    "update public.mod_appeals set status='aceptada'",
    "select * from dream_private.mod_events",
    "select * from dream_private.mod_ip_signals",
    "select * from dream_private.mod_ip_blocks",
    "select * from dream_private.mod_ip_hits",
    "select public.mod_ip_check('" + hash(1) + "', auth.uid())",
    "select public.mod_purge()",
    "select public.mod_sanction_add(auth.uid(),'baneo',null,'x','activa','admin')",
  ])
    await assert.rejects(as("authenticated", A, sql), /permission denied/, sql);
  for (const sql of ["select * from public.mod_sanctions", "select * from public.mod_appeals", "select public.mod_ip_check('" + hash(1) + "', gen_random_uuid())"])
    await assert.rejects(as("anon", null, sql), /permission denied/, sql);
  console.log("PASS el alumno solo lee lo suyo; anon no ve nada; ni uno ni otro escriben ni llaman a las funciones");

  // 2. La IP solo entra como huella HMAC (64 hexadecimales): una IP en claro se rechaza.
  await assert.rejects(rpc("mod_ip_check", ["203.0.113.5", A, true]), /ip_hash_invalid/);
  await assert.rejects(svc("insert into dream_private.mod_ip_blocks(ip_hash, until, rule) values ('203.0.113.5', now(), 'x')"), /violates check constraint/);
  console.log("PASS una IP en claro no se puede guardar");

  // 3. Contadores: por IP, por cuenta y cuentas distintas.
  const ip = hash(255);
  for (let i = 0; i < 3; i++) await rpc("mod_ip_check", [ip, A, true]);
  await rpc("mod_ip_check", [ip, B, true]);
  const sig = await rpc("mod_ip_check", [ip, A, false]);
  assert.equal(sig.hits_minute, 4);
  assert.equal(sig.hits_hour, 4);
  assert.equal(sig.distinct_users_hour, 2);
  assert.equal(sig.user_hits_hour, 3);
  assert.equal(sig.ip_blocked_until, null);
  assert.equal(sig.banned, false);
  console.log("PASS contadores por IP, por cuenta y cuentas distintas; consultar sin registrar no cuenta");

  // 4. Bloqueo de 24 h: se ve mientras dura y desaparece al caducar.
  await rpc("mod_ip_block_set", [ip, new Date(Date.now() + 86400_000).toISOString(), "G-BOT"]);
  const blocked = await rpc("mod_ip_check", [ip, B, false]);
  assert.ok(Date.parse(blocked.ip_blocked_until) - Date.now() > 86400_000 - 5000);
  await rpc("mod_ip_block_set", [ip, new Date(Date.now() - 1000).toISOString(), "G-BOT"]); // greatest(): no acorta
  assert.ok((await rpc("mod_ip_check", [ip, B, false])).ip_blocked_until);
  await svc("update dream_private.mod_ip_blocks set until = now() - interval '1 second' where ip_hash = $1", [ip]);
  assert.equal((await rpc("mod_ip_check", [ip, B, false])).ip_blocked_until, null);
  console.log("PASS bloqueo de 24 h: dura, no se acorta y se levanta al caducar");

  // 5. Sanciones: limitación y baneo visibles; el aviso no limita; sin duplicados; reincidencia.
  const until = new Date(Date.now() + 3600_000).toISOString();
  const s1 = await rpc("mod_sanction_add", [A, "limitacion", until, "G-SPAM", "activa", "sistema"]);
  const s2 = await rpc("mod_sanction_add", [A, "limitacion", until, "G-SPAM", "activa", "sistema"]);
  assert.equal(s1, s2);
  assert.equal((await rpc("mod_ip_check", [hash(9), A, false])).user_limited_until?.slice(0, 16), new Date(until).toISOString().slice(0, 16).replace("T", " ").replace(" ", "T"));
  await rpc("mod_sanction_add", [A, "baneo", new Date(Date.now() + 7 * 86400_000).toISOString(), "G-SPAM", "revision_pendiente", "sistema"]);
  assert.equal((await rpc("mod_ip_check", [hash(9), A, false])).banned, false, "una propuesta pendiente no banea");
  await rpc("mod_sanction_add", [A, "baneo", null, "G-BOT", "activa", "admin"]);
  assert.equal((await rpc("mod_ip_check", [hash(9), A, false])).banned, true);
  assert.equal((await rpc("mod_ip_check", [hash(9), B, false])).banned, false);
  assert.equal(await rpc("mod_event_add", [A, "G-SPAM", "automatico", "media", null, "rate:user_hour", 7]), 0);
  assert.equal(await rpc("mod_event_add", [A, "G-SPAM", "automatico", "media", null, "rate:user_hour", 7]), 1);
  console.log("PASS sanciones: sin duplicados, una propuesta no banea, el baneo activo sí, reincidencia contada");

  // 6. Retención: las filas de IP se borran a los 30 días; lo reciente se queda.
  await svc("insert into dream_private.mod_ip_signals(ip_hash, user_id, first_seen, last_seen) values ($1,$2, now() - interval '40 days', now() - interval '31 days'), ($3,$2, now(), now())", [hash(100), A, hash(101)]);
  await svc("insert into dream_private.mod_ip_blocks(ip_hash, until, rule) values ($1, now() - interval '31 days', 'G-BOT'), ($2, now() + interval '1 hour', 'G-BOT')", [hash(102), hash(103)]);
  await svc("insert into dream_private.mod_ip_hits(ip_hash, user_id, bucket, hits) values ($1,$2, now() - interval '3 hours', 5)", [hash(104), A]);
  await rpc("mod_purge", []);
  const left = (t) => svc(`select count(*)::int n from dream_private.${t}`).then((r) => r[0].n);
  assert.equal((await svc("select count(*)::int n from dream_private.mod_ip_signals where ip_hash = $1", [hash(100)]))[0].n, 0);
  assert.equal((await svc("select count(*)::int n from dream_private.mod_ip_signals where ip_hash = $1", [hash(101)]))[0].n, 1);
  assert.equal((await svc("select count(*)::int n from dream_private.mod_ip_blocks where ip_hash = $1", [hash(102)]))[0].n, 0);
  assert.equal((await svc("select count(*)::int n from dream_private.mod_ip_blocks where ip_hash = $1", [hash(103)]))[0].n, 1);
  assert.equal((await svc("select count(*)::int n from dream_private.mod_ip_hits where ip_hash = $1", [hash(104)]))[0].n, 0);
  assert.ok((await left("mod_ip_hits")) >= 1);
  console.log("PASS retención: a los 30 días se borra lo viejo y se conserva lo reciente");

  // 7. Al borrar la cuenta se borra todo lo suyo.
  await svc("delete from auth.users where id = $1", [A]);
  for (const t of ["public.mod_sanctions", "public.mod_appeals", "dream_private.mod_events", "dream_private.mod_ip_signals", "dream_private.mod_ip_hits"])
    assert.equal((await svc(`select count(*)::int n from ${t} where user_id = $1`, [A]))[0].n, 0, t);
  assert.equal((await svc("select count(*)::int n from public.mod_sanctions where user_id = $1", [B]))[0].n, 1);
  console.log("PASS al borrar la cuenta se borran sus filas y solo las suyas");
} finally {
  await pool.end();
  await admin.query("drop database if exists dream_mod_test with (force)");
  await admin.end();
}
