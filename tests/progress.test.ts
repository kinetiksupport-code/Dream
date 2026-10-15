import { test } from "node:test";
import assert from "node:assert/strict";
import type { DreamExam, ExamSession, ExamUnit } from "../lib/exam-plans";
import {
  buildProgress,
  completedSessionIds,
  DEFAULT_TARGET,
  forecastFor,
  gapsFor,
  pickDefaultExam,
  readinessOf,
  summarizeTests,
  toPracticeResult,
  topicProgress,
  weeklyHistory,
  weeklyPlan,
  rhythmFor,
  type PracticeResult,
} from "../lib/progress";

// Thursday 15 October 2026, local time.
const now = new Date(2026, 9, 15, 12);
const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month - 1, day, hour).toISOString();

function unit(
  i: number,
  topic: string,
  patch: Partial<ExamUnit> = {},
): ExamUnit {
  return {
    id: `u${i}`,
    position: i,
    title: `Unidad ${i}`,
    topic,
    summary: "",
    estimated_minutes: 20,
    status: "pending",
    conversation_id: null,
    completed_at: null,
    ...patch,
  };
}
function exam(patch: Partial<DreamExam> = {}): DreamExam {
  return {
    id: "e1",
    title: "Álgebra",
    subject: "Matemáticas",
    exam_date: "2026-10-29",
    topics: [],
    difficulties: "",
    goal: "",
    daily_minutes: 20,
    status: "ready",
    conversation_id: null,
    plan_error: null,
    units: [],
    materials: [],
    sessions: [],
    ...patch,
  };
}
function result(
  sessionId: string,
  percentage: number,
  patch: Partial<PracticeResult> = {},
): PracticeResult {
  return {
    sessionId,
    kind: patch.unitId ? "tema" : "simulacro",
    unitId: null,
    date: at(10, 14),
    percentage,
    score: percentage / 10,
    total: 10,
    practice: [],
    mastered: [],
    ...patch,
  };
}

// Two topics, four units: topic A studied, topic B not started.
const twoTopics = () =>
  exam({
    topics: ["Ecuaciones", "Factorización"],
    units: [
      unit(0, "Ecuaciones de primer grado", {
        status: "completed",
        completed_at: at(10, 12),
      }),
      unit(1, "Ecuaciones de primer grado", {
        status: "completed",
        completed_at: at(10, 13),
      }),
      unit(2, "Factorización"),
      unit(3, "Factorización", { status: "in_progress" }),
    ],
  });

test("no data: nothing is invented and the forecast explains what is missing", () => {
  const e = exam({ topics: ["Derivadas", "Integrales"] });
  const p = buildProgress(e, [], now);
  assert.equal(p.target, DEFAULT_TARGET);
  assert.equal(p.readiness, 0);
  assert.equal(p.topicsInPlan, 0);
  assert.equal(p.topicsAtTarget, 0);
  assert.equal(p.activities, 0);
  assert.equal(p.daysLeft, 14);
  // Listed topics appear, but without a percentage: there is no plan yet.
  assert.deepEqual(
    p.topics.map((t) => [t.name, t.inPlan, t.mastery]),
    [
      ["Derivadas", false, null],
      ["Integrales", false, null],
    ],
  );
  assert.deepEqual(p.forecast, { status: "locked", activities: 0, missing: 2 });
  assert.deepEqual(p.gaps, { weak: [], untested: [], frequentErrors: [] });
  assert.deepEqual(p.tests, {
    results: [],
    average: null,
    best: null,
    last: null,
    change: null,
  });
  assert.deepEqual(p.plan, { status: "empty" });
  assert.equal(p.history.length, 6);
  assert.ok(p.history.every((w) => w.unitsCompleted === 0 && w.tests === 0));
});

test("one exam: mastery is half study and half practice", () => {
  const results = [
    result("s1", 90, { unitId: "u1", date: at(10, 13, 18) }),
    result("s2", 60, { date: at(10, 14) }),
  ];
  const p = buildProgress(twoTopics(), results, now);
  const [a, b] = p.topics;
  assert.equal(a.name, "Ecuaciones de primer grado");
  assert.deepEqual(
    [a.study, a.practice, a.practiceSource, a.mastery, a.atTarget],
    [100, 90, "tema", 95, true],
  );
  // No test about Factorización: the general simulation stands in for it.
  assert.deepEqual(
    [b.study, b.practice, b.practiceSource, b.mastery, b.atTarget],
    [0, 60, "simulacros", 30, false],
  );
  assert.equal(b.dependsOn, a.key);
  assert.equal(a.dependsOn, null);
  // Declared topics covered by a unit topic are not duplicated.
  assert.equal(p.topics.length, 2);
  assert.equal(p.readiness, 63);
  assert.equal(p.topicsInPlan, 2);
  assert.equal(p.topicsAtTarget, 1);
  assert.equal(p.activities, 4);
  assert.equal(p.tests.average, 75);
  assert.equal(p.tests.change, -30);
});

test("studying without tests never reaches the target", () => {
  const e = exam({
    units: [unit(0, "Tema", { status: "completed", completed_at: at(10, 1) })],
  });
  const [t] = topicProgress(e, [], DEFAULT_TARGET);
  assert.deepEqual(
    [t.study, t.practice, t.mastery, t.atTarget],
    [100, null, 50, false],
  );
  // Even with a low target, an untested topic is not "at target".
  const [low] = topicProgress(e, [], 40);
  assert.equal(low.atTarget, false);
});

test("topic practice uses the last three tests of that topic", () => {
  const e = exam({ units: [unit(0, "Tema")] });
  const results = [10, 50, 70, 90].map((pct, i) =>
    result(`s${i}`, pct, { unitId: "u0", date: at(10, 10 + i) }),
  );
  const [t] = topicProgress(e, results);
  assert.equal(t.practice, 70);
  assert.equal(t.topicTests, 4);
});

test("several exams: the closest upcoming exam with a plan is shown first", () => {
  const list = [
    exam({ id: "later", exam_date: "2026-12-01" }),
    exam({ id: "soon", exam_date: "2026-10-20" }),
    exam({ id: "draft", exam_date: "2026-10-16", status: "draft" }),
    exam({ id: "done", exam_date: "2026-10-17", status: "completed" }),
    exam({ id: "past", exam_date: "2026-09-01" }),
  ];
  assert.equal(pickDefaultExam(list, now)?.id, "soon");
  assert.equal(
    pickDefaultExam(
      [
        exam({ id: "old", exam_date: "2026-06-01" }),
        exam({ id: "recent", exam_date: "2026-10-01" }),
      ],
      now,
    )?.id,
    "recent",
  );
  assert.equal(
    pickDefaultExam([exam({ id: "d", status: "draft" })], now)?.id,
    "d",
  );
  assert.equal(pickDefaultExam([], now), null);
});

test("exam without a valid date: no countdown, forecast or weekly plan", () => {
  const e = { ...twoTopics(), exam_date: "" };
  const p = buildProgress(e, [], now);
  assert.equal(p.daysLeft, null);
  assert.deepEqual(p.forecast, { status: "no_date" });
  assert.deepEqual(p.plan, { status: "no_date" });
  assert.equal(p.rhythm.neededPerDay, null);
  assert.equal(p.readiness, 25);
});

test("past exam: final readiness instead of a forecast", () => {
  const e = { ...twoTopics(), exam_date: "2026-10-01" };
  const p = buildProgress(e, [result("s1", 80, { date: at(9, 30) })], now);
  assert.equal(p.daysLeft, -14);
  assert.deepEqual(p.forecast, { status: "past", readiness: p.readiness });
  assert.deepEqual(p.plan, { status: "past" });
});

test("forecast stays locked below two activities", () => {
  const e = exam({
    units: [
      unit(0, "Tema", { status: "completed", completed_at: at(10, 14) }),
      unit(1, "Tema"),
    ],
  });
  assert.deepEqual(forecastFor(e, [], now), {
    status: "locked",
    activities: 1,
    missing: 1,
  });
});

test("forecast with two activities: pace measured over at least 7 days", () => {
  const e = exam({
    units: [
      unit(0, "Tema", { status: "completed", completed_at: at(10, 13) }),
      unit(1, "Tema"),
    ],
  });
  const results = [result("s1", 80, { unitId: "u0", date: at(10, 14) })];
  // Readiness now: study 50 / 2 + practice 80 / 2 = 65, from 0 a week ago.
  const f = forecastFor(e, results, now);
  assert.equal(f.status, "ready");
  if (f.status !== "ready") return;
  assert.equal(f.readiness, 65);
  assert.equal(f.windowDays, 7);
  assert.equal(f.daysLeft, 14);
  assert.equal(f.dailyGain, 9.3);
  assert.equal(f.projected, 100);
  assert.equal(f.reachesTarget, true);
});

test("forecast uses the last 14 days and never projects a drop", () => {
  const e = exam({
    units: [
      unit(0, "Tema", { status: "completed", completed_at: at(9, 1) }),
      unit(1, "Tema", { status: "completed", completed_at: at(10, 10) }),
      unit(2, "Tema"),
      unit(3, "Tema"),
    ],
  });
  // Two weeks ago: 1 of 4 units → 13 %. Now: 2 of 4 → 25 %.
  const f = forecastFor(e, [], now);
  assert.equal(f.status, "ready");
  if (f.status !== "ready") return;
  assert.equal(f.windowDays, 14);
  assert.equal(f.readiness, 25);
  assert.equal(f.dailyGain, 0.9);
  assert.equal(f.projected, 37);
  assert.equal(f.reachesTarget, false);
  // A worse recent test lowers readiness, but the projection never goes below it.
  const worse = forecastFor(
    e,
    [
      result("a", 90, { date: at(9, 20) }),
      result("b", 0, { date: at(10, 14) }),
    ],
    now,
  );
  assert.equal(worse.status, "ready");
  if (worse.status === "ready") {
    assert.equal(worse.dailyGain, 0);
    assert.equal(worse.projected, worse.readiness);
  }
});

test("undated activity counts as the oldest", () => {
  const e = exam({
    units: [
      unit(0, "Tema", { status: "completed", completed_at: null }),
      unit(1, "Tema"),
    ],
  });
  const [past] = topicProgress(e, [], DEFAULT_TARGET, new Date(2020, 0, 1));
  assert.equal(past.unitsDone, 1);
});

test("replaying the past hides units finished later", () => {
  const [t] = topicProgress(
    twoTopics(),
    [],
    DEFAULT_TARGET,
    new Date(2026, 9, 12, 23),
  );
  assert.equal(t.unitsDone, 1);
  assert.deepEqual(
    t.units.map((u) => u.status),
    ["completed", "in_progress"],
  );
});

test("gaps: weak topics, untested topics and unresolved frequent errors", () => {
  const e = twoTopics();
  const results = [
    result("s1", 40, {
      unitId: "u0",
      date: at(10, 10),
      practice: ["Signos", "Despejar x", "Fracciones"],
    }),
    result("s2", 50, {
      date: at(10, 12),
      practice: ["signos ", "Fracciones"],
      mastered: ["Despejar x"],
    }),
    result("s3", 70, {
      date: at(10, 13),
      practice: ["Signos"],
      mastered: ["Fracciones"],
    }),
  ];
  const topics = topicProgress(e, results);
  const g = gapsFor(topics, results);
  assert.deepEqual(
    g.weak.map((t) => [t.name, t.practice]),
    [
      ["Ecuaciones de primer grado", 40],
      ["Factorización", 60],
    ],
  );
  assert.deepEqual(
    g.untested.map((t) => t.name),
    ["Factorización"],
  );
  // Despejar x and Fracciones were mastered later; Signos is still pending.
  assert.deepEqual(g.frequentErrors, [{ concept: "Signos", count: 3 }]);
});

test("graded sessions become results; unfinished ones are ignored", () => {
  const base: ExamSession = {
    id: "s1",
    mode: "exam",
    status: "completed",
    started_at: at(10, 14, 9),
    submitted_at: at(10, 14),
    test_id: "t1",
    exam_id: "e1",
    answers: {},
    question_index: 0,
    revision: 1,
    time_limit_seconds: null,
    result: {
      attempt_id: "a1",
      score: 7,
      total: 10,
      percentage: 70,
      mastered: ["A"],
      practice: ["B", ""],
      items: [],
    },
  };
  assert.deepEqual(toPracticeResult(base), {
    sessionId: "s1",
    kind: "simulacro",
    unitId: null,
    date: at(10, 14),
    percentage: 70,
    score: 7,
    total: 10,
    practice: ["B"],
    mastered: ["A"],
  });
  assert.equal(
    toPracticeResult({ ...base, mode: "practice", unit_id: "u1" })?.kind,
    "tema",
  );
  assert.equal(
    toPracticeResult({ ...base, mode: "practice", source_session_id: "s0" })
      ?.kind,
    "repaso",
  );
  assert.equal(
    toPracticeResult({ ...base, status: "active", result: null }),
    null,
  );
  assert.equal(
    toPracticeResult({
      ...base,
      result: { ...base.result!, percentage: Number.NaN },
    })?.percentage,
    70,
  );
  assert.deepEqual(
    completedSessionIds({
      sessions: [
        {
          id: "a",
          mode: "exam",
          status: "completed",
          started_at: at(10, 1),
          submitted_at: at(10, 1),
        },
        {
          id: "b",
          mode: "exam",
          status: "active",
          started_at: at(10, 2),
          submitted_at: null,
        },
        {
          id: "c",
          mode: "practice",
          status: "completed",
          started_at: at(10, 3),
          submitted_at: at(10, 3),
        },
      ],
    }),
    ["c", "a"],
  );
});

test("tests summary is chronological", () => {
  const s = summarizeTests([
    result("b", 80, { date: at(10, 14) }),
    result("a", 50, { date: at(10, 1) }),
  ]);
  assert.deepEqual(
    [s.results.map((r) => r.sessionId), s.average, s.best, s.last, s.change],
    [["a", "b"], 65, 80, 80, 30],
  );
});

test("weekly history groups units and tests by week (Monday first)", () => {
  const e = twoTopics();
  const weeks = weeklyHistory(
    e,
    [result("s1", 60, { unitId: "u2", date: at(10, 6) })],
    now,
    3,
  );
  assert.deepEqual(
    weeks.map((w) => [w.start, w.unitsCompleted, w.tests, w.topics, w.average]),
    [
      ["2026-09-28", 0, 0, [], null],
      ["2026-10-05", 0, 1, ["Factorización"], 60],
      ["2026-10-12", 2, 0, ["Ecuaciones de primer grado"], null],
    ],
  );
});

test("weekly plan fills weeks with the daily minutes until the exam", () => {
  // 14 days left: Thu–Sun (4 days), a full week, Mon–Wed (3 days).
  const e = exam({
    daily_minutes: 10,
    units: [0, 1, 2, 3, 4, 5].map((i) =>
      unit(i, i < 3 ? "A" : "B", { estimated_minutes: 30 }),
    ),
  });
  const plan = weeklyPlan(e, now);
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.equal(plan.availableMinutes, 140);
  assert.equal(plan.pendingMinutes, 180);
  assert.deepEqual(
    plan.weeks.map((w) => [
      w.start,
      w.minutes,
      w.units.map((u) => u.id),
      w.topics,
    ]),
    [
      ["2026-10-12", 40, ["u0"], ["A"]],
      ["2026-10-19", 70, ["u1", "u2"], ["A"]],
      ["2026-10-26", 30, ["u3"], ["B"]],
    ],
  );
  assert.equal(plan.overflow, 2);
  const done = weeklyPlan(
    exam({ units: [unit(0, "A", { status: "completed" })] }),
    now,
  );
  assert.deepEqual(done, { status: "done" });
});

test("rhythm compares recent pace with the pace the plan needs", () => {
  const r = rhythmFor(twoTopics(), [], now);
  assert.equal(r.pendingUnits, 2);
  // Two units in the last 7 days (first activity 3 days ago → 7-day window).
  assert.equal(r.unitsPerDay, 0.29);
  assert.equal(r.daysToFinish, 7);
  assert.equal(r.neededPerDay, 0.14);
  assert.equal(
    rhythmFor(exam({ units: [unit(0, "A")] }), [], now).daysToFinish,
    null,
  );
});

test("readiness ignores topics outside the plan", () => {
  const topics = topicProgress(
    exam({
      topics: ["Probabilidad"],
      units: [unit(0, "Álgebra", { status: "completed" })],
    }),
    [],
  );
  assert.deepEqual(
    topics.map((t) => [t.name, t.inPlan]),
    [
      ["Álgebra", true],
      ["Probabilidad", false],
    ],
  );
  assert.equal(readinessOf(topics), 50);
});
