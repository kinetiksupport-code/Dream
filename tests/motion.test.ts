// Motion primitives of the new style (PROMPT_EXAMEN_ESTILO.md §6).
import test from "node:test";
import assert from "node:assert/strict";
import {
  DISMISS_VELOCITY,
  dragOffset,
  formatNumber,
  rollDirection,
  scallopPath,
  shouldDismiss,
} from "../lib/motion";

test("numbers use the Spanish format", () => {
  assert.equal(formatNumber(8.5, 1), "8,5");
  assert.equal(formatNumber(12), "12");
  assert.equal(formatNumber(12345), "12.345");
});

test("a number rolls up when it grows and down when it shrinks", () => {
  assert.equal(rollDirection(7.5, 8), "up");
  assert.equal(rollDirection(8, 7.5), "down");
  assert.equal(rollDirection(3, 3), "up");
});

test("a sheet closes on a long drag or a quick flick, never on an upward one", () => {
  // Slow but far: a third of a 400 px sheet.
  assert.equal(shouldDismiss(130, 2000, 400), true);
  // Short but fast (emil-design-eng: velocity > 0.11 px/ms).
  assert.equal(shouldDismiss(40, 100, 400), true);
  assert.equal(DISMISS_VELOCITY, 0.11);
  // Short and slow: it snaps back.
  assert.equal(shouldDismiss(40, 1000, 400), false);
  // Upwards never closes.
  assert.equal(shouldDismiss(-200, 50, 400), false);
});

test("dragging a sheet up meets growing friction", () => {
  assert.equal(dragOffset(50), 50);
  assert.ok(dragOffset(-100) > -100);
  assert.ok(dragOffset(-400) < dragOffset(-100));
  assert.ok(Math.abs(dragOffset(-400)) < 50);
});

test("the scalloped sticker is a closed path with one arc per bump", () => {
  const d = scallopPath(14);
  assert.match(d, /^M[\d.]+ [\d.]+/);
  assert.match(d, /Z$/);
  assert.equal((d.match(/A/g) ?? []).length, 14);
  // Bumps stay inside the 100×100 box (ring and shadow need the margin).
  for (const [, x, y] of d.matchAll(/ ([\d.]+) ([\d.]+)(?=A|Z)/g)) {
    assert.ok(+x >= 0 && +x <= 100 && +y >= 0 && +y <= 100);
  }
  assert.equal((scallopPath(3).match(/A/g) ?? []).length, 6); // minimum
});
