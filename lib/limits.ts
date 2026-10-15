// How the client reacts to Dream's and the AI provider's usage limits.
// Short limits wait and retry the same message; daily limits never queue.

export type LimitState =
  | { kind: "wait"; seconds: number; position?: number }
  | { kind: "daily"; resetAt: number; scope: "user" | "global" };

const WAIT_CODES = new Set([
  "dream_queue",
  "dream_rpm",
  "dream_concurrency",
  "dream_admission_busy",
  "provider_rate_limit",
  "all_keys_cooling_down",
]);
const DAILY_CODES = new Set([
  "dream_daily",
  "dream_budget",
  "provider_daily_limit",
]);
// A "short" wait longer than this is really the day's quota.
const LONGEST_WAIT_SECONDS = 15 * 60;

export const MAX_RETRIES = 6;
export const MAX_TOTAL_WAIT_SECONDS = 5 * 60;

export function limitFor(
  code: string,
  retryAfter: number,
  now = Date.now(),
  position?: number,
): LimitState | null {
  const seconds = Math.max(1, Math.ceil(retryAfter || 0));
  if (WAIT_CODES.has(code) && seconds <= LONGEST_WAIT_SECONDS)
    return {
      kind: "wait",
      seconds,
      ...(position && position > 0 ? { position: Math.floor(position) } : {}),
    };
  if (DAILY_CODES.has(code) || WAIT_CODES.has(code))
    return {
      kind: "daily",
      resetAt: now + seconds * 1000,
      scope: code === "dream_daily" ? "user" : "global",
    };
  return null;
}

// Retry only while the total wait stays reasonable; never loop forever.
export function shouldRetry(
  attempt: number,
  waitedSeconds: number,
  next: number,
) {
  return (
    attempt < MAX_RETRIES && waitedSeconds + next <= MAX_TOTAL_WAIT_SECONDS
  );
}

function roughSeconds(seconds: number) {
  if (seconds < 60) return `unos ${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "un minuto" : `unos ${minutes} min`;
}

export function waitText(seconds: number, position?: number) {
  return position
    ? `Eres el ${position}º en la cola, ${roughSeconds(seconds)}.`
    : `Hay mucha gente usando Dream. Lo intento de nuevo en ${roughSeconds(seconds)}.`;
}

function clock(resetAt: number) {
  return new Date(resetAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dailyText(
  limit: Extract<LimitState, { kind: "daily" }>,
  now = Date.now(),
) {
  const day = (t: number) => new Date(t).toDateString();
  const reset = new Date(limit.resetAt);
  const label =
    day(limit.resetAt) === day(now)
      ? "hoy"
      : day(limit.resetAt) === day(now + 86_400_000)
        ? "mañana"
        : `el ${reset.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
  const when = `${label} a las ${clock(limit.resetAt)}`;
  return limit.scope === "user"
    ? `Has usado toda tu IA gratis de hoy. Vuelve ${when}.`
    : `La IA gratis de hoy se ha agotado. Vuelve ${when}.`;
}
