// Prueba la migración de la memoria (20261029090000_memory.sql) en un
// PostgreSQL local de usar y tirar. Crea su propia base (dream_memory_test).
// Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/memory-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_memory_test with (force)");
await admin.query("create database dream_memory_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_memory_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });

await pool.query(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.dream_profiles(id uuid primary key references auth.users(id) on delete cascade);
  create table public.dream_conversations(id uuid primary key, owner_id uuid references auth.users(id) on delete cascade);
  create table public.dream_messages(id uuid primary key);
  -- Como en producción (26/10/2026): la tabla de resúmenes ya existe, vacía.
  create table public.dream_conversation_summaries(
    conversation_id uuid primary key references public.dream_conversations(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade, summary text not null,
    last_message_id uuid references public.dream_messages(id) on delete set null, updated_at timestamptz not null default now());
  alter table public.dream_conversation_summaries enable row level security;
  create policy dream_summaries_select_own on public.dream_conversation_summaries for select to authenticated using (owner_id = auth.uid());
`);
const sql = readFileSync(new URL("../../supabase/migrations/20261029090000_memory.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.query(sql); // se puede aplicar dos veces

const A = randomUUID(), B = randomUUID(), CA = randomUUID(), CB = randomUUID();
await pool.query("insert into auth.users values ($1), ($2)", [A, B]);
await pool.query("insert into public.dream_profiles(id) values ($1), ($2)", [A, B]);
await pool.query("insert into public.dream_conversations values ($1, $2), ($3, $4)", [CA, A, CB, B]);

async function as(role, uid, query, args = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (uid) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await client.query(query, args);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const apply = (owner, conv, memories, forget = [], summary = "Repasó derivadas") =>
  as("service_role", null, "select public.dream_memory_apply($1, $2, $3, $4, $5::jsonb, $6::uuid[]) as r", [owner, conv, summary, ["derivadas"], JSON.stringify(memories), forget]).then((r) => r.rows[0].r);
const mem = (content, extra = {}) => ({ kind: "dificultad", content, subject: "Matemáticas", expires_at: null, ...extra });

// 1. Con la memoria apagada (valor por defecto) no se guarda nada.
assert.deepEqual(await apply(A, CA, [mem("Le cuestan las derivadas")]), { ok: false, code: "memory_disabled" });
assert.equal((await pool.query("select count(*)::int as n from public.dream_memories")).rows[0].n, 0);

// 2. Activada: guarda recuerdos, resumen y marca la conversación.
await pool.query("update public.dream_profiles set memory_enabled = true");
assert.deepEqual(await apply(A, CA, [mem("Le cuestan las derivadas"), mem("Prefiere ejemplos", { kind: "preferencia", subject: null })]), { ok: true, added: 2, forgotten: 0 });
assert.equal((await pool.query("select summary from public.dream_conversation_summaries where conversation_id = $1", [CA])).rows[0].summary, "Repasó derivadas");
assert.ok((await pool.query("select memory_extracted_at from public.dream_conversations where id = $1", [CA])).rows[0].memory_extracted_at);
// «Dream ha recordado 2 cosas»: se cuentan los nuevos de la conversación, no los importados.
assert.equal((await pool.query("select memory_unseen from public.dream_profiles where id = $1", [A])).rows[0].memory_unseen, 2);

// 3. No se puede usar la conversación de otro.
await assert.rejects(apply(A, CB, [mem("x")]), /invalid_memory/);

// 4. RLS: cada uno ve y borra solo lo suyo; nadie escribe desde el navegador.
await apply(B, CB, [mem("Le cuesta la oración compuesta", { subject: "Lengua" })]);
assert.equal((await as("authenticated", A, "select * from public.dream_memories")).rowCount, 2);
assert.equal((await as("authenticated", B, "select * from public.dream_memories")).rowCount, 1);
assert.equal((await as("authenticated", A, "delete from public.dream_memories where user_id = $1", [B])).rowCount, 0);
await assert.rejects(as("authenticated", A, "insert into public.dream_memories(user_id, kind, content) values ($1, 'dominio', 'x')", [A]), /permission denied/);
await assert.rejects(as("authenticated", A, "update public.dream_memories set content = 'x'"), /permission denied/);
await assert.rejects(as("authenticated", A, "select public.dream_memory_apply($1, null, '', '{}', '[]'::jsonb, '{}')", [A]), /permission denied/);
assert.equal((await as("anon", null, "select * from public.dream_memories").catch((e) => e)).message.includes("permission denied"), true);
assert.equal((await as("authenticated", A, "delete from public.dream_memories where content = 'Prefiere ejemplos'")).rowCount, 1);

// 5. «forget» solo borra recuerdos del mismo alumno.
const bId = (await pool.query("select id from public.dream_memories where user_id = $1", [B])).rows[0].id;
assert.equal((await apply(A, CA, [], [bId])).forgotten, 0);

// 6. Como mucho 40: sobran los no fijados más antiguos; los fijados se quedan.
await pool.query("update public.dream_memories set pinned = true, created_at = now() - interval '300 days' where user_id = $1", [A]);
for (let i = 0; i < 3; i++) await apply(A, CA, Array.from({ length: 15 }, (_, j) => mem(`Recuerdo ${i}-${j}`)));
const left = await pool.query("select count(*)::int as n, count(*) filter (where pinned)::int as p from public.dream_memories where user_id = $1", [A]);
assert.deepEqual(left.rows[0], { n: 40, p: 1 });
assert.equal((await pool.query("select count(*)::int as n from public.dream_memories where content like 'Recuerdo 0-%' and user_id = $1", [A])).rows[0].n, 9);

// 7. Caducidad: 12 meses sin uso se borran; lo usado hace poco se queda.
await pool.query("update public.dream_memories set last_used_at = now() - interval '13 months' where user_id = $1 and content like 'Recuerdo 1-%'", [A]);
await pool.query("update public.dream_conversation_summaries set updated_at = now() - interval '13 months' where conversation_id = $1", [CB]);
assert.equal((await as("service_role", null, "select public.dream_memory_purge() as n")).rows[0].n, 16);

// 8. Borrar la cuenta lo borra todo.
await pool.query("delete from auth.users where id = $1", [A]);
assert.equal((await pool.query("select count(*)::int as n from public.dream_memories where user_id = $1", [A])).rows[0].n, 0);
assert.equal((await pool.query("select count(*)::int as n from public.dream_conversation_summaries where owner_id = $1", [A])).rows[0].n, 0);

await pool.end();
await admin.query("drop database dream_memory_test with (force)");
await admin.end();
console.log("memory-integration: 8 bloques de comprobaciones OK");
