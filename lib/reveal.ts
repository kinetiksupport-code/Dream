/**
 * Presentation buffer for AI answers (Parte I, «aparición suave»).
 *
 * The network stream is untouched (lib/streaming.ts): this only decides how
 * many words of what has already arrived are visible at a given moment, so
 * an answer that lands whole (or very fast, as with Groq) appears word by
 * word at a steady pace instead of all at once.
 *
 * Rules:
 * - While text is still arriving, the pace follows the backlog: it shows the
 *   pending words over REVEAL_MS, so it settles at the arrival speed.
 * - Once everything has arrived, the pace becomes «what is left / time left
 *   until arrival + REVEAL_MS»: constant, and never later than that limit,
 *   however long the answer is.
 * - Never slower than MIN_WORDS_PER_S, so a short answer («¡Hola!») does not
 *   drag for 2 s.
 * - `finish` shows everything at once (tap, click or reduced motion).
 *
 * Pure and clock-agnostic: the caller passes `now` (ms) from rAF.
 */
export const REVEAL_MS = 2000;
export const MIN_WORDS_PER_S = 40;

export type RevealClock = {
  /** Words visible (fractional: the pace accumulates between frames). */
  shown: number;
  /** Time of the previous step, null before the first one. */
  last: number | null;
  /** When the whole answer had arrived, null while it streams. */
  completeAt: number | null;
  /** Everything is shown and will keep being shown (finish or deadline). */
  instant: boolean;
};

export function createReveal(instant = false): RevealClock {
  return { shown: 0, last: null, completeAt: null, instant };
}

/** Show everything that has arrived, and everything that arrives later. */
export function finishReveal(clock: RevealClock) {
  clock.instant = true;
}

/**
 * Advance the clock to `now` and return how many words are visible.
 * `available`: words that may be shown (the caller leaves out a word that
 * may still be half received). `complete`: the answer has fully arrived.
 */
export function stepReveal(
  clock: RevealClock,
  now: number,
  available: number,
  complete: boolean,
): number {
  const dt = clock.last === null ? 0 : Math.max(0, now - clock.last);
  clock.last = now;
  if (complete && clock.completeAt === null) clock.completeAt = now;
  if (clock.instant) {
    clock.shown = Math.max(clock.shown, available);
    return available;
  }
  const remaining = available - clock.shown;
  const floor = MIN_WORDS_PER_S / 1000;
  if (remaining > 0) {
    const left =
      clock.completeAt === null
        ? REVEAL_MS
        : clock.completeAt + REVEAL_MS - now;
    // Words per ms. Past the limit (a hidden tab, a stalled frame): all of it.
    clock.shown =
      left <= 0
        ? available
        : Math.min(
            available,
            clock.shown + Math.max(floor, remaining / left) * dt,
          );
  }
  return Math.floor(clock.shown + 1e-9);
}

/** The reveal has nothing left to do: all arrived and all visible. */
export function revealDone(clock: RevealClock, available: number) {
  return clock.completeAt !== null && clock.shown >= available - 1e-9;
}
