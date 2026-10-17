import { test } from "node:test";
import assert from "node:assert/strict";
import {
  greetingFor,
  homeContext,
  homeTopic,
  suggestionPrompt,
  upcomingExam,
} from "../lib/home-context";

const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m);

test("greeting follows the local time band and uses the first name", () => {
  assert.equal(greetingFor(at(9), "Alex García"), "Buenos días, Alex");
  assert.equal(greetingFor(at(12, 59), "Alex"), "Buenos días, Alex");
  assert.equal(greetingFor(at(13), "Alex"), "Buenas tardes, Alex");
  assert.equal(greetingFor(at(19, 59), "Alex"), "Buenas tardes, Alex");
  assert.equal(greetingFor(at(20), "Alex"), "Buenas noches, Alex");
  assert.equal(greetingFor(at(16), ""), "Buenas tardes");
  assert.equal(greetingFor(at(16), "   "), "Buenas tardes");
});

test("upcoming exam is the nearest one today or later, never a past or completed one", () => {
  const now = new Date(2026, 9, 15, 10);
  const exams = [
    { id: "past", status: "ready", exam_date: "2026-10-10" },
    { id: "done", status: "completed", exam_date: "2026-10-16" },
    { id: "far", status: "ready", exam_date: "2026-11-30" },
    { id: "near", status: "preparing", exam_date: "2026-10-27" },
  ] as const;
  assert.equal(upcomingExam(exams, now)?.id, "near");
  assert.equal(upcomingExam([], now), null);
});

test("context names the next pending unit and the days left", () => {
  const now = new Date(2026, 9, 15, 18);
  const exam = {
    subject: "Matemáticas",
    exam_date: "2026-10-27",
    status: "ready" as const,
    units: [
      { title: "Factorización", position: 2, status: "pending" as const },
      { title: "Álgebra", position: 0, status: "completed" as const },
      { title: "Ecuaciones", position: 1, status: "in_progress" as const },
    ],
  };
  assert.deepEqual(homeContext(exam, now), {
    days: 12,
    subject: "Matemáticas",
    unit: "Ecuaciones",
  });
  assert.equal(
    homeContext({ ...exam, units: [] }, now)?.unit,
    null,
    "no units: days only",
  );
  assert.equal(homeContext({ ...exam, exam_date: "2026-10-01" }, now), null);
  assert.equal(homeContext({ ...exam, status: "completed" }, now), null);
});

test("suggestions fill the box with a useful start and never ask for the solution", () => {
  assert.equal(
    suggestionPrompt("practice", "Ecuaciones"),
    "Quiero practicar ejercicios de Ecuaciones. Dame pistas, no la solución.",
  );
  assert.equal(suggestionPrompt("practice"), "Quiero practicar ejercicios de ");
  assert.equal(
    suggestionPrompt("test", "Ecuaciones"),
    "Hazme un test de 5 preguntas sobre Ecuaciones.",
  );
  assert.equal(suggestionPrompt("test"), "Hazme un test de 5 preguntas sobre ");
  assert.equal(homeTopic(null), "");
  assert.equal(
    homeTopic({ days: 3, subject: "Física", unit: null }),
    "Física",
  );
});
