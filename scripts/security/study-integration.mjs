// Prueba la migración de la ruta de estudio (20261102090000_study_steps.sql)
// en un PostgreSQL local de usar y tirar (base dream_study_test). Nunca toca
// Supabase. Dos alumnos: ninguno ve nada del otro; nadie escribe salvo
// service_role; topes diarios; Fundación Loyola sin tope; borrar la cuenta lo
// borra todo.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { isolatedPool } from "./db.mjs";

const admin = isolatedPool();
await admin.query("drop database if exists dream_study_test with (force)");
await admin.query("create database dream_study_test");
const url = new URL(process.env.DREAM_TEST_DATABASE_URL || "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres");
url.pathname = "/dream_study_test";
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
  -- Como en Supabase: service_role (dream-api) se salta RLS.
  alter role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Como en producción: exámenes, unidades y sesiones con dueño.
  create table public.dream_exams(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade, unique(id, owner_id));
  create table public.dream_exam_units(id uuid primary key, exam_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
    unique(id, exam_id, owner_id), foreign key(exam_id, owner_id) references public.dream_exams(id, owner_id) on delete cascade);
  create table public.dream_exam_sessions(id uuid primary key default gen_random_uuid(), exam_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
    mode text not null, started_at timestamptz not null default now(), foreign key(exam_id, owner_id) references public.dream_exams(id, owner_id) on delete cascade);
  -- Cuentas especiales (Fundación Loyola), como 20261028090000_special_accounts.sql.
  create schema dream_private;
  create table dream_private.special_accounts(owner_id uuid primary key);
  create function dream_private.is_special_account(p_owner uuid) returns boolean language sql stable as
    $f$ select exists(select 1 from dream_private.special_accounts where owner_id = p_owner) $f$;
  grant all on all tables in schema public to service_role;
`);
const sql = readFileSync(new URL("../../supabase/migrations/20261102090000_study_steps.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.query(sql); // se puede aplicar dos veces
await pool.query("grant all on all tables in schema public to service_role; grant usage on schema dream_private to service_role");

const A = randomUUID(), B = randomUUID(), L = randomUUID();
const EA = randomUUID(), EB = randomUUID(), EL = randomUUID();
const UA = randomUUID(), UB = randomUUID(), UL = randomUUID();
await pool.query("insert into auth.users values ($1), ($2), ($3)", [A, B, L]);
await pool.query("insert into public.dream_exams values ($1, $2), ($3, $4), ($5, $6)", [EA, A, EB, B, EL, L]);
await pool.query("insert into public.dream_exam_units values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)", [UA, EA, A, UB, EB, B, UL, EL, L]);

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

// Datos de los dos alumnos, escritos como lo haría dream-api (service_role).
const reading = JSON.stringify({ sections: [{ title: "x", body_markdown: "y", check: { statement: "s", is_true: true, explanation: "e" } }] });
for (const [s, e, u] of [[A, EA, UA], [B, EB, UB]]) {
  await as("service_role", null, "insert into public.dream_unit_content(unit_id, exam_id, student_id, status, reading, quiz) values ($1, $2, $3, 'ready', $4, '[]')", [u, e, s, reading]);
  await as("service_role", null, "insert into public.dream_unit_progress(unit_id, student_id, exam_id, reading_section) values ($1, $2, $3, 1)", [u, s, e]);
  const card = await as("service_role", null, "insert into public.dream_cards(student_id, exam_id, unit_id, front, back, origin) values ($1, $2, $3, 'f', 'b', 'ai') returning id", [s, e, u]);
  await as("service_role", null, "insert into public.dream_card_reviews(review_id, card_id, student_id, rating, reviewed_at) values ($1, $2, $3, 3, now())", [randomUUID(), card.rows[0].id, s]);
  await as("service_role", null, "insert into public.dream_error_bank(student_id, exam_id, unit_id, question_ref, cause) values ($1, $2, $3, 'q1', 'concepto')", [s, e, u]);
  await as("service_role", null, "insert into public.dream_exam_blueprints(exam_id, student_id, blueprint, inputs_hash) values ($1, $2, '{}', 'hash12345')", [e, s]);
}
const tables = ["dream_unit_content", "dream_unit_progress", "dream_cards", "dream_card_reviews", "dream_error_bank", "dream_exam_blueprints"];
let checks = 0;

// 1. Cada alumno ve solo lo suyo; el otro, nada (ni contado).
for (const t of tables) {
  const mine = await as("authenticated", A, `select student_id from public.${t}`);
  assert.equal(mine.rows.length, 1, t);
  assert.ok(mine.rows.every((r) => r.student_id === A), t);
  const theirs = await as("authenticated", A, `select count(*)::int as n from public.${t} where student_id = $1`, [B]);
  assert.equal(theirs.rows[0].n, 0, t);
  // anon: ni leer.
  await assert.rejects(as("anon", null, `select * from public.${t}`), /permission denied/, t);
  checks++;
}

// 2. El alumno no escribe nunca (ni lo suyo): solo dream-api.
await assert.rejects(as("authenticated", A, "insert into public.dream_cards(student_id, exam_id, front, back, origin) values ($1, $2, 'f', 'b', 'own')", [A, EA]), /permission denied/);
await assert.rejects(as("authenticated", A, "update public.dream_cards set front = 'x'"), /permission denied/);
await assert.rejects(as("authenticated", A, "delete from public.dream_unit_content"), /permission denied/);
await assert.rejects(as("authenticated", A, "update public.dream_unit_progress set quiz_best_pct = 100"), /permission denied/);
await assert.rejects(as("authenticated", A, "select public.dream_study_quota($1, 'lesson')", [A]), /permission denied/);
checks++;

// 3. Una lección, una fila por unidad; y el banco de otra persona no se puede enlazar.
await assert.rejects(as("service_role", null, "insert into public.dream_unit_content(unit_id, exam_id, student_id) values ($1, $2, $3)", [UA, EA, A]), /duplicate key/);
await assert.rejects(as("service_role", null, "insert into public.dream_cards(student_id, exam_id, front, back, origin) values ($1, $2, 'f', 'b', 'own')", [A, EB]), /foreign key/);
checks++;

// 4. Tope de lecciones nuevas al día: 6; las fallidas no cuentan; Loyola sin tope.
const quota = async (who, kind = "lesson", exam = null) => (await as("service_role", null, "select public.dream_study_quota($1, $2, $3) as q", [who, kind, exam])).rows[0].q;
assert.deepEqual(await quota(A), { ok: true, used: 1, cap: 6, unlimited: false });
for (let i = 0; i < 5; i++) {
  const u = randomUUID();
  await pool.query("insert into public.dream_exam_units values ($1, $2, $3)", [u, EA, A]);
  await as("service_role", null, "insert into public.dream_unit_content(unit_id, exam_id, student_id, status) values ($1, $2, $3, 'generating')", [u, EA, A]);
}
assert.equal((await quota(A)).ok, false);
await pool.query("update public.dream_unit_content set status = 'failed' where student_id = $1 and status = 'generating'", [A]);
assert.deepEqual(await quota(A), { ok: true, used: 1, cap: 6, unlimited: false });
await pool.query("insert into dream_private.special_accounts values ($1)", [L]);
for (let i = 0; i < 8; i++) {
  const u = randomUUID();
  await pool.query("insert into public.dream_exam_units values ($1, $2, $3)", [u, EL, L]);
  await as("service_role", null, "insert into public.dream_unit_content(unit_id, exam_id, student_id, status) values ($1, $2, $3, 'generating')", [u, EL, L]);
}
assert.deepEqual(await quota(L), { ok: true, used: 8, cap: 6, unlimited: true });
checks++;

// 5. Simulacros: 2 por examen y día (los de ayer no cuentan).
await pool.query("insert into public.dream_exam_sessions(exam_id, owner_id, mode, started_at) values ($1, $2, 'exam', now() - interval '2 days'), ($1, $2, 'practice', now())", [EA, A]);
assert.equal((await quota(A, "mock", EA)).used, 0);
await pool.query("insert into public.dream_exam_sessions(exam_id, owner_id, mode) values ($1, $2, 'exam'), ($1, $2, 'exam')", [EA, A]);
assert.deepEqual(await quota(A, "mock", EA), { ok: false, used: 2, cap: 2, unlimited: false });
assert.equal((await quota(A, "mock", randomUUID())).used, 0);
await assert.rejects(as("service_role", null, "select public.dream_study_quota($1, 'otra')", [A]), /invalid_quota/);
checks++;

// 6. Topes de tarjetas (por examen) y repaso único por review_id.
await pool.query("update dream_private.study_limits set cards_per_exam = 10");
for (let i = 2; i <= 10; i++)
  await as("service_role", null, "insert into public.dream_cards(student_id, exam_id, front, back, origin) values ($1, $2, $3, 'b', 'own')", [A, EA, `f${i}`]);
await assert.rejects(as("service_role", null, "insert into public.dream_cards(student_id, exam_id, front, back, origin) values ($1, $2, 'f11', 'b', 'own')", [A, EA]), /cards_per_exam/);
await assert.rejects(as("service_role", null, "insert into public.dream_cards(student_id, exam_id, front, back, origin) values ($1, $2, $3, 'b', 'own')", [B, EB, "x".repeat(301)]), /check constraint/);
const dup = (await pool.query("select review_id, card_id from public.dream_card_reviews where student_id = $1", [A])).rows[0];
await assert.rejects(as("service_role", null, "insert into public.dream_card_reviews(review_id, card_id, student_id, rating, reviewed_at) values ($1, $2, $3, 4, now())", [dup.review_id, dup.card_id, A]), /duplicate key/);
checks++;

// 7. Borrar la cuenta lo borra todo; lo del otro alumno sigue.
await pool.query("delete from auth.users where id = $1", [A]);
for (const t of tables) {
  assert.equal((await pool.query(`select count(*)::int as n from public.${t} where student_id = $1`, [A])).rows[0].n, 0, t);
  assert.ok((await pool.query(`select count(*)::int as n from public.${t} where student_id = $1`, [B])).rows[0].n >= 1, t);
}
checks++;

await pool.end();
await admin.query("drop database dream_study_test with (force)");
await admin.end();
console.log(`study-integration: ${checks} bloques de comprobaciones OK`);
