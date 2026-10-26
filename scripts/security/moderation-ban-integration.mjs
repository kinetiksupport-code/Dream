// Prueba B5b (baneo comprobado en cada petición) en un PostgreSQL
// local de usar y tirar. Crea y borra su propia base. Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/moderation-ban-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_mod_ban_test with (force)");
await admin.query("create database dream_mod_ban_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_mod_ban_test";
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
for (const file of ["20261022090000_moderation_data.sql", "20261023090000_moderation_evasion.sql", "20261024090000_moderation_ban.sql"])
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
const user = async () => {
  const id = randomUUID();
  await pool.query("insert into auth.users(id) values ($1)", [id]);
  return id;
};
const iso = (ms) => new Date(Date.now() + ms).toISOString();

try {
  const A = await user();
  const B = await user();

  // 1. mod_ban_state: solo un baneo activo y vigente cuenta, escrito por la función o a mano.
  assert.equal((await rpc("mod_ban_state", [A])).banned, false);
  await pool.query("insert into public.mod_sanctions(user_id, kind, until, rule, decided_by) values ($1,'baneo',$2,'G-SPAM','admin')", [A, iso(3600_000)]); // «a mano», como desde Studio
  const hand = await rpc("mod_ban_state", [A]);
  assert.equal(hand.banned, true);
  assert.equal(hand.permanent, false);
  assert.equal(hand.rule, "G-SPAM");
  assert.equal((await rpc("mod_ban_state", [B])).banned, false, "no afecta a otra cuenta");
  await pool.query("update public.mod_sanctions set until = now() - interval '1 second' where user_id=$1", [A]);
  assert.equal((await rpc("mod_ban_state", [A])).banned, false, "caducado");
  await pool.query("update public.mod_sanctions set until = null, status='revision_pendiente' where user_id=$1", [A]);
  assert.equal((await rpc("mod_ban_state", [A])).banned, false, "una propuesta no banea");
  await pool.query("update public.mod_sanctions set status='levantada' where user_id=$1", [A]);
  assert.equal((await rpc("mod_ban_state", [A])).banned, false, "levantado");
  await pool.query("update public.mod_sanctions set status='activa' where user_id=$1", [A]);
  assert.equal((await rpc("mod_ban_state", [A])).permanent, true, "permanente = sin fecha");
  console.log("PASS mod_ban_state: activo, permanente, caducado, propuesto y levantado; escrito a mano vale igual");

  // 2. mod_ban_set: baneo + sesiones cerradas + evento; sin duplicados.
  await pool.query("delete from public.mod_sanctions");
  await pool.query("insert into auth.sessions(user_id) values ($1), ($1)", [B]);
  const id = await rpc("mod_ban_set", [B, iso(7 * 86400_000), "G-BOT", "admin"]);
  assert.ok(id);
  assert.equal((await rpc("mod_ban_state", [B])).banned, true);
  assert.equal((await one("select count(*)::int n from auth.sessions where user_id=$1", [B])).n, 0);
  assert.equal((await one("select count(*)::int n from dream_private.mod_events where user_id=$1 and origin='manual'", [B])).n, 1);
  await assert.rejects(rpc("mod_ban_set", [B, null, "G-BOT", "root"]), /decided_by_invalid/);
  console.log("PASS mod_ban_set: banea, cierra las sesiones y deja evento");

  // 3. mod_ban_lift: levanta todos los activos y la observación.
  await pool.query("insert into dream_private.mod_observations(new_user, ip_hash, ends_at) values ($1, $2, now())", [B, "a".repeat(64)]);
  assert.equal(await rpc("mod_ban_lift", [B]), 1);
  assert.equal((await rpc("mod_ban_state", [B])).banned, false);
  assert.equal((await one("select status from dream_private.mod_observations where new_user=$1", [B])).status, "levantada");
  console.log("PASS mod_ban_lift: levanta el baneo y la observación");

  // 4. mod_sanction_resolve: confirmar solo una propuesta; bajar a aviso; levantar.
  const p = (await one("insert into public.mod_sanctions(user_id, kind, until, status, rule, decided_by) values ($1,'baneo',null,'revision_pendiente','G-MULTI','sistema') returning id", [B])).id;
  assert.equal((await rpc("mod_ban_state", [B])).banned, false);
  assert.equal((await rpc("mod_sanction_resolve", [p, "confirmar"])).ok, true);
  assert.equal((await rpc("mod_ban_state", [B])).banned, true);
  assert.equal((await rpc("mod_sanction_resolve", [p, "confirmar"])).code, "estado_no_valido", "no se confirma dos veces");
  assert.equal((await rpc("mod_sanction_resolve", [p, "bajar_a_aviso"])).ok, true);
  assert.equal((await rpc("mod_ban_state", [B])).banned, false);
  assert.equal((await one("select kind, until from public.mod_sanctions where id=$1", [p])).kind, "aviso");
  assert.equal((await rpc("mod_sanction_resolve", [p, "levantar"])).ok, true);
  assert.equal((await rpc("mod_sanction_resolve", [p, "hackear"])).code, "accion_no_valida");
  assert.equal((await rpc("mod_sanction_resolve", [randomUUID(), "levantar"])).code, "no_encontrada");
  console.log("PASS mod_sanction_resolve: confirmar, bajar a aviso y levantar; acciones y ids inválidos se rechazan");

  // 5. Un alumno normal no puede llamar a nada de esto.
  for (const sql of ["select public.mod_ban_state(auth.uid())", "select public.mod_ban_lift(auth.uid())", "select public.mod_ban_set(auth.uid(), null, 'x', 'admin')", `select public.mod_sanction_resolve('${p}', 'levantar')`]) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await assert.rejects(client.query(sql), /permission denied/, sql);
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  }
  console.log("PASS un alumno normal no puede banear, levantar ni resolver");
} finally {
  await pool.end();
  await admin.query("drop database if exists dream_mod_ban_test with (force)");
  await admin.end();
}
