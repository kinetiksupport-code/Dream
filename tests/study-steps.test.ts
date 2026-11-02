// Ruta rediseñada (Entrega 0): flag, qué se ve en el camino, dominio y piezas.
import test from "node:test";
import assert from "node:assert/strict";
import { clockText, masteryOf, stepGroups, studyStepsEnabled, subjectPiece } from "../lib/study-steps";

test("flag: apagado en producción salvo que se encienda; encendido en vistas previas", () => {
  assert.equal(studyStepsEnabled(undefined, "production"), false);
  assert.equal(studyStepsEnabled("true", "production"), true);
  assert.equal(studyStepsEnabled(undefined, "preview"), true);
  assert.equal(studyStepsEnabled(undefined, "development"), true);
  assert.equal(studyStepsEnabled("false", "preview"), false);
});

const node = (key: string, state: string, type: "study" | "practice" | "review" | "mock" = "study") => ({ key, state, type });
test("camino: hechos plegados, el actual, N siguientes, «+N» y el simulacro final siempre", () => {
  const nodes = [
    node("a", "completed"), node("b", "completed"), node("c", "next", "practice"),
    node("d", "pending"), node("e", "pending"), node("f", "pending"), node("g", "pending"), node("h", "pending"),
    node("z", "pending", "mock"),
  ];
  const g = stepGroups(nodes, nodes[2], 3);
  assert.deepEqual(g.done.map((n) => n.key), ["a", "b"]);
  assert.equal(g.current?.key, "c");
  assert.deepEqual(g.upcoming.map((n) => n.key), ["d", "e", "f"]);
  assert.deepEqual(g.hidden.map((n) => n.key), ["g", "h"]);
  assert.equal(g.final?.key, "z");
});
test("camino: sin «siguiente» del servidor, el primero sin hacer; todo hecho, solo el final", () => {
  const nodes = [node("a", "completed"), node("b", "pending"), node("z", "pending", "mock")];
  assert.equal(stepGroups(nodes, null).current?.key, "b");
  const all = [node("a", "completed"), node("z", "pending", "mock")];
  const g = stepGroups(all, all[1]);
  assert.equal(g.current, null);
  assert.equal(g.final?.key, "z");
});

test("dominio: media de los tests terminados; sin datos, null (no se pinta)", () => {
  assert.equal(masteryOf([]), null);
  assert.equal(masteryOf([{ status: "active", percentage: 90 }]), null);
  assert.equal(masteryOf([{ status: "completed", percentage: 85 }, { status: "completed", percentage: 60 }]), 73);
});

test("pieza de la asignatura, con tildes y sin reconocer", () => {
  assert.equal(subjectPiece("Historia de España"), "historia");
  assert.equal(subjectPiece("Matemáticas II"), "matematicas");
  assert.equal(subjectPiece("Física y Química"), "quimica");
  assert.equal(subjectPiece("Educación Física"), "edfisica");
  assert.equal(subjectPiece("Inglés"), "idiomas");
  assert.equal(subjectPiece("Cocina"), "leer");
});

test("reloj discreto: minutos hasta el último minuto", () => {
  assert.equal(clockText(1800), "30 min");
  assert.equal(clockText(61), "2 min");
  assert.equal(clockText(60), "1:00");
  assert.equal(clockText(45), "0:45");
  assert.equal(clockText(0), "0:00");
});
