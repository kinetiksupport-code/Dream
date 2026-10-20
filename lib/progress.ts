/**
 * Progreso: pure calculations over data Dream already stores (exam plan units,
 * their completion dates and the graded results of exam sessions). No AI call,
 * no network and no storage here, so every number is reproducible in tests.
 *
 * Fórmulas (también explicadas en la interfaz):
 * - Dominio de un tema = 50 % estudio + 50 % práctica.
 *   · Estudio: % de unidades del tema completadas.
 *   · Práctica: nota media de los últimos 3 tests de unidades de ese tema; si
 *     no hay, la de los últimos 3 simulacros (cubren todo el examen); si no hay
 *     ninguno, 0. Por eso un tema solo estudiado se queda en 50 % como máximo:
 *     marcar una unidad como completada no demuestra dominio.
 * - Un tema está «en el objetivo» si su dominio llega al objetivo (85 % por
 *   defecto) y tiene al menos un test que lo respalde.
 * - Preparación = media del dominio de los temas del plan.
 * - Previsión (solo con 2 actividades o más: unidades completadas + tests):
 *   preparación actual + ritmo diario × días que faltan, hasta 100 %. El ritmo
 *   es lo que ha subido la preparación en las últimas 2 semanas, dividido entre
 *   esos días (mínimo 7 días, para no exagerar con muy pocos datos).
 */
import {
  daysUntil,
  type DreamExam,
  type ExamSession,
  type ExamUnit,
} from "./exam-plans";

export const DEFAULT_TARGET = 85;
export const FORECAST_MIN_ACTIVITIES = 2;
const RECENT_RESULTS = 3;
const PACE_MIN_DAYS = 7;
const PACE_MAX_DAYS = 14;
const DAY = 86_400_000;

export type ResultKind = "simulacro" | "tema" | "repaso";

/** A graded exam session, reduced to what Progreso needs. */
export interface PracticeResult {
  sessionId: string;
  kind: ResultKind;
  unitId: string | null;
  /** ISO timestamp of the submission; null if unknown. */
  date: string | null;
  percentage: number;
  score: number;
  total: number;
  /** Concepts answered wrong at least once in this test. */
  practice: string[];
  mastered: string[];
}

export interface TopicProgress {
  key: string;
  name: string;
  /** False for a topic the student listed that no plan unit covers. */
  inPlan: boolean;
  units: Pick<ExamUnit, "id" | "title" | "status" | "position">[];
  unitsDone: number;
  /** 0–100: share of the topic's units completed. */
  study: number;
  /** 0–100 average of recent tests, or null without any test. */
  practice: number | null;
  practiceSource: "tema" | "simulacros" | null;
  /** Tests about this topic's units (not counting simulations). */
  topicTests: number;
  /** 0–100, or null when the topic is not in the plan. */
  mastery: number | null;
  atTarget: boolean;
  /** Previous topic in plan order (approximate dependency), if any. */
  dependsOn: string | null;
}

export type Forecast =
  | { status: "no_date" }
  | { status: "past"; readiness: number }
  | { status: "locked"; activities: number; missing: number }
  | {
      status: "ready";
      readiness: number;
      projected: number;
      /** Readiness points gained per day in the measured window. */
      dailyGain: number;
      windowDays: number;
      daysLeft: number;
      reachesTarget: boolean;
    };

export interface ConceptCount {
  concept: string;
  count: number;
}

export interface Gaps {
  /** Topics with test evidence below the target, weakest first. */
  weak: TopicProgress[];
  /** Topics in the plan without any test about them yet. */
  untested: TopicProgress[];
  /** Concepts failed in tests and not mastered in a later test. */
  frequentErrors: ConceptCount[];
}

export interface WeekActivity {
  /** Monday of the week, YYYY-MM-DD (local). */
  start: string;
  unitsCompleted: number;
  tests: number;
  topics: string[];
  average: number | null;
}

export interface PlannedWeek {
  start: string;
  minutes: number;
  units: { id: string; title: string; topic: string; minutes: number }[];
  topics: string[];
}

export type StudyPlan =
  | { status: "no_date" | "past" | "done" | "empty" }
  | {
      status: "ready";
      weeks: PlannedWeek[];
      /** Pending units that do not fit before the exam at the daily pace. */
      overflow: number;
      pendingMinutes: number;
      availableMinutes: number;
    };

export interface Rhythm {
  dailyMinutes: number;
  pendingUnits: number;
  /** Units completed per day over the last 14 days (≥7-day window). */
  unitsPerDay: number;
  /** Days needed to finish the plan at that pace; null without pace. */
  daysToFinish: number | null;
  /** Units per day needed to finish before the exam; null without date. */
  neededPerDay: number | null;
}

export interface SimulationSummary {
  results: PracticeResult[];
  average: number | null;
  best: number | null;
  last: number | null;
  /** Last minus first percentage, with at least two results. */
  change: number | null;
}

export interface ExamProgress {
  target: number;
  readiness: number;
  topics: TopicProgress[];
  topicsInPlan: number;
  topicsAtTarget: number;
  daysLeft: number | null;
  activities: number;
  forecast: Forecast;
  gaps: Gaps;
  tests: SimulationSummary;
  history: WeekActivity[];
  plan: StudyPlan;
  rhythm: Rhythm;
}

/* ------------------------------------------------------------------ dates */

function localDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function dayKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}
function parseTime(iso: string | null | undefined) {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time) : null;
}
/** Calendar days from a to b (local dates, DST-safe). */
function calendarDays(a: Date, b: Date) {
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      DAY,
  );
}
function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
export function mondayOf(date: Date) {
  const day = localDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/* ---------------------------------------------------------------- helpers */

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ");

function finitePercent(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 100) : null;
}

/** Graded session → result. Sessions without a stored result are skipped. */
export function toPracticeResult(session: ExamSession): PracticeResult | null {
  const r = session.result;
  if (session.status !== "completed" || !r) return null;
  const percentage =
    finitePercent(r.percentage) ??
    (r.total > 0 ? finitePercent((r.score / r.total) * 100) : null);
  if (percentage === null) return null;
  const strings = (list: unknown) =>
    Array.isArray(list)
      ? list.filter((c): c is string => typeof c === "string" && !!c.trim())
      : [];
  return {
    sessionId: session.id,
    kind: session.unit_id
      ? "tema"
      : session.source_session_id || session.mode === "practice"
        ? "repaso"
        : "simulacro",
    unitId: session.unit_id ?? null,
    date: session.submitted_at ?? null,
    percentage,
    score: Number(r.score) || 0,
    total: Number(r.total) || 0,
    practice: strings(r.practice),
    mastered: strings(r.mastered),
  };
}

const byDateAsc = (a: PracticeResult, b: PracticeResult) =>
  (parseTime(a.date)?.getTime() ?? 0) - (parseTime(b.date)?.getTime() ?? 0);

function recentAverage(results: PracticeResult[]) {
  const recent = [...results].sort(byDateAsc).slice(-RECENT_RESULTS);
  const avg = mean(recent.map((r) => r.percentage));
  return avg === null ? null : Math.round(avg);
}

/* ----------------------------------------------------------------- topics */

/**
 * Topics in plan order. A topic is the `topic` of its units; topics the
 * student listed that no unit covers are appended with `inPlan: false`.
 * `asOf` replays the past: only units and tests finished by then count.
 */
export function topicProgress(
  exam: Pick<DreamExam, "topics" | "units">,
  results: PracticeResult[],
  target = DEFAULT_TARGET,
  asOf?: Date,
): TopicProgress[] {
  const cutoff = asOf?.getTime() ?? Infinity;
  // Undated events cannot be placed in time: treat them as the oldest.
  const doneBy = (unit: ExamUnit) =>
    unit.status === "completed" &&
    (parseTime(unit.completed_at)?.getTime() ?? -Infinity) <= cutoff;
  const visible = results.filter(
    (r) => (parseTime(r.date)?.getTime() ?? -Infinity) <= cutoff,
  );
  const general = visible.filter((r) => !r.unitId);
  const generalScore = recentAverage(general);

  const groups = new Map<string, { name: string; units: ExamUnit[] }>();
  for (const unit of [...(exam.units ?? [])].sort(
    (a, b) => a.position - b.position,
  )) {
    const name = unit.topic?.trim() || unit.title;
    const key = normalize(name);
    const group = groups.get(key) ?? { name, units: [] };
    group.units.push(unit);
    groups.set(key, group);
  }

  const topics: TopicProgress[] = [];
  let previous: string | null = null;
  for (const [key, { name, units }] of groups) {
    const ids = new Set(units.map((u) => u.id));
    const own = visible.filter((r) => r.unitId && ids.has(r.unitId));
    const ownScore = recentAverage(own);
    const practice = ownScore ?? generalScore;
    const unitsDone = units.filter(doneBy).length;
    const study = Math.round((unitsDone / units.length) * 100);
    const mastery = Math.round(study / 2 + (practice ?? 0) / 2);
    topics.push({
      key,
      name,
      inPlan: true,
      units: units.map((u) => ({
        id: u.id,
        title: u.title,
        position: u.position,
        // Replaying the past: a unit finished later was not done yet.
        status:
          u.status === "completed" && !doneBy(u) ? "in_progress" : u.status,
      })),
      unitsDone,
      study,
      practice,
      practiceSource:
        ownScore !== null
          ? "tema"
          : generalScore !== null
            ? "simulacros"
            : null,
      topicTests: own.length,
      mastery,
      atTarget: practice !== null && mastery >= target,
      dependsOn: previous,
    });
    previous = key;
  }

  const planKeys = [...groups.keys()];
  for (const declared of exam.topics ?? []) {
    const key = normalize(declared);
    if (!key || topics.some((t) => t.key === key)) continue;
    // "Ecuaciones" is covered by a unit topic "Ecuaciones de primer grado".
    if (planKeys.some((k) => k.includes(key) || key.includes(k))) continue;
    topics.push({
      key,
      name: declared.trim(),
      inPlan: false,
      units: [],
      unitsDone: 0,
      study: 0,
      practice: null,
      practiceSource: null,
      topicTests: 0,
      mastery: null,
      atTarget: false,
      dependsOn: null,
    });
  }
  return topics;
}

/** Mean mastery of the plan's topics (0 without topics). */
export function readinessOf(topics: TopicProgress[]) {
  const values = topics
    .map((t) => t.mastery)
    .filter((m): m is number => m !== null);
  const avg = mean(values);
  return avg === null ? 0 : Math.round(avg);
}

/* --------------------------------------------------------------- activity */

function activityDates(
  exam: Pick<DreamExam, "units">,
  results: PracticeResult[],
) {
  return [
    ...(exam.units ?? [])
      .filter((u) => u.status === "completed")
      .map((u) => parseTime(u.completed_at)),
    ...results.map((r) => parseTime(r.date)),
  ];
}

export function forecastFor(
  exam: Pick<DreamExam, "topics" | "units" | "exam_date">,
  results: PracticeResult[],
  now: Date,
  target = DEFAULT_TARGET,
): Forecast {
  const readiness = readinessOf(topicProgress(exam, results, target));
  const daysLeft = daysUntil(exam.exam_date ?? "", now);
  if (daysLeft === null) return { status: "no_date" };
  if (daysLeft < 0) return { status: "past", readiness };
  const dates = activityDates(exam, results);
  if (dates.length < FORECAST_MIN_ACTIVITIES)
    return {
      status: "locked",
      activities: dates.length,
      missing: FORECAST_MIN_ACTIVITIES - dates.length,
    };
  const windowDays = paceWindow(dates, now);
  const before = readinessOf(
    topicProgress(exam, results, target, endOfDay(addDays(now, -windowDays))),
  );
  const dailyGain = Math.max(0, readiness - before) / windowDays;
  const projected = Math.min(100, Math.round(readiness + dailyGain * daysLeft));
  return {
    status: "ready",
    readiness,
    projected,
    dailyGain: Math.round(dailyGain * 10) / 10,
    windowDays,
    daysLeft,
    reachesTarget: projected >= target,
  };
}

function endOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

/** Days since the first dated activity (inclusive), kept within 7–14. */
function paceWindow(dates: (Date | null)[], now: Date) {
  const times = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  const first = times.length ? new Date(Math.min(...times)) : now;
  return clamp(calendarDays(first, now) + 1, PACE_MIN_DAYS, PACE_MAX_DAYS);
}

/* ------------------------------------------------------------------- gaps */

export function gapsFor(
  topics: TopicProgress[],
  results: PracticeResult[],
  target = DEFAULT_TARGET,
): Gaps {
  const inPlan = topics.filter((t) => t.inPlan);
  const weak = inPlan
    .filter((t) => t.practice !== null && t.practice < target)
    .sort(
      (a, b) =>
        (a.practice ?? 0) - (b.practice ?? 0) ||
        (a.mastery ?? 0) - (b.mastery ?? 0),
    );
  const untested = inPlan.filter((t) => t.topicTests === 0);
  // Count failures per concept; drop it if the latest test that included it
  // shows it mastered.
  const counts = new Map<
    string,
    { concept: string; count: number; fixed: boolean }
  >();
  for (const r of [...results].sort(byDateAsc)) {
    for (const concept of r.practice) {
      const key = normalize(concept);
      const entry = counts.get(key) ?? {
        concept: concept.trim(),
        count: 0,
        fixed: false,
      };
      entry.count++;
      entry.fixed = false;
      counts.set(key, entry);
    }
    for (const concept of r.mastered) {
      const entry = counts.get(normalize(concept));
      if (entry) entry.fixed = true;
    }
  }
  const frequentErrors = [...counts.values()]
    .filter((c) => !c.fixed)
    .sort(
      (a, b) => b.count - a.count || a.concept.localeCompare(b.concept, "es"),
    )
    .slice(0, 6)
    .map(({ concept, count }) => ({ concept, count }));
  return { weak, untested, frequentErrors };
}

/* ------------------------------------------------------------------ tests */

export function summarizeTests(results: PracticeResult[]): SimulationSummary {
  const sorted = [...results].sort(byDateAsc);
  const values = sorted.map((r) => r.percentage);
  const avg = mean(values);
  return {
    results: sorted,
    average: avg === null ? null : Math.round(avg),
    best: values.length ? Math.max(...values) : null,
    last: values.length ? values[values.length - 1] : null,
    change: values.length >= 2 ? values[values.length - 1] - values[0] : null,
  };
}

/* ------------------------------------------------------------------ weeks */

/** Activity of the last `weeks` weeks (oldest first, current week last). */
export function weeklyHistory(
  exam: Pick<DreamExam, "units">,
  results: PracticeResult[],
  now: Date,
  weeks = 6,
): WeekActivity[] {
  const current = mondayOf(now);
  const list: WeekActivity[] = Array.from({ length: weeks }, (_, i) => ({
    start: dayKey(addDays(current, (i - weeks + 1) * 7)),
    unitsCompleted: 0,
    tests: 0,
    topics: [],
    average: null,
  }));
  const scores = new Map<string, number[]>();
  const find = (date: Date | null) =>
    date ? list.find((w) => w.start === dayKey(mondayOf(date))) : undefined;
  const addTopic = (week: WeekActivity, topic: string | undefined) => {
    if (topic && !week.topics.includes(topic)) week.topics.push(topic);
  };
  const units = exam.units ?? [];
  for (const unit of units) {
    if (unit.status !== "completed") continue;
    const week = find(parseTime(unit.completed_at));
    if (!week) continue;
    week.unitsCompleted++;
    addTopic(week, unit.topic?.trim() || unit.title);
  }
  for (const r of results) {
    const week = find(parseTime(r.date));
    if (!week) continue;
    week.tests++;
    scores.set(week.start, [...(scores.get(week.start) ?? []), r.percentage]);
    const unit = r.unitId ? units.find((u) => u.id === r.unitId) : undefined;
    addTopic(week, unit ? unit.topic?.trim() || unit.title : undefined);
  }
  for (const week of list) {
    const avg = mean(scores.get(week.start) ?? []);
    week.average = avg === null ? null : Math.round(avg);
  }
  return list;
}

/**
 * Suggested weeks until the exam: pending units in plan order, filling each
 * week with the student's daily minutes (the exam day itself is excluded).
 */
export function weeklyPlan(
  exam: Pick<DreamExam, "units" | "exam_date" | "daily_minutes">,
  now: Date,
): StudyPlan {
  const daysLeft = daysUntil(exam.exam_date ?? "", now);
  if (daysLeft === null) return { status: "no_date" };
  if (daysLeft < 0) return { status: "past" };
  if (!exam.units?.length) return { status: "empty" };
  const pending = [...exam.units]
    .filter((u) => u.status !== "completed")
    .sort((a, b) => a.position - b.position);
  if (!pending.length) return { status: "done" };
  const daily = clamp(Number(exam.daily_minutes) || 0, 0, 24 * 60);
  const today = localDay(now);
  const weeks: PlannedWeek[] = [];
  let day = 0;
  while (day < daysLeft) {
    const start = mondayOf(addDays(today, day));
    const daysThisWeek = Math.min(
      7 - calendarDays(start, addDays(today, day)),
      daysLeft - day,
    );
    weeks.push({
      start: dayKey(start),
      minutes: daily * daysThisWeek,
      units: [],
      topics: [],
    });
    day += daysThisWeek;
  }
  const availableMinutes = weeks.reduce((n, w) => n + w.minutes, 0);
  // Lay the units on a continuous timeline of study minutes; each unit goes
  // to the week in which it would be finished.
  let elapsed = 0;
  let overflow = 0;
  for (const unit of pending) {
    elapsed += unit.estimated_minutes;
    let capacity = 0;
    const week = weeks.find((w) => (capacity += w.minutes) >= elapsed);
    if (!week) {
      overflow++;
      continue;
    }
    const topic = unit.topic?.trim() || unit.title;
    week.units.push({
      id: unit.id,
      title: unit.title,
      topic,
      minutes: unit.estimated_minutes,
    });
    if (!week.topics.includes(topic)) week.topics.push(topic);
  }
  return {
    status: "ready",
    weeks: weeks.filter((w) => w.units.length),
    overflow,
    pendingMinutes: pending.reduce((n, u) => n + u.estimated_minutes, 0),
    availableMinutes,
  };
}

export function rhythmFor(
  exam: Pick<DreamExam, "units" | "exam_date" | "daily_minutes">,
  results: PracticeResult[],
  now: Date,
): Rhythm {
  const units = exam.units ?? [];
  const pendingUnits = units.filter((u) => u.status !== "completed").length;
  const window = paceWindow(activityDates(exam, results), now);
  const since = addDays(localDay(now), -window + 1).getTime();
  const recent = units.filter(
    (u) =>
      u.status === "completed" &&
      (parseTime(u.completed_at)?.getTime() ?? -Infinity) >= since,
  ).length;
  const unitsPerDay = Math.round((recent / window) * 100) / 100;
  const daysLeft = daysUntil(exam.exam_date ?? "", now);
  return {
    dailyMinutes: exam.daily_minutes,
    pendingUnits,
    unitsPerDay,
    daysToFinish:
      pendingUnits === 0
        ? 0
        : unitsPerDay > 0
          ? Math.ceil(pendingUnits / unitsPerDay)
          : null,
    neededPerDay:
      daysLeft === null || daysLeft <= 0
        ? null
        : Math.round((pendingUnits / daysLeft) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ entry */

export function buildProgress(
  exam: DreamExam,
  results: PracticeResult[],
  now = new Date(),
  target = DEFAULT_TARGET,
): ExamProgress {
  const topics = topicProgress(exam, results, target);
  const inPlan = topics.filter((t) => t.inPlan);
  return {
    target,
    readiness: readinessOf(topics),
    topics,
    topicsInPlan: inPlan.length,
    topicsAtTarget: inPlan.filter((t) => t.atTarget).length,
    daysLeft: daysUntil(exam.exam_date ?? "", now),
    activities: activityDates(exam, results).length,
    forecast: forecastFor(exam, results, now, target),
    gaps: gapsFor(topics, results, target),
    tests: summarizeTests(results),
    history: weeklyHistory(exam, results, now),
    plan: weeklyPlan(exam, now),
    rhythm: rhythmFor(exam, results, now),
  };
}

/**
 * Exam shown first: the closest upcoming one with a plan, otherwise the most
 * recent past one; exams without a plan only if nothing else exists.
 */
export function pickDefaultExam<
  T extends Pick<DreamExam, "id" | "exam_date" | "status">,
>(exams: T[], now = new Date()): T | null {
  if (!exams.length) return null;
  const planned = exams.filter(
    (e) => e.status === "ready" || e.status === "completed",
  );
  const pool = planned.length ? planned : exams;
  const withDays = pool.map((exam) => ({
    exam,
    days: daysUntil(exam.exam_date ?? "", now),
  }));
  const upcoming = withDays
    .filter(
      (e) => e.days !== null && e.days >= 0 && e.exam.status !== "completed",
    )
    .sort((a, b) => a.days! - b.days!);
  if (upcoming.length) return upcoming[0].exam;
  const past = withDays
    .filter((e) => e.days !== null)
    .sort((a, b) => b.days! - a.days!);
  return (past[0] ?? withDays[0]).exam;
}

/** Sessions worth fetching for results: completed, newest first. */
export function completedSessionIds(
  exam: Pick<DreamExam, "sessions">,
  limit = 12,
) {
  return [...(exam.sessions ?? [])]
    .filter((s) => s.status === "completed")
    .sort((a, b) =>
      (b.submitted_at ?? b.started_at).localeCompare(
        a.submitted_at ?? a.started_at,
      ),
    )
    .slice(0, limit)
    .map((s) => s.id);
}
