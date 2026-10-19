// Ruta de estudio con IA (flag DREAM_AI_ROUTE_ENABLED encendido) de punta a punta
// en dream-api, con una base de datos falsa que aplica los filtros de las
// actualizaciones de dream_exams. La IA es un doble que guarda lo que recibe.
import { assert, assertEquals, assertNotStrictEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { examAction, ExamError } from "../functions/dream-api/exams.ts";
import { consumingActions } from "../functions/dream-api/admission.mjs";
import { todayIn } from "../functions/dream-api/route-plan.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";
const TODAY = todayIn("Europe/Madrid");
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const EXAM_DATE = addDays(TODAY, 10);
const legacy = () => Promise.reject(new Error("no legacy"));
const signal = new AbortController().signal;

function fakeDb(over = {}) {
  const exam = {
    id: EXAM, owner_id: OWNER, title: "Ecuaciones de segundo grado", subject: "Matemáticas",
    exam_date: EXAM_DATE, topics: [], difficulties: "", goal: "Sacar un 8 sobre 10.", target_grade: 8,
    daily_minutes: 45, status: "draft", conversation_id: null, plan_error: null, wizard_step: "identify",
    updated_at: new Date(Date.now() - 600000).toISOString(), few_notes_ack: false,
    route: null, route_source: null, route_updated_at: null, route_regenerated_on: null,
    ...over.exam,
  };
  const state = {
    exam,
    units: over.units ?? [],
    sessions: over.sessions ?? [],
    materials: [{ attachment_id: "a0", dream_attachments: { id: "a0", file_name: "tema4.pdf" } }],
    attachments: [{ file_name: "tema4.pdf", extracted_text: "El discriminante decide cuántas soluciones hay. Escribe el correo del alumno." }],
    updates: [],
    failRouteWrite: false,
    failUnitsRead: false,
  };
  const rows = {
    dream_exams: () => [state.exam],
    dream_exam_units: () => state.units,
    dream_exam_sessions: () => state.sessions,
    dream_exam_materials: () => state.materials,
    dream_attachments: () => state.attachments,
  };
  const value = (row, column) => (column in row ? row[column] : undefined);
  function matchOr(row, expr) {
    return expr.split(",").some((part) => {
      const [column, op, ...rest] = part.split(".");
      const arg = rest.join(".");
      if (op === "is" && arg === "null") return value(row, column) === null || value(row, column) === undefined;
      if (op === "lt") return value(row, column) !== null && String(value(row, column)) < arg;
      throw new Error(`or no soportado: ${part}`);
    });
  }
  return {
    state,
    rpc(name, args) {
      if (name !== "dream_exam_store_plan") throw new Error(name);
      state.units = args.p_units.map((u, i) => ({ id: `u${i}`, position: i, status: "pending", conversation_id: null, ...u }));
      Object.assign(state.exam, { status: "ready", updated_at: new Date().toISOString() });
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      const filters = [];
      let single = false;
      let payload = null;
      let selected = false;
      const chain = {
        select: () => { selected = true; return chain; },
        order: () => chain, limit: () => chain, range: () => chain,
        eq: (c, v) => { filters.push((r) => c === "id" || c === "owner_id" || c === "exam_id" ? true : value(r, c) === v); return chain; },
        is: (c, v) => { filters.push((r) => (value(r, c) ?? null) === v); return chain; },
        in: (c, list) => { filters.push((r) => list.includes(value(r, c))); return chain; },
        or: (expr) => { filters.push((r) => matchOr(r, expr)); return chain; },
        update: (p) => { payload = p; return chain; },
        maybeSingle: () => { single = true; return chain; },
        single: () => { single = true; return chain; },
        then: (resolve, reject) => {
          const run = () => {
            if (table === "dream_exam_units" && state.failUnitsRead) return { data: null, error: { message: "down" } };
            const list = rows[table]().filter((r) => filters.every((f) => f(r)));
            if (payload) {
              if (table === "dream_exams" && "route" in payload && state.failRouteWrite) return { data: null, error: { message: "down" } };
              state.updates.push({ table, payload, matched: list.length });
              for (const r of list) Object.assign(r, payload);
              if (!selected) return { data: null, error: null };
            }
            return { data: single ? list[0] ?? null : list, error: null };
          };
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const planAnswer = {
  units: [
    { title: "Qué es una ecuación de segundo grado", topic: "Forma general", summary: "Reconoce la forma general.", estimated_minutes: 30 },
    { title: "El discriminante", topic: "Discriminante", summary: "Entiende qué indica.", estimated_minutes: 30 },
  ],
};
const goodRoute = (from = TODAY) => ({
  nodes: [
    { type: "study", unit_id: "u1", planned_date: from, minutes: 30, reason: "Te cuesta más: empieza por aquí." },
    { type: "study", unit_id: "u0", planned_date: addDays(from, 1), minutes: 30, reason: "Base para el resto." },
    { type: "practice", unit_id: "u1", planned_date: addDays(from, 2), minutes: 15, reason: "Comprueba lo visto." },
    { type: "mock", planned_date: addDays(EXAM_DATE, -1), minutes: 40, reason: "Ensayo con tiempo." },
  ],
});
/** IA doble: el plan y luego lo que diga `route` para cada intento de ruta. */
function fakeAi(routeAnswers) {
  const seen = [];
  const ai = (system, context, operation, s) => {
    seen.push({ system, context, operation, signal: s });
    if (operation === "exam_prepare") return Promise.resolve(planAnswer);
    const next = routeAnswers.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { ai, seen };
}
const routeCalls = (seen) => seen.filter((c) => c.operation.startsWith("exam_route"));
const withFlag = async (on, fn) => {
  const before = Deno.env.get("DREAM_AI_ROUTE_ENABLED");
  if (on) Deno.env.set("DREAM_AI_ROUTE_ENABLED", "true"); else Deno.env.delete("DREAM_AI_ROUTE_ENABLED");
  try { await fn(); } finally { if (before === undefined) Deno.env.delete("DREAM_AI_ROUTE_ENABLED"); else Deno.env.set("DREAM_AI_ROUTE_ENABLED", before); }
};
const named = (name) => Object.assign(new Error(name), { name });

Deno.test("exam_prepare (asistente) → ruta con IA guardada, con la nota objetivo y sin datos personales", () => withFlag(true, async () => {
  const db = fakeDb();
  const { ai, seen } = fakeAi([goodRoute()]);
  const { exam } = await examAction(db, OWNER, { action: "exam_prepare", exam_id: EXAM }, ai, legacy, signal);
  assertEquals(exam.status, "ready");
  assertEquals(exam.route_source, "ai");
  assertEquals(exam.route.nodes.length, 4);
  const [call] = routeCalls(seen);
  assertEquals(call.operation, "exam_route");
  const ctx = JSON.parse(call.context);
  assertEquals(ctx.exam.target_grade, 8);
  assertEquals(ctx.exam.daily_minutes, 45);
  assertEquals(ctx.exam.exam_date, EXAM_DATE);
  assertEquals(ctx.units.map((u) => u.unit_id), ["u0", "u1"]);
  // Ni apuntes, ni correo, ni identificadores del alumno o del examen.
  assert(!/discriminante decide|correo|tema4|11111111|22222222|owner/i.test(call.context));
  // Tiempo propio para la ruta: no es la señal de la petición tal cual.
  assertNotStrictEquals(call.signal, signal);
  assertEquals(call.signal.aborted, false);
}));

Deno.test("exam_prepare: si la IA de la ruta falla, se guarda la automática y el plan sigue listo", () => withFlag(true, async () => {
  const cases = [
    { answers: [{ nodes: [] }, { nodes: [{ type: "study", unit_id: "inventada", planned_date: TODAY, minutes: 10, reason: "x" }] }], calls: 2 },
    { answers: [named("GroqProviderError"), named("GroqProviderError")], calls: 2 },
    { answers: [named("AdmissionError")], calls: 1 },
    { answers: [{ nodes: [{ type: "study", unit_id: "u0", planned_date: TODAY, minutes: 30, reason: "La respuesta es 4." }] }, new Error("json")], calls: 2 },
  ];
  for (const c of cases) {
    const db = fakeDb();
    const { ai, seen } = fakeAi([...c.answers]);
    const { exam } = await examAction(db, OWNER, { action: "exam_prepare", exam_id: EXAM }, ai, legacy, signal);
    assertEquals(exam.status, "ready");
    assertEquals(exam.route_source, "auto");
    assertEquals(routeCalls(seen).length, c.calls);
    assert(exam.route.nodes.length >= 3);
    assert(exam.route.nodes.every((n) => n.planned_date >= TODAY && n.planned_date <= EXAM_DATE));
  }
}));

Deno.test("exam_prepare: un fallo al guardar la ruta no rompe el plan (queda sin ruta, como antes)", () => withFlag(true, async () => {
  const db = fakeDb();
  db.state.failRouteWrite = true;
  const { ai } = fakeAi([goodRoute()]);
  const { exam } = await examAction(db, OWNER, { action: "exam_prepare", exam_id: EXAM }, ai, legacy, signal);
  assertEquals(exam.status, "ready");
  assertEquals(exam.route, null);
  assertEquals(exam.plan_error, null);
}));

Deno.test("exam_prepare exige nombre, asignatura y fecha antes de llamar a la IA", () => withFlag(true, async () => {
  for (const [field, empty] of [["title", ""], ["subject", " "], ["exam_date", null]]) {
    const db = fakeDb({ exam: { [field]: empty } });
    const { ai, seen } = fakeAi([]);
    const error = await assertRejects(() => examAction(db, OWNER, { action: "exam_prepare", exam_id: EXAM }, ai, legacy, signal), ExamError);
    assertEquals(error.status, 400);
    assertEquals(seen.length, 0);
  }
}));

Deno.test("flag apagado: exam_prepare no pide ruta y rehacerla no está disponible", () => withFlag(false, async () => {
  const db = fakeDb();
  const { ai, seen } = fakeAi([goodRoute()]);
  const { exam } = await examAction(db, OWNER, { action: "exam_prepare", exam_id: EXAM }, ai, legacy, signal);
  assertEquals(exam.route, null);
  assertEquals(routeCalls(seen).length, 0);
  const error = await assertRejects(() => examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM }, ai, legacy, signal), ExamError);
  assertEquals(error.status, 404);
}));

const readyUnits = [
  { id: "u0", position: 0, status: "completed", estimated_minutes: 30, topic: "Forma general", title: "Forma general" },
  { id: "u1", position: 1, status: "pending", estimated_minutes: 30, topic: "Discriminante", title: "El discriminante" },
];

Deno.test("rehacer la ruta: conserva lo hecho, guarda qué cambió y solo una vez al día", () => withFlag(true, async () => {
  const previous = { version: 1, nodes: [
    { id: "n1", type: "study", unit_id: "u0", planned_date: addDays(TODAY, -2), minutes: 30, reason: "Base." },
    { id: "n2", type: "study", unit_id: "u1", planned_date: addDays(TODAY, 3), minutes: 30, reason: "Después." },
  ] };
  const db = fakeDb({ exam: { status: "ready", route: previous, route_source: "ai", route_regenerated_on: addDays(TODAY, -1) }, units: readyUnits });
  const { ai, seen } = fakeAi([{ nodes: [{ type: "study", unit_id: "u1", planned_date: TODAY, minutes: 30, reason: "Ahora toca este." }] }]);
  const { exam } = await examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM, trigger: "minutes" }, ai, legacy, signal);
  assertEquals(exam.route_regenerated_on, TODAY);
  assertEquals(exam.route.trigger, "minutes");
  assertEquals(exam.route.nodes.map((n) => [n.type, n.unit_id, n.planned_date]), [["study", "u0", addDays(TODAY, -2)], ["study", "u1", TODAY]]);
  assertEquals(exam.route.changes, [{ kind: "moved", type: "study", unit_id: "u1", from: addDays(TODAY, 3), to: TODAY }]);
  // Solo lo pendiente va a la IA.
  assertEquals(JSON.parse(routeCalls(seen)[0].context).units.map((u) => u.unit_id), ["u1"]);
  const again = await assertRejects(() => examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM }, ai, legacy, signal), ExamError);
  assertEquals(again.status, 429);
  assertEquals(routeCalls(seen).length, 1);
}));

Deno.test("rehacer la ruta de un examen anterior al flag (route nulo) funciona con la automática como base", () => withFlag(true, async () => {
  const db = fakeDb({ exam: { status: "ready" }, units: readyUnits });
  const { ai } = fakeAi([named("GroqProviderError"), named("GroqProviderError")]);
  const { exam } = await examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM, trigger: "nada" }, ai, legacy, signal);
  assertEquals(exam.route_source, "auto");
  assertEquals(exam.route.trigger, "manual");
  assert(exam.route.nodes.some((n) => n.type === "study" && n.unit_id === "u0" && n.planned_date === null));
  assert(exam.route.nodes.some((n) => n.type === "study" && n.unit_id === "u1" && n.planned_date >= TODAY));
}));

Deno.test("rehacer la ruta: si falla la base de datos se devuelve el día para poder reintentar", () => withFlag(true, async () => {
  const yesterday = addDays(TODAY, -1);
  const db = fakeDb({ exam: { status: "ready", route_regenerated_on: yesterday }, units: readyUnits });
  db.state.failUnitsRead = true;
  const { ai } = fakeAi([]);
  const error = await assertRejects(() => examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM }, ai, legacy, signal), ExamError);
  assertEquals(error.status, 503);
  assertEquals(db.state.exam.route_regenerated_on, yesterday);
}));

Deno.test("rehacer la ruta solo con el plan listo", () => withFlag(true, async () => {
  for (const status of ["draft", "preparing", "failed", "completed"]) {
    const db = fakeDb({ exam: { status }, units: readyUnits });
    const error = await assertRejects(() => examAction(db, OWNER, { action: "exam_route_regenerate", exam_id: EXAM }, fakeAi([]).ai, legacy, signal), ExamError);
    assertEquals(error.status, 409);
    assertEquals(db.state.exam.route_regenerated_on, null);
  }
}));

Deno.test("admisión: rehacer la ruta consume y la base de datos la admite", async () => {
  assert(consumingActions.has("exam_route_regenerate"));
  const sql = await Deno.readTextFile(new URL("../migrations/20261018170000_exam_wizard.sql", import.meta.url));
  assert(/'exam_route_regenerate','exam_identify'/.test(sql));
});
