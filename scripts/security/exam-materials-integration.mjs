// Tope de 20 materiales por examen (migración 20261018160000) en un PostgreSQL
// local de usar y tirar (DREAM_TEST_DATABASE_URL, solo localhost).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isolatedPool } from "./db.mjs";

const pool = isolatedPool();
await pool.query(`
  drop function if exists public.dream_exam_link_material(uuid,uuid,uuid);
  drop table if exists public.dream_exam_materials, public.dream_attachments, public.dream_exams cascade;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create table public.dream_exams(id uuid primary key, owner_id uuid not null, status text not null, conversation_id uuid);
  create table public.dream_attachments(id uuid primary key, owner_id uuid not null, conversation_id uuid, status text not null);
  create table public.dream_exam_materials(exam_id uuid not null, owner_id uuid not null, attachment_id uuid not null, created_at timestamptz default now(), primary key(exam_id, attachment_id));
`);
// La función original (ya aplicada) y después la nueva.
const original = readFileSync(
  new URL(
    "../../supabase/migrations/20261008163525_exam_generation_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
await pool.query(
  original.slice(
    original.indexOf("create function public.dream_exam_link_material"),
  ),
);
await pool.query(
  readFileSync(
    new URL(
      "../../supabase/migrations/20261018160000_exam_materials_limit.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

const owner = randomUUID(),
  exam = randomUUID(),
  conversation = randomUUID();
await pool.query("insert into public.dream_exams values ($1,$2,'draft',$3)", [
  exam,
  owner,
  conversation,
]);
const link = async (attachment) => {
  try {
    await pool.query("select public.dream_exam_link_material($1,$2,$3)", [
      exam,
      owner,
      attachment,
    ]);
    return "ok";
  } catch (error) {
    return error.message;
  }
};
const files = [];
for (let i = 0; i < 21; i++) {
  const id = randomUUID();
  files.push(id);
  await pool.query(
    "insert into public.dream_attachments values ($1,$2,$3,'processed')",
    [id, owner, conversation],
  );
}
for (let i = 0; i < 20; i++)
  assert.equal(await link(files[i]), "ok", `material ${i + 1}`);
assert.equal(await link(files[20]), "Maximum twenty materials");
assert.equal(
  await link(files[3]),
  "ok",
  "volver a asociar uno ya incluido no cuenta",
);
const n = (
  await pool.query(
    "select count(*)::int as n from public.dream_exam_materials where exam_id=$1",
    [exam],
  )
).rows[0].n;
assert.equal(n, 20);
const grants = (
  await pool.query(
    "select has_function_privilege('authenticated','public.dream_exam_link_material(uuid,uuid,uuid)','execute') as a, has_function_privilege('service_role','public.dream_exam_link_material(uuid,uuid,uuid)','execute') as s",
  )
).rows[0];
assert.deepEqual(grants, { a: false, s: true });
await pool.end();
console.log("exam materials (20): OK");
