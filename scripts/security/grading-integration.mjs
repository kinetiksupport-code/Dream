import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isolatedPool } from "./db.mjs";
const pool = isolatedPool();
try {
  const owner = randomUUID(),
    stranger = randomUUID(),
    testId = randomUUID(),
    q1 = randomUUID(),
    q2 = randomUUID();
  await pool.query(
    "insert into dream_tests values($1,$2,'Math','Equations','ready')",
    [testId, owner],
  );
  await pool.query(
    "insert into dream_test_questions(id,test_id,expected_concepts) values($1,$3,'[\"factor\"]'),($2,$3,'[\"factor\"]')",
    [q1, q2, testId],
  );
  const items = [
    { question_id: q1, answer: "2", is_correct: true, feedback: "Bien" },
    { question_id: q2, answer: "3", is_correct: false, feedback: "Revisa" },
  ];
  await assert.rejects(
    pool.query("select dream_test_commit($1,$2,$3)", [
      stranger,
      testId,
      JSON.stringify(items),
    ]),
  );
  await assert.rejects(
    pool.query("select dream_test_commit($1,$2,$3)", [
      owner,
      testId,
      JSON.stringify([{ ...items[0], question_id: randomUUID() }, items[1]]),
    ]),
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "select count(*) from dream_test_attempts where test_id=$1",
          [testId],
        )
      ).rows[0].count,
    ),
    0,
  );
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      pool.query("select dream_test_commit($1,$2,$3)", [
        owner,
        testId,
        JSON.stringify(items),
      ]),
    ),
  );
  if (!attempts.some((a) => a.status === "fulfilled"))
    console.log(attempts[0].reason.message);
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  assert.equal(
    Number(
      (
        await pool.query(
          "select count(*) from dream_test_attempts where test_id=$1",
          [testId],
        )
      ).rows[0].count,
    ),
    1,
  );
  const result = (
    await pool.query(
      "select evidence_count,correct_count from dream_learning_topics where student_id=$1",
      [owner],
    )
  ).rows[0];
  assert.equal(result.evidence_count, 2);
  assert.equal(result.correct_count, 1);
  console.log(
    "PASS atomic grading: wrong owner rejected, invalid question rolls back attempt, 10 concurrent commits produce exactly 1 attempt, 2 evidence/1 correct",
  );
  // Synthetic fixtures remain only in disposable local database; no production data touched.
} finally {
  await pool.end();
}
