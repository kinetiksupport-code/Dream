// Prueba B3 (cuentas nuevas desde la IP de una cuenta baneada) en un PostgreSQL
// local de usar y tirar. Crea y borra su propia base. Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/moderation-evasion-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_mod_evasion_test with (force)");
await admin.query("create database dream_mod_evasion_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_mod_evasion_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });
// Al final se borra esta base con «with (force)»: Postgres corta sus conexiones y
// una que siga en el pool emitiría «error» sin nadie que lo recoja.
pool.on("error", () => {});

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
for (const file of ["20261022090000_moderation_data.sql", "20261023090000_moderation_evasion.sql"])
  await pool.query(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));

const hex = (n) => n.toString(16).padStart(64, "0");
const HOME = hex(1);
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
const user = async (createdAt = "now()") => {
  const id = randomUUID();
  await pool.query(`insert into auth.users(id, created_at) values ($1, ${createdAt})`, [id]);
  return id;
};
const activeBan = async (id) => (await one("select count(*)::int n from public.mod_sanctions where user_id=$1 and kind='baneo' and status='activa'", [id])).n;
const pendingBan = async (id) => (await one("select count(*)::int n from public.mod_sanctions where user_id=$1 and kind='baneo' and status='revision_pendiente'", [id])).n;
/** Simula que han pasado `entries` visitas separadas y que el plazo de 2 días terminó. */
async function age(obsId) {
  await pool.query("update dream_private.mod_observations set ends_at = now() - interval '1 minute' where id = $1", [obsId]);
}
async function visits(id, ip, n) {
  let last;
  for (let i = 0; i < n; i++) {
    last = await rpc("mod_entry", [ip, id, 30, 30, 2, 4]);
    await pool.query("update dream_private.mod_observations set last_entry_at = last_entry_at - interval '1 hour' where new_user = $1", [id]);
  }
  return last;
}
const resolve = (id, auto, min = 4) => rpc("mod_observation_resolve", [id, auto, min, 4, 7, 30]);
/** Una cuenta baneada que usó la IP, y después una cuenta nueva. */
async function scenario({ others = 0 } = {}) {
  const banned = await user("now() - interval '10 days'");
  await rpc("mod_entry", [HOME, banned, 30, 30, 2, 4]);
  for (let i = 0; i < others; i++) await rpc("mod_entry", [HOME, await user("now() - interval '20 days'"), 30, 30, 2, 4]);
  await pool.query("insert into public.mod_sanctions(user_id, kind, rule, decided_by, created_at) values ($1,'baneo','G-SPAM','admin', now() - interval '3 days')", [banned]);
  return { banned, fresh: await user("now() - interval '1 day'") };
}
async function reset() {
  await pool.query("truncate public.mod_sanctions, dream_private.mod_events, dream_private.mod_ip_signals, dream_private.mod_ip_hits, dream_private.mod_observations cascade");
  await pool.query("delete from auth.users");
}

try {
  // 1. Hogar, 4 entradas, interruptor ENCENDIDO: se aplica la fila de la tabla G.
  await reset();
  let { fresh } = await scenario();
  let o = await visits(fresh, HOME, 4);
  assert.equal(o.status, "observando");
  assert.equal(o.entries, 4);
  assert.equal(await activeBan(fresh), 0, "durante la observación no hay baneo");
  const during = await rpc("mod_ip_check", [hex(7), fresh, false]);
  assert.equal(during.banned, false);
  assert.equal(during.user_limited_until, null, "sigue con los límites normales, sin sanción visible");
  assert.equal((await resolve(o.id, true)).status, "observando", "antes del plazo no se resuelve");
  await age(o.id);
  assert.equal((await resolve(o.id, true)).status, "confirmada");
  assert.equal(await activeBan(fresh), 1);
  const ban = await one("select until from public.mod_sanctions where user_id=$1 and kind='baneo'", [fresh]);
  const days = (Date.parse(ban.until) - Date.now()) / 86400_000;
  assert.ok(days > 6.9 && days < 7.1, "baneo de 7 días");
  assert.equal((await one("select count(*)::int n from dream_private.mod_events where user_id=$1 and rule='G-MULTI'", [fresh])).n, 1, "motivo en mod_events");
  console.log("PASS hogar: 4 entradas en 2 días y el interruptor encendido aplican la fila «varias cuentas» (7 días), con su motivo");

  // 2. Interruptor APAGADO (por defecto): solo propone.
  await reset();
  ({ fresh } = await scenario());
  o = await visits(fresh, HOME, 5);
  await age(o.id);
  assert.equal((await resolve(o.id, false)).status, "revision_pendiente");
  assert.equal(await activeBan(fresh), 0);
  assert.equal(await pendingBan(fresh), 1);
  console.log("PASS con el interruptor apagado solo se propone: nadie es baneado");

  // 3. Menos de 4 entradas: se descarta y no pasa nada.
  await reset();
  ({ fresh } = await scenario());
  o = await visits(fresh, HOME, 3);
  await age(o.id);
  assert.equal((await resolve(o.id, true)).status, "descartada");
  assert.equal(await activeBan(fresh) + (await pendingBan(fresh)), 0);
  console.log("PASS con menos de 4 entradas se descarta sin sanción");

  // 4. Colegio: más de 4 cuentas en la IP en 30 días. Nunca se banea solo, ni con 10 entradas y el interruptor encendido.
  await reset();
  ({ fresh } = await scenario({ others: 5 }));
  o = await rpc("mod_entry", [HOME, fresh, 30, 30, 2, 4]);
  assert.equal(o.status, "revision_pendiente", "va directo al panel");
  assert.equal(o.shared, true);
  o = await visits(fresh, HOME, 10);
  await age(o.id);
  await pool.query("update dream_private.mod_observations set status='observando' where id=$1", [o.id]); // aunque se forzara «observando»
  const school = await resolve(o.id, true);
  assert.equal(school.status, "revision_pendiente");
  assert.equal(await activeBan(fresh), 0, "un colegio no produce baneos automáticos");
  console.log("PASS colegio (más de 4 cuentas en la IP): ni con 10 entradas y el interruptor encendido se banea a nadie");

  // 5. La cuenta debe ser POSTERIOR al baneo.
  await reset();
  const banned = await user("now() - interval '10 days'");
  const older = await user("now() - interval '5 days'");
  await rpc("mod_entry", [HOME, banned, 30, 30, 2, 4]);
  await pool.query("insert into public.mod_sanctions(user_id, kind, rule, decided_by, created_at) values ($1,'baneo','G-BOT','admin', now() - interval '1 day')", [banned]);
  assert.equal(await rpc("mod_entry", [HOME, older, 30, 30, 2, 4]), null, "cuenta anterior al baneo: nada");
  console.log("PASS una cuenta creada antes del baneo no entra en observación");

  // 6. Baneo caducado, levantado o solo propuesto: no hay observación.
  for (const [until, status] of [["now() - interval '1 day'", "activa"], ["now() + interval '5 days'", "levantada"], ["now() + interval '5 days'", "revision_pendiente"]]) {
    await reset();
    const b = await user("now() - interval '10 days'");
    await rpc("mod_entry", [HOME, b, 30, 30, 2, 4]);
    await pool.query(`insert into public.mod_sanctions(user_id, kind, until, status, rule, decided_by, created_at) values ($1,'baneo',${until},$2,'G-BOT','admin', now() - interval '3 days')`, [b, status]);
    assert.equal(await rpc("mod_entry", [HOME, await user("now() - interval '1 day'"), 30, 30, 2, 4]), null, status);
  }
  console.log("PASS solo un baneo ACTIVO y vigente abre observación");

  // 7. Otra IP distinta: sin relación. Y solo se guardan huellas.
  await reset();
  ({ fresh } = await scenario());
  assert.equal(await rpc("mod_entry", [hex(2), fresh, 30, 30, 2, 4]), null);
  o = await visits(fresh, HOME, 1);
  const stored = await pool.query("select ip_hash from dream_private.mod_observation_entries");
  assert.ok(stored.rows.every((r) => /^[0-9a-f]{64}$/.test(r.ip_hash)));
  await assert.rejects(rpc("mod_entry", ["203.0.113.5", fresh, 30, 30, 2, 4]), /ip_hash_invalid/);
  console.log("PASS otra IP no se relaciona; solo huellas, nunca la IP en claro");

  // 8. Cierre de sesiones al banear automáticamente; al borrar la cuenta, todo fuera.
  await reset();
  ({ fresh } = await scenario());
  await pool.query("insert into auth.sessions(user_id) values ($1), ($1)", [fresh]);
  o = await visits(fresh, HOME, 4);
  await age(o.id);
  await resolve(o.id, true);
  assert.equal((await one("select count(*)::int n from auth.sessions where user_id=$1", [fresh])).n, 0);
  await pool.query("delete from auth.users where id=$1", [fresh]);
  assert.equal((await one("select count(*)::int n from dream_private.mod_observations where new_user=$1", [fresh])).n, 0);
  console.log("PASS al banear se cierran las sesiones y al borrar la cuenta se borra la observación");
} finally {
  await pool.end();
  await admin.query("drop database if exists dream_mod_evasion_test with (force)");
  await admin.end();
}
