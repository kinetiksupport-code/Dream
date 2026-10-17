import test from "node:test";
import assert from "node:assert/strict";
import { installPath, updateReducer, type UpdateStatus } from "../lib/pwa";
import { activeNav, isFocusRoute } from "../lib/navigation";
import { groupByDay } from "../lib/history";
import { examsToNotes, examsToTasks, noteKind } from "../lib/study-data";
import type { DreamExam } from "../lib/exam-plans";

test("SW update waits for the user and reloads only after accepting", () => {
  let status: UpdateStatus = "idle";
  const step = (type: Parameters<typeof updateReducer>[1]["type"]) => {
    const result = updateReducer(status, { type });
    status = result.status;
    return result;
  };
  // Another tab activating a worker must not reload this one.
  assert.deepEqual(step("controllerchange"), { status: "idle" });
  assert.deepEqual(step("waiting"), { status: "available" });
  assert.equal(step("waiting").status, "available");
  assert.deepEqual(step("accept"), {
    status: "activating",
    post: "SKIP_WAITING",
  });
  // A second tap does not post twice.
  assert.deepEqual(step("accept"), { status: "activating" });
  assert.deepEqual(step("controllerchange"), { status: "idle", reload: true });
});

test("SW update can be dismissed and never auto-activates", () => {
  assert.deepEqual(updateReducer("available", { type: "dismiss" }), {
    status: "dismissed",
  });
  assert.deepEqual(updateReducer("dismissed", { type: "waiting" }), {
    status: "dismissed",
  });
  assert.deepEqual(updateReducer("idle", { type: "accept" }), {
    status: "idle",
  });
  assert.deepEqual(updateReducer("dismissed", { type: "controllerchange" }), {
    status: "dismissed",
  });
});

test("install path: installed, Chromium prompt, iOS guide or nothing", () => {
  const base = {
    standalone: false,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141 Safari/537.36",
    maxTouchPoints: 0,
    hasPrompt: false,
  };
  assert.equal(installPath({ ...base, standalone: true, hasPrompt: true }), "installed");
  assert.equal(installPath({ ...base, hasPrompt: true }), "prompt");
  assert.equal(installPath(base), "unavailable");
  assert.equal(
    installPath({
      ...base,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    }),
    "ios",
  );
  // iPadOS reports a desktop Safari user agent with touch points.
  assert.equal(
    installPath({
      ...base,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      maxTouchPoints: 5,
    }),
    "ios",
  );
});

test("navigation maps every design screen to its route", () => {
  assert.equal(activeNav("/chat", {}), "home");
  assert.equal(activeNav("/chat", { c: "id" }), "chat");
  assert.equal(activeNav("/chat", { view: "recent" }), "history");
  assert.equal(activeNav("/tasks", {}), "tasks");
  assert.equal(activeNav("/notes", {}), "notes");
  assert.equal(activeNav("/exams/abc/plan", {}), "exams");
  assert.equal(activeNav("/settings", {}), "settings");
  assert.equal(activeNav("/more", {}), "more");
  assert.equal(activeNav("/progress", {}), null);
  assert.equal(isFocusRoute("/tests/abc"), true);
  assert.equal(isFocusRoute("/exams/a/sessions/b"), true);
  assert.equal(isFocusRoute("/exams/a"), false);
});

test("history groups by Hoy, Ayer, Esta semana and Anteriores", () => {
  const now = new Date(2026, 9, 15, 12);
  const at = (days: number) =>
    new Date(2026, 9, 15 - days, 9).toISOString();
  const groups = groupByDay(
    [
      { id: "a", title: "A", updated_at: at(0) },
      { id: "b", title: "B", updated_at: at(1) },
      { id: "c", title: "C", updated_at: at(3) },
      { id: "d", title: "D", updated_at: at(30) },
      { id: "e", title: "E", updated_at: "not a date" },
    ],
    now,
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((i) => i.id)]),
    [
      ["Hoy", ["a"]],
      ["Ayer", ["b"]],
      ["Esta semana", ["c"]],
      ["Anteriores", ["d", "e"]],
    ],
  );
});

const exam = (over: Partial<DreamExam>): DreamExam => ({
  id: "exam-1",
  title: "Plan",
  subject: "Asignatura",
  exam_date: "2026-11-02",
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
  ...over,
});

test("tasks come from exam units in order, with a study link while pending", () => {
  const tasks = examsToTasks([
    exam({
      units: [
        {
          id: "u2",
          position: 1,
          title: "Segunda",
          topic: "",
          summary: "",
          estimated_minutes: 10,
          status: "completed",
          conversation_id: null,
        },
        {
          id: "u1",
          position: 0,
          title: "Primera",
          topic: "",
          summary: "",
          estimated_minutes: 10,
          status: "in_progress",
          conversation_id: null,
        },
      ],
    }),
  ]);
  assert.deepEqual(
    tasks.map((t) => [t.title, t.status, t.href, t.examId]),
    [
      ["Primera", "pending", "/exams/exam-1/study/u1", "exam-1"],
      ["Segunda", "done", null, "exam-1"],
    ],
  );
  assert.match(tasks[0].context, /^Asignatura · Examen el /);
});

test("notes come from exam materials, deduplicated, with readable status", () => {
  const material = (id: string, status: string, mime = "application/pdf") => ({
    id,
    file_name: `${id}.pdf`,
    mime_type: mime,
    size_bytes: 1,
    status,
  });
  const notes = examsToNotes([
    exam({ materials: [material("a", "processed"), material("b", "pending")] }),
    exam({
      id: "exam-2",
      materials: [material("a", "processed"), material("c", "failed", "image/png")],
    }),
  ]);
  assert.deepEqual(
    notes.map((n) => [n.id, n.status, n.kind, n.examId]),
    [
      ["a", "ready", "PDF", "exam-1"],
      ["b", "processing", "PDF", "exam-1"],
      ["c", "failed", "Imagen", "exam-2"],
    ],
  );
  assert.equal(noteKind("", "resumen.txt"), "TXT");
  assert.equal(noteKind("", "sin-extension"), "Archivo");
});

test("Ajustes shows the Google account when the profile has no name", async () => {
  const { accountIdentity } = await import("../lib/account");
  const user = {
    email: "alumna@example.test",
    user_metadata: { full_name: "Ana Pérez", name: "Ana" },
  };
  assert.deepEqual(accountIdentity(user, { email: "", display_name: "" }), {
    name: "Ana Pérez",
    email: "alumna@example.test",
  });
  assert.deepEqual(
    accountIdentity({ email: undefined, user_metadata: { name: "Ana" } }, {
      email: "perfil@example.test",
      display_name: null,
    }),
    { name: "Ana", email: "perfil@example.test" },
  );
  assert.equal(
    accountIdentity(user, { display_name: "Ana P." }).name,
    "Ana P.",
  );
});
