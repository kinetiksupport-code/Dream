import test from "node:test";
import assert from "node:assert/strict";
import {
  createReveal,
  finishReveal,
  revealDone,
  stepReveal,
  MIN_WORDS_PER_S,
  REVEAL_MS,
  type RevealClock,
} from "../lib/reveal";
import { rehypeLearningSteps, rehypeRevealWords } from "../lib/reveal-words";
import type { Root } from "hast";

const FRAME = 1000 / 60;
/** Run frames from `from` until done or `until`; returns [time, shown][]. */
function run(
  clock: RevealClock,
  from: number,
  until: number,
  available: (t: number) => number,
  complete: (t: number) => boolean,
) {
  const out: [number, number][] = [];
  for (let t = from; t <= until; t += FRAME) {
    const a = available(t);
    out.push([t, stepReveal(clock, t, a, complete(t))]);
    if (revealDone(clock, a)) break;
  }
  return out;
}

test("reveal: a long answer that arrives whole takes ~2 s, at a constant pace", () => {
  const clock = createReveal();
  const frames = run(
    clock,
    0,
    5000,
    () => 600,
    () => true,
  );
  const [end, shown] = frames.at(-1)!;
  assert.equal(shown, 600);
  assert.ok(end >= REVEAL_MS - 2 * FRAME && end <= REVEAL_MS + FRAME, `${end}`);
  // Constant pace: at 25 %, 50 % and 75 % of the time, ~25/50/75 % shown.
  for (const f of [0.25, 0.5, 0.75]) {
    const [, n] = frames.find(([t]) => t >= REVEAL_MS * f)!;
    assert.ok(Math.abs(n / 600 - f) < 0.03, `${f}: ${n}`);
  }
  // Words only grow, never more than a frame's worth at once.
  for (let i = 1; i < frames.length; i++) {
    const step = frames[i][1] - frames[i - 1][1];
    assert.ok(step >= 0 && step <= Math.ceil((600 / REVEAL_MS) * FRAME) + 1);
  }
});

test("reveal: never more than 2 s after arrival, however long the answer", () => {
  for (const words of [50, 3000, 40000]) {
    const clock = createReveal();
    const [end, shown] = run(
      clock,
      0,
      10000,
      () => words,
      () => true,
    ).at(-1)!;
    assert.equal(shown, words);
    assert.ok(end <= REVEAL_MS + FRAME, `${words} words: ${end} ms`);
  }
});

test("reveal: short answers do not drag (floor of MIN_WORDS_PER_S)", () => {
  const clock = createReveal();
  const [end] = run(
    clock,
    0,
    5000,
    () => 8,
    () => true,
  ).at(-1)!;
  assert.ok(end <= (8 / MIN_WORDS_PER_S) * 1000 + 2 * FRAME, `${end}`);
});

test("reveal: while streaming it follows the arrival and ends ≤ arrival + 2 s", () => {
  // 30 words per 100 ms for 3 s (900 words), complete at 3 s.
  const arrived = (t: number) => Math.min(900, Math.floor(t / 100) * 30);
  const clock = createReveal();
  const frames = run(clock, 0, 10000, arrived, (t) => t >= 3000);
  const [end, shown] = frames.at(-1)!;
  assert.equal(shown, 900);
  assert.ok(end <= 3000 + REVEAL_MS + FRAME, `${end}`);
  // Never shows what has not arrived.
  for (const [t, n] of frames) assert.ok(n <= arrived(t));
  // Slow arrival (5 words/s): the reveal keeps up, just behind the text.
  const slow = createReveal();
  const s = run(
    slow,
    0,
    4000,
    (t) => Math.floor(t / 200),
    () => false,
  );
  const [t, n] = s.at(-1)!;
  assert.ok(Math.floor(t / 200) - n <= 1, `${n} of ${Math.floor(t / 200)}`);
});

test("reveal: a stalled frame (hidden tab) past the limit shows everything", () => {
  const clock = createReveal();
  stepReveal(clock, 0, 500, true);
  assert.equal(stepReveal(clock, 2600, 500, true), 500);
  assert.ok(revealDone(clock, 500));
});

test("reveal: finish shows everything now, and what arrives later", () => {
  const clock = createReveal();
  stepReveal(clock, 0, 100, false);
  stepReveal(clock, 100, 100, false);
  finishReveal(clock);
  assert.equal(stepReveal(clock, 116, 100, false), 100);
  assert.equal(stepReveal(clock, 132, 180, false), 180);
  assert.ok(!revealDone(clock, 180)); // still arriving
  assert.equal(stepReveal(clock, 148, 200, true), 200);
  assert.ok(revealDone(clock, 200));
  // Reduced motion: the clock starts instant.
  const instant = createReveal(true);
  assert.equal(stepReveal(instant, 0, 300, true), 300);
});

test("reveal words: one span per word, a formula is one unit, spaces kept", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          { type: "text", value: "Hola  mundo " },
          {
            type: "element",
            tagName: "span",
            properties: { className: ["katex"] },
            children: [{ type: "text", value: "x 2" }],
          },
        ],
      },
      {
        type: "element",
        tagName: "h3",
        properties: {},
        children: [{ type: "text", value: "1. Paso uno" }],
      },
    ],
  };
  rehypeLearningSteps()(tree);
  rehypeRevealWords()(tree);
  const p = tree.children[0];
  assert.equal(p.type, "element");
  if (p.type !== "element") return;
  assert.deepEqual(
    p.children.map((c) =>
      c.type === "text"
        ? `t:${c.value}`
        : c.type === "element"
          ? `${c.tagName}${"dataW" in c.properties ? "[w]" : ""}`
          : c.type,
    ),
    ["span[w]", "t:  ", "span[w]", "t: ", "span[w]"],
  );
  const katexEl = p.children[4];
  assert.ok(katexEl.type === "element" && katexEl.children[0].type === "text");
  const h3 = tree.children[1];
  assert.ok(h3.type === "element");
  if (h3.type !== "element") return;
  assert.deepEqual(h3.properties.className, ["learning-step"]);
  assert.equal(h3.children.filter((c) => c.type === "element").length, 3);
});
