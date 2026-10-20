import test from "node:test";
import assert from "node:assert/strict";
import { ORB_MAX_WAIT_MS, canTravel, orbArrived, travelWithOrb } from "../lib/orb-transition";

function fakeWindow({ vt = true, reduce = false } = {}) {
  const dataset: Record<string, string> = {};
  const timers = new Map<number, () => void>();
  let id = 0;
  let update: (() => Promise<void>) | null = null;
  let skipped = false;
  let finish = () => {};
  const finished = new Promise<void>((r) => (finish = r));
  const win = {
    matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }),
    setTimeout: (fn: () => void) => (timers.set(++id, fn), id),
    clearTimeout: (t: number) => timers.delete(t),
    document: {
      documentElement: { dataset },
      ...(vt
        ? {
            startViewTransition: (fn: () => Promise<void>) => {
              update = fn;
              return { finished, skipTransition: () => (skipped = true) };
            },
          }
        : {}),
    },
  } as unknown as Window;
  return { win, dataset, timers, run: () => update!(), skipped: () => skipped, finish };
}

test("without View Transitions or with reduced motion, the link navigates normally", () => {
  assert.equal(canTravel(fakeWindow({ vt: false }).win), false);
  assert.equal(canTravel(fakeWindow({ reduce: true }).win), false);
  let went = false;
  assert.equal(travelWithOrb(() => (went = true), fakeWindow({ vt: false }).win), false);
  assert.equal(went, false, "the caller navigates");
});

test("the transition waits for the login, then lets the Orb land", async () => {
  const f = fakeWindow();
  let went = false;
  assert.equal(travelWithOrb(() => (went = true), f.win), true);
  assert.equal("orbTransition" in f.dataset, true);
  const done = f.run();
  assert.equal(went, true);
  orbArrived();
  await done;
  assert.equal(f.timers.size, 0, "no pending timeout");
  assert.equal(f.skipped(), false);
  f.finish();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal("orbTransition" in f.dataset, false);
});

test(`a slow login never freezes the screen: skipped after ${ORB_MAX_WAIT_MS} ms`, async () => {
  const f = fakeWindow();
  travelWithOrb(() => {}, f.win);
  const done = f.run();
  [...f.timers.values()][0]();
  await done;
  assert.equal(f.skipped(), true);
});
