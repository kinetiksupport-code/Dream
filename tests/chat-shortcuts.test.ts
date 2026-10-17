import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_SHORTCUT_IDS,
  MAIN_SHORTCUTS,
  MODE_SHORTCUTS,
  NEUTRAL_GREETING,
  editableExamPath,
  greeting,
  lastStudied,
  shortcutPrompt,
  todayFocus,
  upcomingExam,
} from "../lib/chat-shortcuts";
import type { DreamExam, ExamUnit } from "../lib/exam-plans";
import {
  CHAT_SHORTCUTS,
  ExamError,
  chatShortcut,
} from "../supabase/functions/dream-api/validation";
import {
  CHAT_SHORTCUT_PROMPTS,
  dynamicContextFor,
  shortcutInstruction,
} from "../supabase/functions/dream-api/prompts.mjs";
import { estimateTokens } from "../supabase/functions/dream-api/admission.mjs";

const now = new Date(2026, 9, 15, 9, 30);
const unit = (patch: Partial<ExamUnit>): ExamUnit => ({
  id: "u",
  position: 0,
  title: "Tema",
  topic: "Tema",
  summary: "",
  estimated_minutes: 20,
  status: "pending",
  conversation_id: null,
  ...patch,
});
const exam = (patch: Partial<DreamExam>): DreamExam => ({
  id: "e1",
  title: "Parcial de mates",
  subject: "Matemáticas",
  exam_date: "2026-10-20",
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
});

test("topic of the day: next pending unit of the plan, exam day or neutral", () => {
  const plan = exam({
    units: [
      unit({ id: "u3", position: 2, title: "Porcentajes" }),
      unit({ id: "u1", position: 0, title: "Enteros", status: "completed" }),
      unit({ id: "u2", position: 1, title: "Fracciones y decimales" }),
    ],
  });
  const focus = todayFocus(plan, now);
  assert.deepEqual(focus, {
    kind: "unit",
    title: "Fracciones y decimales",
    examId: "e1",
    unitId: "u2",
  });
  assert.equal(
    greeting(focus),
    "Hoy toca Fracciones y decimales. ¿Qué quieres repasar?",
  );
  assert.equal(
    greeting(todayFocus({ ...plan, exam_date: "2026-10-15" }, now)),
    "Hoy es tu examen de Matemáticas. ¿Qué quieres repasar?",
  );
  // Past exam, completed plan, finished units or no plan → neutral greeting.
  for (const patch of [
    { exam_date: "2026-10-14" },
    { status: "completed" as const },
    { units: [unit({ status: "completed" })] },
    { units: [] },
  ])
    assert.equal(
      greeting(todayFocus({ ...plan, ...patch }, now)),
      NEUTRAL_GREETING,
    );
  assert.equal(greeting(null), NEUTRAL_GREETING);
});

test("upcoming exam is the nearest one today or later, never completed or past", () => {
  const list = [
    { id: "past", status: "ready" as const, exam_date: "2026-10-01" },
    { id: "done", status: "completed" as const, exam_date: "2026-10-16" },
    { id: "late", status: "ready" as const, exam_date: "2026-12-01" },
    { id: "soon", status: "draft" as const, exam_date: "2026-10-18" },
    { id: "bad", status: "ready" as const, exam_date: "2026-02-30" },
  ];
  assert.equal(upcomingExam(list, now)?.id, "soon");
  assert.equal(upcomingExam([], now), null);
  assert.equal(
    editableExamPath({ id: "soon", status: "draft" }),
    "/exams/new?id=soon",
  );
  assert.equal(
    editableExamPath({ id: "x", status: "failed" }),
    "/exams/new?id=x",
  );
  assert.equal(editableExamPath({ id: "x", status: "ready" }), null);
});

test("last studied picks the latest completed lesson or practice", () => {
  const plan = exam({
    units: [
      unit({
        title: "Enteros",
        status: "completed",
        completed_at: "2026-10-10T10:00:00Z",
      }),
      unit({ title: "Fracciones", status: "in_progress" }),
    ],
    sessions: [
      {
        id: "s",
        mode: "practice",
        status: "completed",
        started_at: "2026-10-12T09:00:00Z",
        submitted_at: "2026-10-12T10:00:00Z",
      },
      {
        id: "t",
        mode: "exam",
        status: "active",
        started_at: "2026-10-14T09:00:00Z",
        submitted_at: null,
      },
    ],
  });
  assert.equal(lastStudied(plan), "práctica de Parcial de mates");
  assert.equal(lastStudied({ ...plan, sessions: [] }), "Enteros");
  assert.equal(lastStudied(exam({})), null);
});

test("visible text is the button text, with the draft or detail after it", () => {
  assert.equal(shortcutPrompt("Enséñame"), "Enséñame");
  assert.equal(
    shortcutPrompt("Enséñame", "  la fotosíntesis "),
    "Enséñame: la fotosíntesis",
  );
  assert.ok(shortcutPrompt("Enséñame", "x".repeat(20000)).length <= 12000);
});

test("client and server share the closed shortcut list", () => {
  assert.deepEqual([...CHAT_SHORTCUT_IDS].sort(), [...CHAT_SHORTCUTS].sort());
  assert.deepEqual(
    Object.keys(CHAT_SHORTCUT_PROMPTS).sort(),
    [...CHAT_SHORTCUTS].sort(),
  );
  for (const s of [...MAIN_SHORTCUTS, ...MODE_SHORTCUTS])
    assert.ok(CHAT_SHORTCUT_IDS.includes(s.id));
  assert.equal(MAIN_SHORTCUTS.length, 5);
  assert.equal(MODE_SHORTCUTS.length, 6);
});

test("server validates shortcut: optional, closed list, nothing else", () => {
  assert.equal(chatShortcut(undefined), null);
  assert.equal(chatShortcut(null), null);
  for (const id of CHAT_SHORTCUTS) assert.equal(chatShortcut(id), id);
  for (const bad of [
    "",
    "Eli5",
    "toString",
    "constructor",
    1,
    true,
    ["eli5"],
    {},
  ])
    assert.throws(() => chatShortcut(bad), ExamError);
  assert.equal(shortcutInstruction("constructor"), "");
});

test("shortcut templates are short, forbid solutions and stay out of the stable prompt", () => {
  for (const id of CHAT_SHORTCUTS) {
    const line = shortcutInstruction(id);
    assert.match(line, /No des la solución: solo pistas y preguntas\./);
    assert.ok(estimateTokens(line) <= 230, `${id}: ${estimateTokens(line)}`);
    assert.ok(dynamicContextFor([], id).includes(line));
  }
  assert.doesNotMatch(dynamicContextFor([]), /Atajo/);
});
