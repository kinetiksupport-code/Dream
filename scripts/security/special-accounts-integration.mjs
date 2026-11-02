// Prueba la migración de las cuentas de Fundación Loyola
// (20261028090000_special_accounts.sql) en un PostgreSQL local de usar y
// tirar, sobre las migraciones de admisión que reemplaza. Crea su propia base
// (dream_special_test). Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/special-accounts-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_special_test with (force)");
await admin.query("create database dream_special_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_special_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });
// Al final se borra esta base con «with (force)»: Postgres corta sus conexiones y
// una que siga en el pool emitiría «error» sin nadie que lo recoja.
pool.on("error", () => {});
const file = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

await pool.query(`create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;`);
await pool.query(readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
for (const name of ["20261008192123_security_admission.sql", "20261010120000_admission_pricing_reconcile.sql", "20261017090000_ai_modes_windows.sql", "20261028090000_special_accounts.sql"])
  await pool.query(file(name));
await pool.query(file("20261028090000_special_accounts.sql")); // se puede aplicar dos veces
await pool.query(`update dream_private.limits set enabled = true, rpm = 6, daily = 50, user_concurrency = 1, global_concurrency = 8,
  user_tokens = 10000, user_microusd = 1000000, special_rpm = 20, special_daily = 2000, special_user_tokens = 20000000`);

const NORMAL = randomUUID(), LOYOLA = randomUUID(), STALE = randomUUID();
await pool.query(`insert into auth.users(id, email, email_confirmed_at) values
  ($1, 'ana@gmail.com', now()), ($2, 'luis@fundacionloyola.net', now()), ($3, 'eva@otra.com', now())`, [NORMAL, LOYOLA, STALE]);
await pool.query("insert into public.dream_profiles(id) values ($1), ($2), ($3)", [NORMAL, LOYOLA, STALE]);

const one = async (sql, args) => (await pool.query(sql, args)).rows[0]?.r;
const mark = (owner, domain) => one("select public.dream_special_account_mark($1, $2) as r", [owner, domain]);
async function admitMany(owner, n) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const request = randomUUID();
    const r = await one("select public.dream_admit($1, $2, 'chat') as r", [owner, request]);
    codes.push(r.ok ? "ok" : r.code);
    if (r.ok) await pool.query("select public.dream_release($1, $2)", [owner, request]);
  }
  return codes;
}
const reset = () => pool.query("truncate dream_private.counters, dream_private.leases");

// 1. Marca: devuelve si es especial y si ya vio la bienvenida.
assert.deepEqual(await mark(LOYOLA, "fundacionloyola.net"), { special: true, welcome_shown_at: null });
// Una marca con un dominio que no es el de su correo no sirve de nada.
assert.equal((await mark(STALE, "fundacionloyola.net")).special, false);

// 2. Por minuto: el alumno normal se para en 6; Loyola sigue hasta 20, con su propio código.
await reset();
assert.deepEqual((await admitMany(NORMAL, 7)).slice(5), ["ok", "dream_rpm"]);
assert.deepEqual((await admitMany(STALE, 7)).slice(5), ["ok", "dream_rpm"]);
const loyola = await admitMany(LOYOLA, 21);
assert.equal(loyola.filter((c) => c === "ok").length, 20);
assert.equal(loyola[20], "dream_special_rpm");

// 3. Por día: con daily = 3, el normal se para y Loyola no.
await reset();
await pool.query("update dream_private.limits set daily = 3");
assert.equal((await admitMany(NORMAL, 4))[3], "dream_daily");
assert.ok((await admitMany(LOYOLA, 4)).every((c) => c === "ok"));
await pool.query("update dream_private.limits set daily = 50");

// 4. Tokens por alumno en dream_reserve: 10.000 para el normal, 20 millones para Loyola.
async function reserve(owner, tokens) {
  const request = randomUUID();
  await one("select public.dream_admit($1, $2, 'chat') as r", [owner, request]);
  const r = await one("select public.dream_reserve($1, $2, 'groq', $3, null, 'qwen/qwen3.8-27b', $3, 0) as r", [owner, request, tokens]);
  await pool.query("select public.dream_release($1, $2)", [owner, request]);
  return r.ok ? "ok" : r.code;
}
await reset();
assert.equal(await reserve(NORMAL, 12000), "dream_budget");
assert.equal(await reserve(LOYOLA, 12000), "ok");

// 5. Si el correo deja de ser del dominio, vuelve a los límites normales.
await pool.query("update auth.users set email = 'luis@gmail.com' where id = $1", [LOYOLA]);
await reset();
assert.equal(await reserve(LOYOLA, 12000), "dream_budget");

// 6. Solo service_role puede marcar; nadie lee la tabla de cuentas especiales.
for (const role of ["anon", "authenticated"]) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    await assert.rejects(client.query("select public.dream_special_account_mark($1, 'fundacionloyola.net')", [LOYOLA]), /permission denied/);
    await assert.rejects(client.query("select * from dream_private.special_accounts"), /permission denied/);
  } finally {
    await client.query("reset role");
    client.release();
  }
}

await pool.end();
await admin.query("drop database dream_special_test with (force)");
await admin.end();
console.log("special-accounts-integration: 6 bloques de comprobaciones OK");
