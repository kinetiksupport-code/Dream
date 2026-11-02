// FSRS-5 (Bloque 4): intervalos, reinicio tras «Otra vez» y fechas.
import test from "node:test";
import assert from "node:assert/strict";
import { humanInterval, intervalDays, previewIntervals, retrievability, schedule } from "../lib/srs";

const NOW = new Date("2026-11-02T10:00:00+01:00");
const fresh = { stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 0, last_review: null };
const day = 86400000;

test("una tarjeta nueva: los cuatro botones dan intervalos crecientes", () => {
  const due = [1, 2, 3, 4].map((g) => new Date(schedule(fresh, g as 1, NOW).due).getTime() - NOW.getTime());
  assert.equal(due[0], 10 * 60000, "Otra vez: 10 min");
  assert.ok(due[1] >= day && due[1] <= due[2] && due[2] < due[3], due.join(","));
  assert.equal(schedule(fresh, 3, NOW).state, 2);
  assert.equal(schedule(fresh, 1, NOW).state, 1);
});

test("con buenos repasos el intervalo crece; «Otra vez» lo reinicia y cuenta un fallo", () => {
  let card = { ...fresh, ...schedule(fresh, 3, NOW) };
  const gaps: number[] = [];
  let t = NOW;
  for (let i = 0; i < 4; i++) {
    t = new Date(card.due);
    const next = schedule(card, 3, t);
    gaps.push((new Date(next.due).getTime() - t.getTime()) / day);
    card = { ...card, ...next };
  }
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], gaps.join(","));
  const lapse = schedule(card, 1, new Date(card.due));
  assert.equal(lapse.lapses, card.lapses + 1);
  assert.equal(lapse.state, 3);
  assert.ok(lapse.stability < card.stability);
  assert.equal(new Date(lapse.due).getTime() - new Date(card.due).getTime(), 10 * 60000);
});

test("retención: más alta, intervalos más cortos; con R = 0,9 el intervalo es S", () => {
  assert.equal(intervalDays(10, 0.9), 10);
  assert.ok(intervalDays(10, 0.95) < intervalDays(10, 0.8));
  assert.equal(intervalDays(10, 0.5), intervalDays(10, 0.8), "se limita a 80-95 %");
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.001);
});

test("textos de los botones y nota inválida", () => {
  const labels = previewIntervals(fresh, NOW).map((p) => p.label);
  assert.equal(labels[0], "10 min");
  assert.equal(humanInterval(day), "1 día");
  assert.equal(humanInterval(45 * day), "2 meses");
  assert.throws(() => schedule(fresh, 5 as 1, NOW), /invalid_rating/);
});
