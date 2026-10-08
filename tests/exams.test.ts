import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, preparation } from "../lib/exam-plans";
import {
  examFields,
  ExamError,
  id,
} from "../supabase/functions/dream-api/validation";
const fields = {
  title: "Álgebra",
  subject: "Matemáticas",
  exam_date: "2026-10-20",
  topics: ["Ecuaciones"],
  difficulties: "Signos",
  goal: "Comprender",
  daily_minutes: 20,
};
test("calendar countdown ignores the hour and rejects rolled over dates", () => {
  assert.equal(daysUntil("2026-10-20", new Date(2026, 9, 8, 23, 59)), 12);
  assert.equal(daysUntil("2026-03-30", new Date(2026, 2, 28, 12)), 2);
  assert.equal(daysUntil("2026-02-30"), null);
  assert.equal(daysUntil("2026-10-08", new Date(2026, 9, 8)), 0);
});
test("preparation counts completed units without inventing mastery", () => {
  assert.deepEqual(preparation({ units: [] }), {
    completed: 0,
    total: 0,
    percentage: 0,
  });
  assert.deepEqual(
    preparation({
      units: [
        { status: "completed" },
        { status: "in_progress" },
        { status: "pending" },
      ],
    }),
    { completed: 1, total: 3, percentage: 33 },
  );
});
test("server rejects invalid dates, unbounded subjects/topics and daily limits", () => {
  assert.deepEqual(examFields(fields), fields);
  for (const patch of [
    { exam_date: "2026-02-30" },
    { daily_minutes: 0 },
    { daily_minutes: 20.5 },
    { subject: "" },
    { topics: [""] },
    { topics: Array(31).fill("tema") },
    { difficulties: "x".repeat(4001) },
  ])
    assert.throws(() => examFields({ ...fields, ...patch }), ExamError);
  assert.throws(() => id("not-an-id"), ExamError);
  assert.equal(
    id("12345678-1234-1234-1234-123456789abc"),
    "12345678-1234-1234-1234-123456789abc",
  );
});
