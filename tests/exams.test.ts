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

test("history: countdown text, status stickers and grouping (§4)", async () => {
  const { countdownText, groupExams, STATUS_STICKER, examTitle } = await import(
    "../lib/exam-plans"
  );
  const now = new Date(2026, 9, 17, 10);
  assert.equal(countdownText("2026-10-29", now), "Faltan 12 días");
  assert.equal(countdownText("2026-10-18", now), "Es mañana");
  assert.equal(countdownText("2026-10-17", now), "Es hoy");
  assert.equal(countdownText("2026-10-16", now), "Fue ayer");
  assert.equal(countdownText("2026-10-11", now), "Pasó hace 6 días");
  assert.equal(countdownText(null, now), "Sin fecha");
  assert.equal(countdownText("2026-02-30", now), "Sin fecha");
  // Colour and words for every status.
  assert.deepEqual(
    Object.fromEntries(Object.entries(STATUS_STICKER).map(([k, v]) => [k, v.label])),
    {
      draft: "Sin terminar",
      preparing: "Preparando",
      ready: "Listo",
      failed: "Algo falló",
      completed: "Hecho",
    },
  );
  const e = (id: string, exam_date: string | null, status = "ready") => ({ id, exam_date, status });
  const { upcoming, previous } = groupExams(
    [
      e("far", "2026-11-30"),
      e("draft", null, "draft"),
      e("past", "2026-10-01"),
      e("soon", "2026-10-19"),
      e("done", "2026-10-25", "completed"),
      e("recent", "2026-10-15"),
    ],
    now,
  );
  assert.deepEqual(upcoming.map((x) => x.id), ["soon", "far", "draft"]);
  assert.deepEqual(previous.map((x) => x.id), ["done", "recent", "past"]);
  assert.equal(examTitle({ title: "  " }), "Examen sin nombre");
});

test("materials per exam: client limit matches the latest migration (20)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { MAX_EXAM_MATERIALS } = await import("../lib/exam-plans");
  const latest = readdirSync("supabase/migrations")
    .filter((f) =>
      readFileSync(`supabase/migrations/${f}`, "utf8").includes(
        "function public.dream_exam_link_material",
      ),
    )
    .sort()
    .at(-1)!;
  const sql = readFileSync(`supabase/migrations/${latest}`, "utf8");
  const limit = Number(
    sql.match(
      /count\(\*\) from public\.dream_exam_materials where exam_id=p_exam\)>=(\d+)/,
    )?.[1],
  );
  assert.equal(MAX_EXAM_MATERIALS, 20);
  assert.equal(limit, MAX_EXAM_MATERIALS, latest);
});
