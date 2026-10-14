import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isolatedPool, rpcAdapter } from "./db.mjs";
import { createAdmission } from "../../supabase/functions/dream-api/admission.mjs";
const pool = isolatedPool(),
  db = rpcAdapter(pool);
await pool.query(
  readFileSync(
    new URL("../../supabase/migrations/20261010120000_admission_pricing_reconcile.sql", import.meta.url),
    "utf8",
  ),
);
async function reset(extra = "") {
  await pool.query(
    "truncate dream_private.counters,dream_private.leases,dream_private.provider_state,dream_private.attempts,dream_private.usage_audit,dream_private.user_blocks",
  );
  await pool.query(
    `update dream_private.limits set enabled=true,rpm=100,daily=100,exams_daily=5,searches_daily=2,global_concurrency=8,user_concurrency=1,user_tokens=500000,global_tokens=2000000,user_microusd=1000000,global_microusd=10000000,token_microusd=1,search_microusd=1000,tavily_credit_microusd=8000,tavily_basic_credits=1`,
  );
  if (extra)
    await pool.query(`update dream_private.limits set ${extra.slice(1)}`);
}
try {
  await reset();
  const results = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const a = createAdmission(db, randomUUID(), randomUUID());
      try {
        await a.admit("chat");
        return a;
      } catch (e) {
        assert.equal(e.status, 429);
        return null;
      }
    }),
  );
  assert.ok(
    results.filter(Boolean).length > 0 && results.filter(Boolean).length <= 8,
  );
  console.log(
    "PASS 50 concurrent atomic admissions: at most 8 accepted, contention/capacity rejected with 429",
  );
  for (const a of results.filter(Boolean)) await a.release();
  await reset();
  const full = [];
  for (let n = 0; n < 8; n++) {
    const slot = createAdmission(db, randomUUID(), randomUUID());
    await slot.admit("chat");
    full.push(slot);
  }
  await assert.rejects(
    createAdmission(db, randomUUID(), randomUUID()).admit("chat"),
    (e) => e.code === "dream_concurrency",
  );
  for (const slot of full) await slot.release();
  console.log("PASS exact 8-slot capacity; ninth request rejected");
  await reset();
  const owner = randomUUID(),
    req = randomUUID(),
    a = createAdmission(db, owner, req);
  await a.admit("chat");
  await assert.rejects(a.admit("chat"), (e) => e.status === 409);
  await a.beforeAttempt("groq", {
    messages: [{ content: "synthetic" }],
    max_tokens: 10,
  });
  await a.release();
  await assert.rejects(a.beforeAttempt("groq", {}), (e) => e.status === 503);
  await assert.rejects(a.admit("chat"), (e) => e.status === 409);
  console.log(
    "PASS duplicate rejection, lease release, finished request tombstone",
  );
  await reset(",global_tokens=25");
  const b = createAdmission(db, randomUUID(), randomUUID());
  await b.admit("chat");
  await assert.rejects(
    b.beforeAttempt("groq", {
      messages: [{ content: "synthetic" }],
      max_tokens: 100,
    }),
    (e) => e.status === 429,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "select tokens from dream_private.counters where scope='global'",
        )
      ).rows[0].tokens,
    ),
    0,
  );
  console.log("PASS budget rejected atomically, no partial debit");
  await reset();
  const c = createAdmission(db, randomUUID(), randomUUID());
  await c.admit("chat");
  await c.pause("groq", 120);
  const other = createAdmission(db, randomUUID(), randomUUID());
  await other.admit("chat");
  await assert.rejects(
    other.beforeAttempt("groq", {}),
    (e) => e.status === 429 && e.retryAfter >= 119,
  );
  await other.beforeAttempt("tavily", {});
  await other.beforeAttempt("tavily", {});
  await assert.rejects(
    other.beforeAttempt("tavily", {}),
    (e) => e.status === 429,
  );
  console.log(
    "PASS cross-instance provider pause, independent provider, search quota",
  );
  await reset(",rpm=1");
  const d = createAdmission(db, randomUUID(), randomUUID());
  await d.admit("chat");
  await d.release();
  await assert.rejects(
    createAdmission(db, dummyOwner(), randomUUID()).admit("invalid"),
    (e) => e.status === 503,
  );
  console.log("PASS invalid operations fail closed");
  const oneOwner = randomUUID();
  await reset(",rpm=1");
  const minute = createAdmission(db, oneOwner, randomUUID());
  await minute.admit("chat");
  await minute.release();
  await assert.rejects(
    createAdmission(db, oneOwner, randomUUID()).admit("chat"),
    (e) => e.code === "dream_rpm",
  );
  await reset(",daily=1");
  const day = createAdmission(db, oneOwner, randomUUID());
  await day.admit("chat");
  await day.release();
  await assert.rejects(
    createAdmission(db, oneOwner, randomUUID()).admit("chat"),
    (e) => e.code === "dream_daily",
  );
  await reset(",exams_daily=1");
  const exam = createAdmission(db, oneOwner, randomUUID());
  await exam.admit("exam_prepare");
  await exam.release();
  await assert.rejects(
    createAdmission(db, oneOwner, randomUUID()).admit("test_generate"),
    (e) => e.code === "dream_daily",
  );
  await reset(",global_microusd=1");
  const money = createAdmission(db, oneOwner, randomUUID());
  await money.admit("chat");
  await assert.rejects(
    money.beforeAttempt("groq", {
      messages: [{ content: "sintético" }],
      max_tokens: 10,
    }),
    (e) => e.code === "dream_budget",
  );
  console.log("PASS minute/day/exam quotas and global monetary ceiling");
  const client = await pool.connect();
  await client.query("set role authenticated");
  await assert.rejects(client.query("select * from dream_private.limits"));
  await assert.rejects(
    client.query("select public.dream_admit($1,$2,$3)", [
      randomUUID(),
      randomUUID(),
      "chat",
    ]),
  );
  await assert.rejects(
    client.query("update public.dream_profiles set role='teacher'"),
  );
  await client.query("reset role");
  client.release();
  console.log(
    "PASS authenticated cannot read limits, invoke quota RPC or edit protected profile role",
  );
  await reset(",enabled=false");
  await assert.rejects(
    createAdmission(db, randomUUID(), randomUUID()).admit("chat"),
    (e) => e.status === 503,
  );
  console.log("PASS global kill switch");
  await reset(",rpm=1");
  const userA = randomUUID();
  const userB = randomUUID();
  const first = createAdmission(db, userA, randomUUID());
  await first.admit("chat");
  await first.release();
  await assert.rejects(
    createAdmission(db, userA, randomUUID()).admit("chat"),
    (e) => e.code === "dream_rpm",
  );
  await createAdmission(db, userB, randomUUID()).admit("chat");
  console.log("PASS independent per-user quotas");
  await reset();
  const priced = createAdmission(db, randomUUID(), randomUUID());
  await priced.admit("chat");
  const reserved = await priced.beforeAttempt("groq", {
    model: "qwen/qwen3.8-27b",
    messages: [{ content: "hola" }],
    max_tokens: 10,
  });
  const before = Number(
    (await pool.query("select microusd from dream_private.counters where scope='global'")).rows[0].microusd,
  );
  await reserved.reconcile({ prompt_tokens: 1, completion_tokens: 1 });
  const after = Number(
    (await pool.query("select microusd from dream_private.counters where scope='global'")).rows[0].microusd,
  );
  assert.ok(after < before);
  await reserved.reconcile({ prompt_tokens: 1, completion_tokens: 1 });
  assert.equal(
    Number((await pool.query("select count(*) from dream_private.usage_audit where event='reconciled'")).rows[0].count),
    1,
  );
  console.log("PASS reconciliation refunds once and is idempotent");
  await assert.rejects(
    priced.beforeAttempt("groq", { model: "missing-model", messages: [{ content: "x" }], max_tokens: 1 }),
    (e) => e.code === "model_unpriced",
  );
  console.log("PASS unpriced model fails closed");
  for (const operation of [
    "chat", "attachment_upload", "test_generate", "test_check_answer",
    "test_submit", "exam_prepare", "exam_session_create", "exam_session_submit",
  ]) {
    await reset();
    await createAdmission(db, randomUUID(), randomUUID()).admit(operation);
  }
  console.log("PASS all eight protected operations admit");
} finally {
  await pool.end();
}
function dummyOwner() {
  return randomUUID();
}
