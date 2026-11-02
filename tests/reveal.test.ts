import test from "node:test";
import assert from "node:assert/strict";
import {
  createReveal,
  finishReveal,
  revealDone,
  stepReveal,
  type RevealClock,
} from "../lib/reveal";
import { TYPING, noise, unitCost } from "../lib/typing";
import { rehypeLearningSteps, rehypeRevealWords } from "../lib/reveal-words";
import type { Root } from "hast";

// El texto «se escribe» (P5, docs/HABLA_NATURAL.md): ~40 caracteres por
// segundo con pausas en los signos, acelera si hay cola y nunca pasa de 8 s.

const FRAME = 1000 / 60;
const words = (text: string) => text.split(/\s+/).filter(Boolean);
const costsOf = (list: string[]) => list.map((w, i) => unitCost(w, i));
/** Run frames from `from`; returns [time, shown][] until done or `until`. */
function run(
  clock: RevealClock,
  from: number,
  until: number,
  costs: (t: number) => number[],
  complete: (t: number) => boolean,
) {
  const out: [number, number][] = [];
  for (let t = from; t <= until; t += FRAME) {
    const c = costs(t);
    out.push([t, stepReveal(clock, t, c, complete(t))]);
    if (revealDone(clock, c.length)) break;
  }
  return out;
}
/** A short answer: ~40 words (~250 characters), commas and full stops. */
const SHORT = Array.from(
  { length: 4 },
  (_, i) => `Esta es la idea número ${i + 1}, que va con calma y se entiende bien.`,
).join(" ");

test("typing: ~40 characters per second, with pauses after commas and full stops", () => {
  const list = words(SHORT);
  const clock = createReveal();
  const frames = run(clock, 0, 20000, () => costsOf(list), () => true);
  const end = frames.at(-1)![0];
  const chars = SHORT.length;
  const sentences = 4;
  const commas = 4;
  // Pure typing time + pauses (averages), within a frame per word of slack.
  const expected = (chars / TYPING.charsPerSecond) * 1000 + sentences * 200 + commas * 80;
  assert.ok(Math.abs(end - expected) < expected * 0.12, `${Math.round(end)} vs ${Math.round(expected)}`);
  assert.ok(end < TYPING.maxTotalMs, `${end}`);
  // The first word shows on the first frame.
  assert.equal(frames[0][1], 1);
  // It goes word by word: never more than a couple of words in one frame.
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i][1] - frames[i - 1][1] <= 2);
});

test("typing: the pause after a full stop is longer than after a comma, and the jitter is fixed", () => {
  // Same length (8 characters), so only the pause differs.
  const plain = unitCost("palabras", 5);
  const comma = unitCost("palabra,", 5);
  const stop = unitCost("palabra.", 5);
  assert.ok(comma - plain >= TYPING.pauseCommaMs[0] && comma - plain <= TYPING.pauseCommaMs[1]);
  assert.ok(stop - plain >= TYPING.pauseSentenceMs[0] && stop - plain <= TYPING.pauseSentenceMs[1]);
  assert.ok(unitCost("¿sí?»", 1) > unitCost("sí", 1) + 140);
  // Same word, same position: same cost (no jumps between repaints).
  assert.equal(unitCost("hola", 3), unitCost("hola", 3));
  // ±15 % jitter between positions.
  const spread = Array.from({ length: 50 }, (_, i) => unitCost("palabra", i));
  const base = (8 / TYPING.charsPerSecond) * 1000;
  assert.ok(Math.min(...spread) >= base * 0.85 - 1e-9 && Math.max(...spread) <= base * 1.15 + 1e-9);
  assert.ok(new Set(spread.map(Math.round)).size > 5);
  assert.ok(noise(1) >= 0 && noise(1) < 1);
});

test("typing: an 80-word answer takes about the 8 s limit (it speeds up to fit)", () => {
  const list = words(`${SHORT} ${SHORT}`);
  const frames = run(createReveal(), 0, 20000, () => costsOf(list), () => true);
  const end = frames.at(-1)![0];
  assert.ok(end > TYPING.maxTotalMs - 600 && end <= TYPING.maxTotalMs + FRAME, `${end}`);
});

test("typing: never more than 8 s, however long the answer (it speeds up)", () => {
  for (const n of [300, 1000, 3000]) {
    const list = Array.from({ length: n }, (_, i) => (i % 12 === 11 ? "fin." : "palabra"));
    const clock = createReveal();
    const frames = run(clock, 0, 30000, () => costsOf(list), () => true);
    const end = frames.at(-1)![0];
    assert.ok(end <= TYPING.maxTotalMs + FRAME, `${n} words: ${end} ms`);
    assert.equal(frames.at(-1)![1], n);
  }
});

test("typing: while streaming it waits for text, then catches up smoothly", () => {
  const list = words(SHORT);
  const clock = createReveal();
  // 10 words arrive at once, then nothing for 3 s, then the rest.
  const costs = (t: number) => costsOf(list.slice(0, t < 3000 ? 10 : list.length));
  const frames = run(clock, 0, 20000, costs, (t) => t >= 3000);
  const at = (t: number) => frames.find(([f]) => f >= t)![1];
  assert.equal(at(2900), 10); // shown what had arrived, then waited
  // Waiting does not bank time: after the gap it does not jump to the end.
  assert.ok(at(3200) < 20, `${at(3200)}`);
  assert.equal(frames.at(-1)![1], list.length);
});

test("typing: a long queue while streaming makes it speed up", () => {
  const list = Array.from({ length: 400 }, () => "palabra");
  const clock = createReveal();
  // Everything arrives at once but «not complete» (still streaming).
  const frames = run(clock, 0, 2000, () => costsOf(list), () => false);
  const shown = frames.at(-1)![1];
  const plain = (2000 / unitCost("palabra", 0)) | 0;
  assert.ok(shown > plain * 1.5, `${shown} vs ${plain}`);
});

test("typing: a stalled frame (hidden tab) past the limit shows everything", () => {
  const clock = createReveal();
  const costs = costsOf(words(SHORT));
  stepReveal(clock, 0, costs, true);
  assert.equal(stepReveal(clock, TYPING.maxTotalMs + 100, costs, true), costs.length);
});

test("typing: finish shows everything now, and what arrives later", () => {
  const clock = createReveal();
  const costs = costsOf(words(SHORT));
  stepReveal(clock, 0, costs.slice(0, 20), false);
  stepReveal(clock, 100, costs.slice(0, 20), false);
  finishReveal(clock);
  assert.equal(stepReveal(clock, 116, costs.slice(0, 20), false), 20);
  assert.equal(stepReveal(clock, 132, costs, true), costs.length);
  assert.equal(revealDone(clock, costs.length), true);
  const instant = createReveal(true);
  assert.equal(stepReveal(instant, 0, costs, true), costs.length);
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
