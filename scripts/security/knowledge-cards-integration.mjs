// Prueba la migración de las fichas de Dream (20261030090000_knowledge_cards.sql)
// y las 30 fichas de arranque en un PostgreSQL local de usar y tirar. Crea su
// propia base (dream_cards_test). Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/knowledge-cards-integration.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";
import { fichasSql } from "../ia/fichas-sql.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_cards_test with (force)");
await admin.query("create database dream_cards_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_cards_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 2, statement_timeout: 5000 });
// La base se borra con (force) al final: el aviso tardío de un cliente ya cerrado
// no es un fallo de la prueba (sin manejador, Node lo convierte en una excepción).
pool.on("error", () => {});
await pool.query(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;`);
const sql = readFileSync(new URL("../../supabase/migrations/20261030090000_knowledge_cards.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.query(sql);
const seed = JSON.parse(readFileSync(new URL("../../supabase/seed/fichas-borrador.json", import.meta.url), "utf8"));
await pool.query(fichasSql(seed.fichas));
await pool.query(fichasSql(seed.fichas)); // no duplica

async function as(role, query, args = []) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return await client.query(query, args);
  } finally {
    await client.query("reset role");
    client.release();
  }
}
const search = (q) => as("service_role", "select slug from public.dream_cards_search($1)", [q]).then((r) => r.rows.map((x) => x.slug));

// 1. Las 30 entran como borrador y la búsqueda no devuelve ninguna.
assert.equal((await pool.query("select count(*)::int as n from public.dream_knowledge_cards where estado = 'borrador'")).rows[0].n, 30);
assert.deepEqual(await search("fracción generatriz decimal periódico mixto"), []);

// 2. Revisar exige quién; revisada, la búsqueda en español la encuentra (sin tildes ni plurales exactos).
await assert.rejects(as("service_role", "select public.dream_card_review('fraccion-generatriz-periodico-mixto', '', true)"), /reviewer_required/);
await as("service_role", "select public.dream_card_review('fraccion-generatriz-periodico-mixto', 'Profesora de prueba', true)");
await as("service_role", "select public.dream_card_review('ecuacion-segundo-grado', 'Profesora de prueba', true)");
assert.deepEqual(await search("como se calcula la fraccion generatriz de un periodico mixto"), ["fraccion-generatriz-periodico-mixto"]);
assert.deepEqual(await search("ecuaciones de segundo grado discriminante"), ["ecuacion-segundo-grado"]);

// 3. Como mucho 3 resultados, aunque se pidan más.
for (const slug of ["fraccion-generatriz-exacto", "fraccion-generatriz-periodico-puro"]) await as("service_role", `select public.dream_card_review('${slug}', 'Prof', true)`);
assert.equal((await as("service_role", "select * from public.dream_cards_search('fracción generatriz', 10)")).rowCount, 3);

// 4. Volver a borrador la quita de la búsqueda; una ficha revisada sin revisor no puede existir.
await as("service_role", "select public.dream_card_review('ecuacion-segundo-grado', null, false)");
assert.deepEqual(await search("ecuaciones de segundo grado"), []);
await assert.rejects(pool.query("update public.dream_knowledge_cards set estado = 'revisada', revisado_por = null where slug = 'mru'"), /check/);

// 5. Permisos: el alumno lee solo las revisadas y no escribe; anon nada; nadie más llama a las funciones.
assert.equal((await as("authenticated", "select * from public.dream_knowledge_cards")).rowCount, 3);
await assert.rejects(as("authenticated", "update public.dream_knowledge_cards set regla = 'x'"), /permission denied/);
await assert.rejects(as("anon", "select * from public.dream_knowledge_cards"), /permission denied/);
await assert.rejects(as("authenticated", "select * from public.dream_cards_search('mol')"), /permission denied/);
await assert.rejects(as("authenticated", "select public.dream_card_review('mol', 'yo', true)"), /permission denied/);

await pool.end();
await admin.query("drop database dream_cards_test with (force)");
await admin.end();
console.log("knowledge-cards-integration: 5 bloques de comprobaciones OK");
