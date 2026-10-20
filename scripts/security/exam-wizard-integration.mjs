// Migración 20261018170000_exam_wizard.sql en un PostgreSQL local de usar y
// tirar (DREAM_TEST_DATABASE_URL, solo localhost). Aplica las migraciones
// reales de exámenes y de admisión sobre unos mínimos de Supabase y
// comprueba el borrador vacío, las restricciones nuevas y dream_admit.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isolatedPool } from "./db.mjs";

const migration = (name) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const pool = isolatedPool();
await pool.query(`
  drop schema if exists dream_private cascade;
  do $$ declare f record; begin
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'dream\_%' loop
      execute 'drop function ' || f.sig || ' cascade';
    end loop;
  end $$;
  drop table if exists public.dream_exam_sessions, public.dream_exam_units, public.dream_exam_materials, public.dream_exams, public.dream_test_answers, public.dream_test_attempts, public.dream_test_questions, public.dream_tests, public.dream_learning_topics, public.dream_learning_events, public.dream_profiles, public.dream_attachments, public.dream_conversations cascade;
  drop schema if exists auth cascade;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create table public.dream_conversations(id uuid primary key, owner_id uuid);
  create table public.dream_attachments(id uuid primary key, owner_id uuid not null, conversation_id uuid, status text not null default 'processed');
  create table public.dream_tests(id uuid primary key, owner_id uuid, subject text, topic text, status text);
  create table public.dream_test_questions(id uuid primary key, test_id uuid, position int, type text, prompt text, options jsonb, metadata jsonb, correct_answer jsonb, expected_concepts text[]);
  create table public.dream_test_attempts(id uuid primary key default gen_random_uuid(), test_id uuid, student_id uuid, status text, score int, total int, completed_at timestamptz);
  create table public.dream_test_answers(id uuid primary key default gen_random_uuid(), attempt_id uuid, question_id uuid, student_id uuid, answer jsonb, is_correct boolean, feedback text);
  create table public.dream_learning_topics(student_id uuid, subject text, topic text, concept text, status text, evidence_count int, correct_count int, last_evidence_at timestamptz, updated_at timestamptz, primary key(student_id, subject, topic, concept));
  create table public.dream_learning_events(student_id uuid, test_attempt_id uuid, subject text, topic text, concept text, outcome text, evidence text);
  create table public.dream_profiles(id uuid primary key, display_name text, avatar_url text, academic_level text, pref_step_by_step boolean, pref_practice_suggestions boolean, pref_calm_tone boolean);
`);
for (const name of [
  "20261008161950_persistent_exams.sql",
  "20261008192123_security_admission.sql",
  "20261010120000_admission_pricing_reconcile.sql",
  "20261018170000_exam_wizard.sql",
])
  await pool.query(migration(name));

const owner = randomUUID();
await pool.query("insert into auth.users values ($1)", [owner]);
const insert = (fields) =>
  pool.query(
    `insert into public.dream_exams(id, owner_id, title, subject, exam_date, status, target_grade, wizard_step)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), owner, fields.title ?? "", fields.subject ?? "", fields.exam_date ?? null, fields.status ?? "draft", fields.target_grade ?? null, fields.wizard_step ?? null],
  );
const fails = async (fields, constraint) => {
  await assert.rejects(() => insert(fields), (e) => e.constraint === constraint || new RegExp(constraint).test(e.message), constraint);
};

// 1. Empty draft: no name, subject or date.
await insert({ wizard_step: "upload" });
// 2. Anything but a draft needs them.
await fails({ status: "preparing", subject: "Historia", exam_date: "2026-11-02" }, "dream_exams_title_check");
await fails({ status: "ready", title: "Álgebra", subject: "  ", exam_date: "2026-11-02" }, "dream_exams_subject_check");
await fails({ status: "failed", title: "Álgebra", subject: "Matemáticas" }, "dream_exams_date_when_planned");
await insert({ status: "ready", title: "Álgebra", subject: "Matemáticas", exam_date: "2026-11-02" });
// 3. Grade 0–10 in 0,5 steps; known wizard steps.
await insert({ target_grade: 8.5 });
await insert({ target_grade: 0 });
await insert({ target_grade: 10 });
await fails({ target_grade: 8.3 }, "dream_exams_target_grade_check");
await fails({ target_grade: 10.5 }, "dream_exams_target_grade_check");
await fails({ wizard_step: "listo" }, "dream_exams_wizard_step_check");
// few_notes_ack defaults to false and daily_minutes keeps its default.
const row = (await pool.query("select few_notes_ack, daily_minutes from public.dream_exams limit 1")).rows[0];
assert.deepEqual(row, { few_notes_ack: false, daily_minutes: 20 });

// 4. dream_admit accepts the new operation (and exam_route_regenerate).
for (const op of ["exam_identify", "exam_route_regenerate", "exam_prepare"]) {
  try {
    await pool.query("select public.dream_admit($1, $2, $3)", [owner, randomUUID(), op]);
  } catch (e) {
    assert.doesNotMatch(String(e.message), /invalid_admission/, op);
  }
}
await assert.rejects(
  () => pool.query("select public.dream_admit($1, $2, 'unknown_op')", [owner, randomUUID()]),
  /invalid_admission/,
);
await pool.end();
console.log("exam wizard migration: ok");
