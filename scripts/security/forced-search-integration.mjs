// Prueba la migración del tope diario de búsquedas que lanza el servidor
// (20261027090000_forced_search_budget.sql) en un PostgreSQL local de usar y
// tirar. Crea su propia base (dream_forced_search_test). Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/forced-search-integration.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_forced_search_test with (force)");
await admin.query("create database dream_forced_search_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_forced_search_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 2, statement_timeout: 5000 });

// Lo mínimo de las tablas de admisión que usa la función (mismas columnas).
await pool.query(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  create schema dream_private;
  create table dream_private.limits(id boolean primary key default true check (id), searches_daily integer not null default 30);
  insert into dream_private.limits default values;
  create table dream_private.counters(scope text, bucket timestamptz, tokens bigint default 0, microusd bigint default 0, searches integer default 0, primary key (scope, bucket));
  grant usage on schema public to anon, authenticated, service_role;
`);
const sql = readFileSync(new URL("../../supabase/migrations/20261027090000_forced_search_budget.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.query(sql); // se puede aplicar dos veces

async function as(role, query) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return (await client.query(query)).rows[0];
  } finally {
    await client.query("reset role");
    client.release();
  }
}

// 1. Sin búsquedas hoy: 0 de 60 (valor por defecto).
assert.deepEqual((await as("service_role", "select public.dream_forced_search_budget() as r")).r, { used: 0, cap: 60 });

// 2. Cuenta las del contador global de hoy, no las de ayer ni las de un alumno.
await pool.query(`insert into dream_private.counters(scope, bucket, searches) values
  ('global', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', 12),
  ('global', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '1 day', 99),
  ('00000000-0000-4000-8000-000000000001', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', 5)`);
assert.deepEqual((await as("service_role", "select public.dream_forced_search_budget() as r")).r, { used: 12, cap: 60 });

// 3. El tope se cambia en la tabla y 0 apaga la búsqueda automática.
await pool.query("update dream_private.limits set forced_searches_daily = 0");
assert.equal((await as("service_role", "select public.dream_forced_search_budget() as r")).r.cap, 0);
await assert.rejects(pool.query("update dream_private.limits set forced_searches_daily = -1"), /check/);

// 4. Solo service_role puede llamarla.
for (const role of ["anon", "authenticated"])
  await assert.rejects(as(role, "select public.dream_forced_search_budget()"), /permission denied/, role);

await pool.end();
await admin.query("drop database dream_forced_search_test with (force)");
await admin.end();
console.log("forced-search-integration: 4 comprobaciones OK");
