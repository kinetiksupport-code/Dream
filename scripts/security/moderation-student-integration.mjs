// Prueba B6 (lado del alumno: apelaciones, códigos y avisos) en un PostgreSQL
// local de usar y tirar. Crea y borra su propia base. Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55512/postgres \
//     node scripts/security/moderation-student-integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_mod_student_test with (force)");
await admin.query("create database dream_mod_student_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_mod_student_test";
const pool = new pg.Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });
// La base se borra con (force) al final: el aviso tardío de un cliente ya cerrado
// no es un fallo de la prueba (sin manejador, Node lo convierte en una excepción).
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
for (const file of ["20261022090000_moderation_data.sql", "20261023090000_moderation_evasion.sql", "20261024090000_moderation_ban.sql", "20261026090000_moderation_student.sql"])
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
const CODE = /^DREAM-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

try {
  const A = await user();
  const B = await user();

  // 1. Reclamar: texto 1..2000, máximo 3 abiertas, código aleatorio con formato y sin datos personales.
  assert.equal((await rpc("mod_appeal_create", [A, "   ", null])).code, "texto_no_valido");
  assert.equal((await rpc("mod_appeal_create", [A, "x".repeat(2001), null])).code, "texto_no_valido");
  const first = await rpc("mod_appeal_create", [A, "  Creo que ha sido un error.  ", null]);
  assert.equal(first.ok, true);
  assert.match(first.code, CODE);
  const days = (Date.parse(first.due_at) - Date.now()) / 86400_000;
  assert.ok(days > 29.9 && days < 30.1, "plazo de 30 días");
  assert.equal((await one("select body from public.mod_appeals where id = $1", [first.id])).body, "Creo que ha sido un error.", "se recorta el texto");
  await rpc("mod_appeal_create", [A, "segunda", null]);
  await rpc("mod_appeal_create", [A, "tercera", null]);
  assert.equal((await rpc("mod_appeal_create", [A, "cuarta", null])).code, "demasiadas_abiertas");
  assert.equal((await rpc("mod_appeal_create", [B, "otra cuenta no se ve afectada", null])).ok, true);
  console.log("PASS reclamar: texto de 1 a 2000, máximo 3 abiertas por cuenta y plazo de 30 días");

  // 2. Códigos: únicos, con formato, sin derivar de la cuenta.
  const codes = new Set();
  for (let i = 0; i < 300; i++) {
    const code = await pool.query("select dream_private.mod_make_code() as c").then((r) => r.rows[0].c);
    assert.match(code, CODE);
    codes.add(code);
  }
  assert.ok(codes.size > 295, "aleatorios (sin repeticiones apreciables)");
  await assert.rejects(pool.query("update public.mod_appeals set code = 'DREAM-AAAA-AAAA' where user_id = $1", [A]), /duplicate key|unique/);
  await assert.rejects(pool.query("update public.mod_appeals set code = 'mi-correo@x.es' where user_id = $1 and id = $2", [A, first.id]), /violates check constraint/);
  console.log("PASS códigos de apelación: formato fijo, únicos y no se admite otro formato (ni un correo)");

  // 3. Código para el chat de soporte: el mismo cada vez, ligado al baneo, sin pisar el máximo de 3.
  const C = await user();
  await pool.query("insert into public.mod_sanctions(user_id, kind, until, rule, decided_by) values ($1,'baneo',null,'G-BOT','admin')", [C]);
  const chat = await rpc("mod_appeal_code", [C]);
  assert.match(chat, CODE);
  assert.equal(await rpc("mod_appeal_code", [C]), chat, "idempotente: mismo código");
  const row = await one("select a.status, a.sanction_id, s.kind from public.mod_appeals a join public.mod_sanctions s on s.id = a.sanction_id where a.code = $1", [chat]);
  assert.deepEqual([row.status, row.kind], ["abierta", "baneo"]);
  assert.equal((await one("select count(*)::int n from public.mod_appeals where user_id = $1", [C])).n, 1);
  // Con 3 reclamaciones abiertas devuelve una existente en vez de crear una cuarta.
  const full = await rpc("mod_appeal_code", [A]);
  assert.match(full, CODE);
  assert.equal((await one("select count(*)::int n from public.mod_appeals where user_id = $1", [A])).n, 3);
  console.log("PASS código para el chat de soporte: idempotente, ligado al baneo y sin pasar de 3 abiertas");

  // 4. Una sanción ajena no se puede enlazar a mi reclamación.
  const other = (await one("insert into public.mod_sanctions(user_id, kind, rule, decided_by) values ($1,'aviso','G-SPAM','sistema') returning id", [B])).id;
  const D = await user();
  const mine = await rpc("mod_appeal_create", [D, "mía", other]);
  assert.equal((await one("select sanction_id from public.mod_appeals where id = $1", [mine.id])).sanction_id, null);
  console.log("PASS no se puede enlazar la sanción de otra cuenta");

  // 5. Lista de reclamaciones: plazo a la vista y la resolución solo cuando está resuelta.
  await pool.query("update public.mod_appeals set status='rechazada', resolution='No procede' where id = $1", [first.id]);
  const list = await rpc("mod_appeals_list", [A]);
  assert.equal(list.length, 3);
  assert.ok(list.every((a) => a.due_at && CODE.test(a.code)));
  assert.equal(list.find((a) => a.id === first.id).resolution, "No procede");
  assert.equal(list.filter((a) => a.status === "abierta").every((a) => a.resolution === null), true);
  assert.equal((await rpc("mod_appeals_list", [B])).every((a) => a.status === "abierta"), true);
  console.log("PASS lista de reclamaciones: plazo de 30 días y resolución solo si está resuelta");

  // 6. Avisos y limitaciones: solo los vigentes y no vistos; marcar como visto es solo de su dueño.
  const E = await user();
  const mk = async (kind, until, status = "activa") => (await one(`insert into public.mod_sanctions(user_id, kind, until, rule, status, decided_by) values ($1,$2,$3,'G-INSULT',$4,'ia') returning id`, [E, kind, until, status])).id;
  const aviso = await mk("aviso", null);
  const limit = await mk("limitacion", new Date(Date.now() + 3600_000).toISOString());
  await mk("limitacion", new Date(Date.now() - 3600_000).toISOString());
  await mk("aviso", null, "levantada");
  await mk("baneo", null);
  const notices = await rpc("mod_notices", [E]);
  assert.deepEqual(notices.map((n) => n.id).sort(), [aviso, limit].sort());
  assert.equal(await rpc("mod_ack", [B, aviso]), false, "otra cuenta no puede marcarlo");
  assert.equal(await rpc("mod_ack", [E, aviso]), true);
  assert.equal(await rpc("mod_ack", [E, aviso]), false, "ya estaba visto");
  assert.deepEqual((await rpc("mod_notices", [E])).map((n) => n.id), [limit]);
  assert.equal(await rpc("mod_ack", [E, (await one("select id from public.mod_sanctions where user_id=$1 and kind='baneo'", [E])).id]), false, "un baneo no se marca como visto");
  assert.deepEqual(await rpc("mod_notices", [B]).then((n) => n.map((x) => x.id)), [other]);
  console.log("PASS avisos: solo los vigentes y sin ver; marcar como visto es solo del dueño; un baneo no se oculta");

  // 7. El alumno no puede escribir en mod_* ni llamar a nada de esto.
  for (const sql of [
    "insert into public.mod_appeals(user_id, body) values (auth.uid(), 'x')",
    "update public.mod_appeals set code = 'DREAM-AAAA-BBBB'",
    "update public.mod_sanctions set acknowledged_at = now()",
    `select public.mod_appeal_create('${A}', 'x', null)`, `select public.mod_appeal_code('${A}')`, `select public.mod_appeals_list('${A}')`,
    `select public.mod_notices('${A}')`, `select public.mod_ack('${A}', '${aviso}')`, "select dream_private.mod_make_code()",
  ]) {
    await assert.rejects(as("authenticated", sql, [], A), /permission denied/, sql);
    await assert.rejects(as("anon", sql), /permission denied/, sql);
  }
  // Solo lee lo suyo (RLS): incluida la columna del código.
  const seen = await as("authenticated", "select user_id, code from public.mod_appeals", [], A);
  assert.ok(seen.rows.length > 0 && seen.rows.every((r) => r.user_id === A));
  console.log("PASS el alumno no escribe ni llama a las funciones; solo lee sus propias reclamaciones");
} finally {
  await pool.end();
  await admin.query("drop database if exists dream_mod_student_test with (force)");
  await admin.end();
}
