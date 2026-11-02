import { TYPING } from "./typing";

/**
 * Presentation queue for AI answers: the answer «types itself»
 * (docs/HABLA_NATURAL.md, P5; replaces the 2 s soft reveal of Parte I).
 *
 * The network stream is untouched (lib/streaming.ts): this only decides how
 * many words of what has already arrived are visible at a given moment.
 * Each word has a cost in ms (lib/typing.ts › unitCost: ~40 characters per
 * second, a short pause after commas and a longer one after a full stop,
 * with a small fixed jitter), so the pace is the same however fast the
 * network is.
 *
 * Rules:
 * - The first word shows at once (time to first character ≈ one frame).
 * - Steady pace while there is text queued; if the queue empties, it waits.
 * - While text still arrives, a queue past TYPING.catchUpMs speeds it up
 *   smoothly (at most TYPING.maxCatchUp times).
 * - Never later than TYPING.maxTotalMs after the first word: a long answer
 *   speeds up so it ends by then (and anything arriving later shows at once).
 * - `finish` shows everything at once (tap, click, Esc/Enter, hidden tab,
 *   reduced motion).
 *
 * Pure and clock-agnostic: the caller passes `now` (ms) from rAF.
 */
export type RevealClock = {
  /** Words visible. */
  shown: number;
  /** Typing time banked towards the next word (ms). */
  credit: number;
  /** Current speed multiplier (1 = TYPING.charsPerSecond). */
  speed: number;
  /** Time of the previous step, null before the first one. */
  last: number | null;
  /** When the first word was shown, null before. */
  startAt: number | null;
  /** When the whole answer had arrived, null while it streams. */
  completeAt: number | null;
  /** Everything is shown and will keep being shown. */
  instant: boolean;
};

export function createReveal(instant = false): RevealClock {
  return { shown: 0, credit: 0, speed: 1, last: null, startAt: null, completeAt: null, instant };
}

/** Show everything that has arrived, and everything that arrives later. */
export function finishReveal(clock: RevealClock) {
  clock.instant = true;
}

/**
 * Advance the clock to `now` and return how many words are visible.
 * `costs[i]`: ms to type word i (lib/typing.ts › unitCost), one per word
 * that may be shown (the caller leaves out a word that may still be half
 * received). `complete`: the answer has fully arrived.
 */
export function stepReveal(
  clock: RevealClock,
  now: number,
  costs: readonly number[],
  complete: boolean,
  opts = TYPING,
): number {
  const available = costs.length;
  const dt = clock.last === null ? 0 : Math.max(0, now - clock.last);
  clock.last = now;
  if (complete && clock.completeAt === null) clock.completeAt = now;
  if (clock.instant) {
    clock.shown = Math.max(clock.shown, available);
    return clock.shown;
  }
  if (available === 0) return clock.shown;
  if (clock.startAt === null) {
    // First character as soon as there is text.
    clock.startAt = now;
    clock.shown = Math.max(clock.shown, 1);
    return clock.shown;
  }
  let pending = 0;
  for (let i = clock.shown; i < available; i++) pending += costs[i];
  if (pending <= 0) {
    clock.credit = 0; // nothing queued: wait, do not bank time
    return clock.shown;
  }
  const left = clock.startAt + opts.maxTotalMs - now;
  // Past the limit (or a hidden tab that stalled the frames): all of it.
  if (left <= 0) {
    clock.shown = available;
    clock.credit = 0;
    return clock.shown;
  }
  // Speed needed to end by the limit, and to catch up with a long queue.
  let target = Math.max(1, pending / left);
  // A queue that keeps growing while text still arrives: catch up, gently.
  if (!complete && pending > opts.catchUpMs)
    target = Math.max(target, Math.min(opts.maxCatchUp, pending / opts.catchUpMs));
  // Speeds up and slows down smoothly, but never below what the limit needs.
  const k = Math.min(1, dt / opts.smoothingMs);
  clock.speed = Math.max(pending / left, clock.speed + (target - clock.speed) * k);
  clock.credit += dt * clock.speed;
  while (clock.shown < available && clock.credit >= costs[clock.shown]) {
    clock.credit -= costs[clock.shown];
    clock.shown++;
  }
  if (clock.shown >= available) clock.credit = 0;
  return clock.shown;
}

/** The reveal has nothing left to do: all arrived and all visible. */
export function revealDone(clock: RevealClock, available: number) {
  return clock.completeAt !== null && clock.shown >= available;
}
