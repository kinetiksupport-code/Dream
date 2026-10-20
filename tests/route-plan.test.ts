import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  addDays,
  diffRoutes,
  fallbackRoute,
  looksLikeSolution,
  mergeRoute,
  minutesByDay,
  planRouteWithRetry,
  routeContext,
  routeProgress,
  targetGrade,
  validateAiRoute,
  ROUTE_SYSTEM_PROMPT,
  type RouteNode,
} from "../supabase/functions/dream-api/route-plan.mjs";
import {
  buildRoute,
  dayLabel,
  nearestExam,
  paceStatus,
  topicMastery,
} from "../lib/study-path";
import type { DreamExam, ExamUnit } from "../lib/exam-plans";

const TODAY = "2026-10-16"; // viernes
const unit = (
  i: number,
  status: ExamUnit["status"] = "pending",
  minutes = 20,
): ExamUnit => ({
  id: `u${i}`,
  position: i,
  title: `Tema ${i + 1}`,
  topic: `Tópico ${i + 1}`,
  summary: "Resumen",
  estimated_minutes: minutes,
  status,
  conversation_id: null,
});
const five = () => [0, 1, 2, 3, 4].map((i) => unit(i));

// ------------------------------------------------------------ Calendario de respaldo
test("respaldo: orden por posición, práctica cada tres temas, repaso y simulacro al final", () => {
  const units = five().reverse();
  const route = fallbackRoute({
    units,
    examDate: "2026-10-30",
    dailyMinutes: 30,
    today: TODAY,
  });
  assert.deepEqual(
    route.nodes.map((n) => `${n.type}:${n.unit_id ?? "-"}`),
    [
      "study:u0",
      "study:u1",
      "study:u2",
      "practice:u2",
      "study:u3",
      "study:u4",
      "practice:u4",
      "review:-",
      "mock:-",
    ],
  );
  // El simulacro el día antes del examen y el repaso el anterior.
  assert.equal(route.nodes.at(-1)!.planned_date, "2026-10-29");
  assert.equal(route.nodes.at(-2)!.planned_date, "2026-10-28");
  // Nunca pasa de los minutos diarios.
  for (const [, total] of minutesByDay(route.nodes)) assert.ok(total <= 30);
  assert.equal(route.nodes[0].planned_date, TODAY);
  // Es determinista.
  assert.deepEqual(
    route,
    fallbackRoute({
      units: five(),
      examDate: "2026-10-30",
      dailyMinutes: 30,
      today: TODAY,
    }),
  );
});

test("respaldo: lo completado queda sin fecha y lo pendiente empieza hoy", () => {
  const units = [unit(0, "completed"), unit(1, "completed"), unit(2)];
  const route = fallbackRoute({
    units,
    sessions: [{ mode: "practice", status: "completed" }],
    examDate: "2026-10-25",
    dailyMinutes: 20,
    today: TODAY,
  });
  const done = routeProgress(route.nodes, units, [
    { mode: "practice", status: "completed" },
  ]);
  assert.deepEqual(done.slice(0, 2), [true, true]);
  assert.equal(route.nodes[0].planned_date, null);
  assert.equal(route.nodes[2].planned_date, TODAY);
});

test("respaldo: sin días suficientes, todo cabe en hoy o en el último día", () => {
  const route = fallbackRoute({
    units: five(),
    examDate: addDays(TODAY, 1),
    dailyMinutes: 20,
    today: TODAY,
  });
  assert.ok(route.nodes.every((n) => n.planned_date === TODAY));
  const noDate = fallbackRoute({
    units: five(),
    examDate: null,
    dailyMinutes: 20,
    today: TODAY,
  });
  assert.equal(noDate.nodes[0].planned_date, TODAY);
  assert.ok(noDate.nodes.every((n) => n.planned_date! >= TODAY));
});

// ------------------------------------------------------------ Frase de ritmo
test("ritmo: bien, justo y tarde según minutos pendientes y disponibles", () => {
  const units = five(); // 100 min pendientes
  const at = (days: number, daily: number) =>
    paceStatus({
      units,
      examDate: addDays(TODAY, days),
      dailyMinutes: daily,
      today: TODAY,
    });
  assert.equal(at(10, 20).message, "Vas bien"); // 200 disponibles
  assert.equal(at(5, 20).message, "Vas justo"); // 100 disponibles
  const late = at(2, 20); // 40 disponibles
  assert.equal(late.message, "Vas tarde, conviene subir los minutos diarios");
  assert.equal(late.suggestedMinutes, 50);
  assert.equal(at(0, 20).kind, "today");
  assert.equal(at(-1, 20).kind, "past");
  assert.equal(
    paceStatus({ units, examDate: "", dailyMinutes: 20, today: TODAY })
      .message,
    "Pon la fecha de tu examen",
  );
  assert.equal(
    paceStatus({
      units: [unit(0, "completed")],
      examDate: "2026-12-01",
      dailyMinutes: 20,
      today: TODAY,
    }).kind,
    "done",
  );
});

test("cuándo toca: «Hoy», «Mañana» y «Jue 22»", () => {
  assert.equal(dayLabel(TODAY, TODAY), "Hoy");
  assert.equal(dayLabel("2026-10-17", TODAY), "Mañana");
  assert.equal(dayLabel("2026-10-22", TODAY), "Jue 22");
  assert.equal(dayLabel(null, TODAY), "");
});

// ------------------------------------------------------------ Validador de la IA
const ctx = {
  units: [unit(0), unit(1)],
  today: TODAY,
  examDate: "2026-10-20",
  dailyMinutes: 30,
};
const good = {
  nodes: [
    { type: "study", unit_id: "u1", planned_date: TODAY, minutes: 20, reason: "Es lo que más te cuesta." },
    { type: "study", unit_id: "u0", planned_date: "2026-10-17", minutes: 20, reason: "Base para lo demás." },
    { type: "practice", unit_id: "u1", planned_date: "2026-10-17", minutes: 10, reason: "Comprueba el tema 2." },
    { type: "review", planned_date: "2026-10-18", minutes: 15, reason: "Repaso espaciado." },
    { type: "mock", planned_date: "2026-10-19", minutes: 30, reason: "Ensayo final." },
  ],
};
const bad = (patch: (n: typeof good.nodes) => unknown) => {
  const copy = structuredClone(good.nodes);
  const out = patch(copy);
  return validateAiRoute(out === undefined ? { nodes: copy } : out, ctx);
};

test("validador: acepta una ruta correcta y la normaliza", () => {
  const r = validateAiRoute(good, ctx);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.nodes.length, 5);
    assert.equal(r.nodes[0].id, "n1");
    assert.equal(r.nodes[3].unit_id, undefined);
  }
  // Tolerancia del 10 %: 33 min en un día de 30 es válido.
  assert.equal(
    bad((n) => {
      n[1].minutes = 23;
    }).ok,
    true,
  );
});

test("validador: rechaza esquemas, unidades inventadas o ausentes, fechas y sobrecarga", () => {
  const errors = (r: ReturnType<typeof validateAiRoute>): string =>
    r.ok ? "" : r.errors.join(" ");
  assert.equal(validateAiRoute(null, ctx).ok, false);
  assert.equal(validateAiRoute({ nodes: [] }, ctx).ok, false);
  assert.equal(validateAiRoute([good], ctx).ok, false);
  assert.match(errors(bad((n) => { n[0].type = "game"; })), /type/);
  assert.match(errors(bad((n) => { n[0].unit_id = "u9"; })), /unknown_unit/);
  assert.match(errors(bad((n) => { n.splice(1, 1); })), /missing_unit:u0/);
  assert.match(errors(bad((n) => { n[3].planned_date = "2026-10-15"; })), /date_range/);
  assert.match(errors(bad((n) => { n[4].planned_date = "2026-10-21"; })), /date_range/);
  assert.match(errors(bad((n) => { n[0].planned_date = "2026-02-30"; })), /date/);
  assert.match(errors(bad((n) => { n[2].planned_date = TODAY; n[2].minutes = 5; })), /order/);
  assert.match(errors(bad((n) => { n[1].minutes = 40; })), /overload:2026-10-17/);
  assert.match(errors(bad((n) => { n[0].minutes = 2.5; })), /minutes/);
  assert.match(errors(bad((n) => { n[0].reason = "x".repeat(200); })), /reason/);
  const studyCompleted = validateAiRoute(good, {
    ...ctx,
    units: [unit(0), unit(1, "completed")],
  });
  assert.match(errors(studyCompleted), /study_completed_unit/);
});

test("validador: los motivos nunca traen soluciones de ejercicios", () => {
  for (const reason of [
    "La respuesta es 42.",
    "Solución: despeja la x.",
    "El resultado es 3/4.",
    "Recuerda que x = 5 en el ejercicio 2.",
    "2 + 2 = 4",
    "Respuesta: b",
  ]) {
    assert.equal(looksLikeSolution(reason), true, reason);
    assert.equal(bad((n) => { n[0].reason = reason; }).ok, false, reason);
  }
  assert.equal(looksLikeSolution("Empieza por lo que más pesa en el examen."), false);
});

// ------------------------------------------------------------ Regeneración
test("regenerar conserva los nodos completados y solo reordena lo pendiente", () => {
  const prev: RouteNode[] = [
    { id: "n1", type: "study", unit_id: "u0", planned_date: "2026-10-10", minutes: 20, reason: "a" },
    { id: "n2", type: "practice", unit_id: "u0", planned_date: "2026-10-11", minutes: 10, reason: "b" },
    { id: "n3", type: "study", unit_id: "u1", planned_date: "2026-10-17", minutes: 20, reason: "c" },
    { id: "n4", type: "mock", planned_date: "2026-10-19", minutes: 30, reason: "d" },
  ];
  const units = [unit(0, "completed"), unit(1)];
  const done = routeProgress(prev, units, [{ mode: "practice", status: "completed" }]);
  assert.deepEqual(done, [true, true, false, false]);
  const pending: RouteNode[] = [
    { id: "x", type: "study", unit_id: "u1", planned_date: TODAY, minutes: 20, reason: "c" },
    { id: "y", type: "mock", planned_date: "2026-10-18", minutes: 30, reason: "d" },
  ];
  const merged = mergeRoute(prev, done, pending);
  assert.deepEqual(
    merged.map((n) => [n.id, n.type, n.planned_date]),
    [
      ["n1", "study", "2026-10-10"],
      ["n2", "practice", "2026-10-11"],
      ["n3", "study", TODAY],
      ["n4", "mock", "2026-10-18"],
    ],
  );
  assert.deepEqual(diffRoutes(prev, merged), [
    { kind: "moved", type: "study", unit_id: "u1", from: "2026-10-17", to: TODAY },
    { kind: "moved", type: "mock", from: "2026-10-19", to: "2026-10-18" },
  ]);
});

// ------------------------------------------------------------ Privacidad del contexto
test("el contexto de la IA solo lleva datos del examen y del progreso", () => {
  const exam = {
    title: "Álgebra",
    subject: "Matemáticas",
    exam_date: "2026-10-30",
    daily_minutes: 20,
    difficulties: "Los signos",
    goal: "Aprobar",
    owner_id: "66666666-6666-4666-8666-666666666666",
    email: "lucia@example.com",
    display_name: "Lucía",
    conversation_id: "33333333-3333-4333-8333-333333333333",
  };
  const text = routeContext(exam, [{ ...unit(0), conversation_id: "c-1", summary: "secreto" } as ExamUnit], [{ topic: "Tópico 1", percentage: 50, tests: 2 }], TODAY);
  assert.doesNotMatch(text, /lucia|Lucía|66666666|33333333|c-1|secreto/);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ["exam", "units", "results_by_topic"]);
  assert.deepEqual(Object.keys(parsed.units[0]), ["unit_id", "topic", "minutes", "status"]);
  assert.match(ROUTE_SYSTEM_PROMPT, /daily_minutes/);
  assert.match(ROUTE_SYSTEM_PROMPT, /simulacro|mock/);
});

test("la nota objetivo del asistente llega a la IA como número y nada más", () => {
  const exam = { title: "Álgebra", subject: "Matemáticas", exam_date: "2026-10-30", daily_minutes: 45, difficulties: "", goal: "Sacar un 7,5 sobre 10." };
  const ctx = (target_grade: unknown) =>
    JSON.parse(routeContext({ ...exam, target_grade } as Parameters<typeof routeContext>[0], [unit(0)], [], TODAY)).exam;
  assert.equal(ctx(7.5).target_grade, 7.5);
  assert.equal(ctx("8.0").target_grade, 8);
  for (const bad of [null, undefined, "", 11, -1, 7.3, "siete", Number.NaN]) assert.equal(ctx(bad).target_grade, null);
  assert.equal(targetGrade(10), 10);
  assert.deepEqual(Object.keys(ctx(7.5)), ["title", "subject", "today", "exam_date", "daily_minutes", "difficulties", "goal", "target_grade"]);
  assert.match(ROUTE_SYSTEM_PROMPT, /target_grade/);
  assert.match(ROUTE_SYSTEM_PROMPT, /Nunca incluyas soluciones/);
});

// ------------------------------------------------------------ Vista del camino
const exam = (over: Partial<DreamExam> = {}): DreamExam => ({
  id: "e1",
  title: "Álgebra",
  subject: "Matemáticas",
  exam_date: "2026-10-30",
  topics: [],
  difficulties: "",
  goal: "",
  daily_minutes: 30,
  status: "ready",
  conversation_id: null,
  plan_error: null,
  materials: [],
  sessions: [],
  units: [unit(0, "completed"), unit(1, "in_progress"), unit(2), unit(3)],
  ...over,
});

test("vista: estados, bloqueo suave, simulacro y fuente de la ruta", () => {
  const view = buildRoute(exam(), TODAY);
  assert.equal(view.source, "auto");
  assert.deepEqual(
    view.nodes.map((n) => n.state),
    ["completed", "next", "pending", "pending", "pending", "pending", "pending", "pending"],
  );
  assert.equal(view.next?.title, "Tema 2");
  assert.equal(view.nodes[2].before?.title, "Tema 2");
  assert.equal(view.nodes[1].before, null);
  assert.equal(view.nodes[0].when, "");
  assert.equal(view.nodes[1].when, "Hoy");
  assert.equal(view.mockHighlighted, false);
  assert.equal(buildRoute(exam({ exam_date: "2026-10-18" }), TODAY).mockHighlighted, true);
  const ai = buildRoute(
    exam({
      route_source: "ai",
      route: { version: 1, nodes: [{ id: "n1", type: "study", unit_id: "u3", planned_date: TODAY, minutes: 20, reason: "r" }] },
    }),
    TODAY,
  );
  assert.equal(ai.source, "ai");
  assert.equal(ai.nodes.length, 1);
});

test("dominio por tema: media de tests terminados de ese tema", () => {
  const units = [unit(0), unit(1)];
  const m = topicMastery(units, [
    { id: "s1", mode: "practice", status: "completed", started_at: "", submitted_at: "", unit_id: "u0", percentage: 60 },
    { id: "s2", mode: "practice", status: "completed", started_at: "", submitted_at: "", unit_id: "u0", percentage: 81 },
    { id: "s3", mode: "practice", status: "active", started_at: "", submitted_at: null, unit_id: "u1", percentage: null },
  ]);
  assert.deepEqual(m.get("Tópico 1"), { percentage: 71, tests: 2 });
  assert.equal(m.get("Tópico 2"), undefined);
});

test("Inicio: elige el examen listo más cercano que no ha pasado", () => {
  const list = [
    { id: "a", exam_date: "2026-11-30", status: "ready" as const },
    { id: "b", exam_date: "2026-10-01", status: "ready" as const },
    { id: "c", exam_date: "2026-10-20", status: "ready" as const },
    { id: "d", exam_date: "2026-10-18", status: "completed" as const },
  ];
  assert.equal(nearestExam(list, TODAY)?.id, "c");
  assert.equal(nearestExam([], TODAY), null);
});

test("progreso: una práctica cuenta para su tema; sin unit_id, por orden", () => {
  const nodes = [
    { type: "practice" as const, unit_id: "u0" },
    { type: "practice" as const, unit_id: "u2" },
    { type: "review" as const },
  ];
  const units = [unit(0), unit(1), unit(2)];
  assert.deepEqual(
    routeProgress(nodes, units, [
      { mode: "practice", status: "completed", unit_id: "u2" },
    ]),
    [false, true, false],
  );
  assert.deepEqual(
    routeProgress(nodes, units, [
      { mode: "practice", status: "completed" },
      { mode: "practice", status: "active" },
    ]),
    [true, false, false],
  );
});

// ------------------------------------------------------------ Backend (sin desplegar)
test("migración: columnas de la ruta, restricciones y solo lectura para el alumno", () => {
  const sql = readFileSync("supabase/migrations/20261016120000_exam_ai_route.sql", "utf8");
  for (const column of ["route jsonb", "route_source text", "route_updated_at timestamptz", "route_regenerated_on date"])
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  assert.match(sql, /route_source in \('ai', 'auto'\)/);
  assert.match(sql, /revoke insert, update, delete on public.dream_exams from anon, authenticated/);
});

test("dream-api: la ruta con IA va detrás de un flag apagado y con límite diario", () => {
  const code = readFileSync("supabase/functions/dream-api/exams.ts", "utf8");
  assert.match(code, /Deno\.env\.get\('DREAM_AI_ROUTE_ENABLED'\)==='true'/);
  assert.match(code, /if\(routeEnabled\(\)\)await storeInitialRoute/);
  assert.match(code, /if\(!routeEnabled\(\)\)throw new ExamError/);
  assert.match(code, /route_regenerated_on\.is\.null,route_regenerated_on\.lt\./);
  assert.match(code, /PARTE G/);
  // El contexto de la ruta nunca lee materiales, conversaciones ni el perfil.
  const route = code.slice(code.indexOf("// ---------------------------------------------------------------- Ruta con IA"));
  assert.doesNotMatch(route, /dream_attachments|dream_conversations|dream_profiles|email|display_name|examContext/);
});

test("IA: valida, reintenta una vez y cae a la ruta automática", async () => {
  const examRow = { title: "Álgebra", subject: "Matemáticas", exam_date: "2026-10-20", daily_minutes: 30, difficulties: "", goal: "" };
  const units = [unit(0), unit(1)];
  const asks: string[] = [];
  const run = (answers: unknown[]) =>
    planRouteWithRetry({
      exam: examRow,
      units,
      today: TODAY,
      ask: async (_s, _c, op) => {
        asks.push(op);
        const a = answers.shift();
        if (a instanceof Error) throw a;
        return a;
      },
    });
  let r = await run([good]);
  assert.deepEqual([r.source, r.attempts, r.nodes.length], ["ai", 1, 5]);
  r = await run([{ nodes: [] }, good]);
  assert.deepEqual([r.source, r.attempts], ["ai", 2]);
  assert.deepEqual(asks.slice(-2), ["exam_route", "exam_route_retry"]);
  r = await run([{ nodes: [] }, { nodes: [{ type: "study", unit_id: "inventada" }] }]);
  assert.equal(r.source, "auto");
  assert.equal(r.attempts, 2);
  assert.ok(r.nodes.every((n) => n.planned_date && n.planned_date >= TODAY));
  const limit = Object.assign(new Error("dream_budget"), { name: "AdmissionError" });
  r = await run([limit, good]);
  assert.deepEqual([r.source, r.attempts], ["auto", 1]);
});
