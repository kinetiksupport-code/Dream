// Prueba la migración de sesiones de subida por QR en un PostgreSQL local de
// usar y tirar (DREAM_TEST_DATABASE_URL, solo localhost). Nunca toca Supabase.
//   DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55511/postgres \
//     node scripts/security/upload-sessions-integration.mjs
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isolatedPool } from "./db.mjs";

const pool = isolatedPool();
const hex = (value) => createHash("sha256").update(value).digest("hex");
const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
const rpc = async (name, args) =>
  (
    await one(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as r`,
      args,
    )
  ).r;

// Esquema mínimo que la migración necesita (solo en la base aislada).
await pool.query(`
  do $$ declare f regprocedure; begin
    for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'dream_upload_%' loop
      execute 'drop function ' || f;
    end loop;
  end $$;
  drop schema if exists dream_private cascade;
  drop table if exists public.dream_attachments, public.dream_exams cascade;
  drop schema if exists auth cascade;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key);
  create table public.dream_exams(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade, status text not null);
  create table public.dream_attachments(id uuid primary key default gen_random_uuid());
  create schema dream_private;
  create table dream_private.counters(scope text not null, bucket timestamptz not null, requests bigint not null default 0, primary key(scope, bucket));
`);
await pool.query(
  readFileSync(
    new URL("../../supabase/migrations/20261018153000_upload_sessions.sql", import.meta.url),
    "utf8",
  ),
);

const owner = randomUUID();
const other = randomUUID();
const exam = randomUUID();
const otherExam = randomUUID();
await pool.query("insert into auth.users values ($1), ($2)", [owner, other]);
await pool.query("insert into public.dream_exams values ($1, $2, 'draft'), ($3, $4, 'draft')", [exam, owner, otherExam, other]);
const limits = {
  ip_per_minute: 30,
  ip_failures_per_hour: 5,
  session_attempts: 200,
  max_uploads: 3,
  max_bytes: 1000,
  max_in_flight: 2,
};
const ip = hex("ip:203.0.113.7");
const phone = hex("device-a");
const gate = (token, kind, device = phone, bytes = null, name = null, address = ip) =>
  rpc("dream_upload_qr_gate", [hex(token), address, device, kind, name, bytes, limits]);

// Privado: anon y authenticated no pueden leer las tablas ni ejecutar las funciones.
for (const role of ["anon", "authenticated"]) {
  const r = await one(
    `select has_table_privilege($1, 'dream_private.upload_sessions', 'select') as t,
            has_function_privilege($1, 'public.dream_upload_qr_gate(text,text,text,text,text,bigint,jsonb)', 'execute') as f,
            has_function_privilege($1, 'public.dream_upload_session_status(uuid,uuid)', 'execute') as s`,
    [role],
  );
  assert.deepEqual(r, { t: false, f: false, s: false }, role);
}
const rls = await one(
  "select bool_and(relrowsecurity) as on from pg_class where oid in ('dream_private.upload_sessions'::regclass, 'dream_private.upload_session_files'::regclass)",
);
assert.equal(rls.on, true);

// Crear: solo exámenes propios en borrador.
assert.equal((await rpc("dream_upload_session_create", [owner, otherExam, hex("x"), 600, 30])).status, 409);
const created = await rpc("dream_upload_session_create", [owner, exam, hex("token-1"), 600, 30]);
assert.equal(created.ok, true);
const session = created.session_id;
const stored = await one("select token_hash, state from dream_private.upload_sessions where id = $1", [session]);
assert.equal(stored.token_hash, hex("token-1"));
assert.equal(stored.state, "open");

// Estado inicial para el ordenador: sin hashes.
let status = await rpc("dream_upload_session_status", [owner, session]);
assert.equal(status.state, "open");
assert.equal(status.connected, false);
assert.equal(JSON.stringify(status).includes(hex("token-1")), false);
assert.equal((await rpc("dream_upload_session_status", [other, session])).status, 404);

// Subir sin conectar: inválido. Token inventado: inválido con el mismo código.
const bogus = await gate("token-otro", "connect");
assert.deepEqual(bogus, { ok: false, status: 404, code: "upload_link_invalid" });
assert.deepEqual(await gate("token-1", "upload", phone, 10, "a.pdf"), bogus);

// Conectar ata el primer móvil; un segundo móvil recibe lo mismo que un token falso.
const connected = await gate("token-1", "connect");
assert.equal(connected.ok, true);
assert.equal(connected.max_uploads, 3);
assert.equal((await gate("token-1", "connect")).ok, true, "reconexión del mismo móvil");
assert.deepEqual(await gate("token-1", "connect", hex("device-b")), bogus);
status = await rpc("dream_upload_session_status", [owner, session]);
assert.equal(status.state, "connected");
assert.equal(status.connected, true);

// Subidas: reserva hueco, crea la fila en processing y la cierra.
const first = await gate("token-1", "upload", phone, 400, "tema1.pdf");
assert.equal(first.ok, true);
assert.equal(first.owner_id, owner);
assert.equal(first.exam_id, exam);
assert.equal(first.uploads, 1);
status = await rpc("dream_upload_session_status", [owner, session]);
assert.equal(status.files[0].status, "processing");
assert.equal(status.files[0].file_name, "tema1.pdf");
const attachment = (await one("insert into public.dream_attachments default values returning id")).id;
assert.equal((await rpc("dream_upload_qr_finish", [first.file_id, attachment])).uploads, 1);
// Repetir el cierre no cambia nada.
assert.equal((await rpc("dream_upload_qr_finish", [first.file_id, null])).ok, false);
status = await rpc("dream_upload_session_status", [owner, session]);
assert.equal(status.files[0].status, "processed");
assert.equal(status.files[0].attachment_id, attachment);

// Un fallo libera el hueco pero los bytes siguen contando.
const failed = await gate("token-1", "upload", phone, 400, "roto.pdf");
assert.equal(failed.uploads, 2);
assert.equal((await rpc("dream_upload_qr_finish", [failed.file_id, null])).uploads, 1);
assert.deepEqual(await gate("token-1", "upload", phone, 400, "grande.pdf"), { ok: false, status: 409, code: "upload_quota" });

// En curso: como mucho dos a la vez.
const a = await gate("token-1", "upload", phone, 50, "a.png");
const b = await gate("token-1", "upload", phone, 50, "b.png");
assert.equal(a.ok && b.ok, true);
assert.equal((await gate("token-1", "upload", phone, 50, "c.png")).code, "upload_quota", "tope de 3 subidas");
await rpc("dream_upload_qr_finish", [a.file_id, null]);
const c = await gate("token-1", "upload", phone, 50, "c.png");
assert.equal(c.ok, true, "el fallo liberó un hueco");
// b y c siguen en curso: un tercero a la vez espera aunque quede cupo.
const roomy = { ...limits, max_uploads: 10 };
assert.equal(
  (await rpc("dream_upload_qr_gate", [hex("token-1"), ip, phone, "upload", "d.png", 50, roomy])).code,
  "upload_busy",
);

// Renovar alarga; con la vida máxima agotada no pasa de created_at + máximo.
const before = Date.parse(status.expires_at);
const renewed = await rpc("dream_upload_session_renew", [owner, session, 600, 3600]);
assert.equal(renewed.ok, true);
assert.ok(Date.parse(renewed.expires_at) >= before);
const capped = await rpc("dream_upload_session_renew", [owner, session, 1800, 60]);
assert.ok(Date.parse(capped.expires_at) - (await one("select created_at from dream_private.upload_sessions where id = $1", [session])).created_at.getTime() <= 60_000);
assert.equal((await rpc("dream_upload_session_renew", [other, session, 600, 3600])).status, 410);

// Caducado: inválido para el móvil, «expired» para el ordenador, no renovable.
await pool.query("update dream_private.upload_sessions set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute' where id = $1", [session]);
assert.deepEqual(await gate("token-1", "connect"), bogus);
assert.equal((await rpc("dream_upload_session_status", [owner, session])).state, "expired");
assert.equal((await rpc("dream_upload_session_renew", [owner, session, 600, 3600])).status, 410);

// Una sesión nueva cierra la anterior; cerrar invalida el token al momento.
const second = await rpc("dream_upload_session_create", [owner, exam, hex("token-2"), 600, 30]);
const third = await rpc("dream_upload_session_create", [owner, exam, hex("token-3"), 600, 30]);
assert.equal((await rpc("dream_upload_session_status", [owner, second.session_id])).state, "closed");
assert.equal((await gate("token-3", "connect", hex("device-c"), null, null, hex("ip:otra"))).ok, true);
await rpc("dream_upload_session_close", [owner, third.session_id]);
assert.deepEqual(await gate("token-3", "connect", hex("device-c"), null, null, hex("ip:otra")), bogus);

// El examen deja de ser borrador: el enlace deja de valer.
const fourth = await rpc("dream_upload_session_create", [owner, exam, hex("token-4"), 600, 30]);
await pool.query("update public.dream_exams set status = 'ready' where id = $1", [exam]);
assert.deepEqual(await gate("token-4", "connect", hex("device-d"), null, null, hex("ip:cuarta")), bogus);
assert.equal((await rpc("dream_upload_session_renew", [owner, fourth.session_id, 600, 3600])).status, 410);
await pool.query("update public.dream_exams set status = 'draft' where id = $1", [exam]);

// Límite por IP: tras 5 fallos en la hora, 429 aunque el token sea bueno.
const attacker = hex("ip:198.51.100.1");
for (let i = 0; i < 5; i++) assert.equal((await gate(`falso-${i}`, "connect", phone, null, null, attacker)).status, 404);
await rpc("dream_upload_session_create", [owner, exam, hex("token-5"), 600, 30]);
assert.equal((await gate("token-5", "connect", phone, null, null, attacker)).status, 429);
// Límite por minuto e IP.
const busy = hex("ip:192.0.2.9");
let last;
for (let i = 0; i < 31; i++) last = await gate(`x-${i}`, i === 30 ? "connect" : "connect", phone, null, null, busy);
assert.equal(last.status, 429);

// Límite de creación por hora para el dueño.
for (let i = 0; i < 40; i++) last = await rpc("dream_upload_session_create", [other, otherExam, hex(`c-${i}`), 600, 30]);
assert.equal(last.status, 429);

// Borrar la cuenta borra sus sesiones y archivos.
await pool.query("delete from auth.users where id = $1", [owner]);
assert.equal(Number((await one("select count(*) as n from dream_private.upload_sessions where owner_id = $1", [owner])).n), 0);
assert.equal(Number((await one("select count(*) as n from dream_private.upload_session_files where owner_id = $1", [owner])).n), 0);

await pool.end();
console.log("upload sessions: OK");
