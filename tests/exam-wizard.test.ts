import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEW_NOTES,
  GRADE,
  GRADE_VALUES,
  addMonths,
  clampGrade,
  countdownParts,
  dateError,
  findDuplicate,
  fileSize,
  formatGrade,
  gradeForKey,
  gradeIndexAt,
  gradeWarmth,
  isFewNotes,
  monthGrid,
  pagesEquivalent,
  resumeStep,
  shouldWarnFewNotes,
  stepDirection,
  wheelItemStyle,
} from "../lib/exam-wizard";

const draft = (o: Record<string, unknown> = {}) => ({
  materials: [] as { id: string }[],
  exam_date: "",
  target_grade: null as number | null,
  wizard_step: null as null | "upload" | "date" | "grade" | "identify",
  ...o,
});
const file = { id: "a" };

test("few notes: under 3.000 characters (< 2 pages of 1.800) asks once (§5.4)", () => {
  assert.equal(FEW_NOTES.minChars, 3000);
  assert.ok(FEW_NOTES.minChars < 2 * FEW_NOTES.pageChars, "below two pages");
  assert.equal(isFewNotes({ files: 1, chars: 2999 }), true);
  assert.equal(isFewNotes({ files: 3, chars: 3000 }), false);
  assert.equal(isFewNotes({ files: 0, chars: 0 }), false);
  assert.equal(shouldWarnFewNotes({ files: 1, chars: 500 }, false), true);
  // «Continuar con estos» is remembered: never asked again for that exam.
  assert.equal(shouldWarnFewNotes({ files: 1, chars: 500 }, true), false);
  assert.equal(pagesEquivalent(2700), 1.5);
});

test("grade wheel: 0–10 in 0,5 steps, keys, snapping and looks (§5.6)", () => {
  assert.equal(GRADE_VALUES.length, 21);
  assert.equal(GRADE_VALUES[0], 0);
  assert.equal(GRADE_VALUES.at(-1), 10);
  assert.equal(GRADE.initial, 8);
  assert.equal(clampGrade(8.26), 8.5);
  assert.equal(clampGrade(-3), 0);
  assert.equal(clampGrade(12), 10);
  assert.equal(clampGrade(Number.NaN), 8);
  assert.equal(formatGrade(8.5), "8,5");
  assert.equal(formatGrade(10), "10");
  assert.equal(gradeForKey(8, "ArrowUp"), 8.5);
  assert.equal(gradeForKey(8, "ArrowDown"), 7.5);
  assert.equal(gradeForKey(8, "PageUp"), 9);
  assert.equal(gradeForKey(9.5, "PageUp"), 10);
  assert.equal(gradeForKey(0.5, "PageDown"), 0);
  assert.equal(gradeForKey(5, "Home"), 0);
  assert.equal(gradeForKey(5, "End"), 10);
  assert.equal(gradeForKey(5, "a"), null);
  assert.equal(gradeIndexAt(0, 64), 0);
  assert.equal(gradeIndexAt(64 * 4 + 20, 64), 4);
  assert.equal(gradeIndexAt(64 * 4 + 40, 64), 5);
  assert.equal(gradeIndexAt(99999, 64), 20);
  assert.deepEqual(wheelItemStyle(0), { scale: 1, opacity: 1 });
  const near = wheelItemStyle(1);
  const far = wheelItemStyle(-2);
  assert.ok(near.scale < 1 && far.scale < near.scale);
  assert.ok(near.opacity < 1 && far.opacity < near.opacity);
  assert.deepEqual(wheelItemStyle(9), wheelItemStyle(3));
  assert.equal(gradeWarmth(0), 0);
  assert.equal(gradeWarmth(10), 1);
  assert.equal(gradeWarmth(8), 0.8);
});

test("date: no past days, live countdown, month grid starting on Monday (§5.5)", () => {
  const now = new Date(2026, 9, 19, 9);
  assert.equal(dateError("", now), "Elige el día de tu examen.");
  assert.match(dateError("2026-10-18", now)!, /ya ha pasado/);
  assert.equal(dateError("2026-10-19", now), null);
  assert.match(dateError("2026-02-30", now)!, /no existe/);
  assert.match(dateError("2029-01-01", now)!, /dos años/);
  assert.deepEqual(countdownParts("2026-10-31", now), { before: "Faltan", n: 12, after: "días" });
  assert.equal(countdownParts("2026-10-20", now)!.after, "Es mañana");
  assert.equal(countdownParts("2026-10-01", now), null);
  const october = monthGrid(2026, 9);
  // 1 Oct 2026 is a Thursday: three empty cells first.
  assert.deepEqual(october[0].slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.ok(october.every((w) => w.length === 7));
  assert.equal(october.flat().filter(Boolean).length, 31);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("resume: the URL step if reachable, else the saved one, never beyond the data (§5.9)", () => {
  assert.equal(resumeStep(draft(), null), "apuntes");
  assert.equal(resumeStep(draft(), "nota"), "apuntes");
  const withFiles = draft({ materials: [file], wizard_step: "date" });
  assert.equal(resumeStep(withFiles, null), "fecha");
  assert.equal(resumeStep(withFiles, "apuntes"), "apuntes");
  assert.equal(resumeStep(withFiles, "examen"), "fecha");
  const full = draft({ materials: [file], exam_date: "2026-11-02", target_grade: 7.5, wizard_step: "identify" });
  assert.equal(resumeStep(full, null), "examen");
  assert.equal(resumeStep(full, "inicio"), "examen");
  assert.equal(resumeStep(full, "nota"), "nota");
  assert.equal(stepDirection("apuntes", "fecha"), "forward");
  assert.equal(stepDirection("nota", "fecha"), "back");
  assert.equal(stepDirection("nota", "nota"), null);
});

test("duplicates: same content, or same name and size (§5.9)", () => {
  const known = [{ name: "tema1.pdf", size: 1000, hash: "abc" }];
  assert.ok(findDuplicate({ name: "tema1.pdf", size: 1000 }, known));
  assert.ok(findDuplicate({ name: "copia.pdf", size: 5, hash: "abc" }, known));
  assert.equal(findDuplicate({ name: "tema1.pdf", size: 999, hash: "zzz" }, known), null);
  assert.equal(fileSize(248 * 1024), "248 KB");
  assert.equal(fileSize(1.25 * 1024 * 1024), "1,3 MB");
});
