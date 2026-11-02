// Peticiones de LECTURA a dream-api cuando la web va lenta o falla un momento.
//
// - Si una lectura tarda más de 8 s, sale «Dream está tardando más de lo
//   habitual».
// - Si falla por algo pasajero (sin red, 502/503/504 o un 429 corto), se
//   reintenta sola tras 10 s y, si vuelve a fallar, tras 20 s. Mientras tanto
//   se ve la cuenta atrás y «Reintentar ya».
// - Solo lecturas: no gastan IA y se pueden repetir sin efecto. Escrituras y
//   acciones de IA (chat, tests, esquemas...) nunca se repiten solas; el chat
//   ya tiene su propia espera (lib/limits.ts).

export const SLOW_AFTER_MS = 8000;
export const RETRY_DELAYS_SECONDS = [10, 20] as const;
// Un 429 con una espera mayor es el cupo del día, no un fallo pasajero.
const LONGEST_RETRY_AFTER_SECONDS = 30;

export const READ_ACTIONS: ReadonlySet<string> = new Set([
  "profile",
  "ai_usage",
  "conversations",
  "messages",
  "exams",
  "exam_get",
  "exam_session_get",
  "scheme_get",
  "game_get",
  "dreams_list",
  "test_get",
  "memory_list",
  "mod_notices",
  "mod_ban_info",
  "upload_session_status",
]);

export const isReadAction = (action: string) => READ_ACTIONS.has(action);

/** Seconds to wait before retrying this failure, or null when it will not be retried. */
export function retryDelay(
  error: unknown,
  attempt: number,
  aborted = false,
): number | null {
  if (aborted || attempt >= RETRY_DELAYS_SECONDS.length) return null;
  const base = RETRY_DELAYS_SECONDS[attempt];
  const e = error as { name?: string; status?: unknown; retryAfter?: unknown };
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return null;
  // fetch() sin red o cortado: TypeError.
  if (error instanceof TypeError) return base;
  const status = typeof e?.status === "number" ? e.status : 0;
  if (status === 502 || status === 503 || status === 504) {
    const wait = Number(e?.retryAfter) || 0;
    return wait > LONGEST_RETRY_AFTER_SECONDS ? null : Math.max(base, wait);
  }
  if (status === 429) {
    const wait = Number(e?.retryAfter) || 0;
    return wait > LONGEST_RETRY_AFTER_SECONDS ? null : Math.max(base, wait);
  }
  return null;
}

export type SlowNotice =
  { kind: "slow" } | { kind: "retry"; until: number } | null;

type Listener = () => void;
const listeners = new Set<Listener>();
let slowCount = 0;
let retryUntil: number | null = null;
let skipWait: (() => void) | null = null;
let snapshot: SlowNotice = null;

function publish() {
  const next: SlowNotice =
    retryUntil !== null
      ? { kind: "retry", until: retryUntil }
      : slowCount > 0
        ? { kind: "slow" }
        : null;
  if (
    next?.kind === snapshot?.kind &&
    (next as { until?: number } | null)?.until ===
      (snapshot as { until?: number } | null)?.until
  )
    return;
  snapshot = next;
  listeners.forEach((l) => l());
}

export const slowNotice = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: () => snapshot,
  /** Una lectura lleva más de SLOW_AFTER_MS esperando. Devuelve cómo avisar de que terminó. */
  slowStarted() {
    slowCount++;
    publish();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      slowCount = Math.max(0, slowCount - 1);
      publish();
    };
  },
  /** El alumno pulsa «Reintentar ya». */
  retryNow() {
    skipWait?.();
  },
  /** Espera `seconds` mostrando la cuenta atrás; termina antes con retryNow() o al abortar. */
  async wait(seconds: number, signal?: AbortSignal) {
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        if (skipWait === finish) skipWait = null;
        retryUntil = null;
        publish();
        resolve();
      };
      const timer = setTimeout(finish, seconds * 1000);
      signal?.addEventListener("abort", finish, { once: true });
      skipWait = finish;
      retryUntil = Date.now() + seconds * 1000;
      publish();
    });
  },
};

/** Texto de la cuenta atrás: «Reintento en 10 s». */
export const retryText = (secondsLeft: number) =>
  `No se pudo conectar. Reintento en ${Math.max(1, Math.ceil(secondsLeft))} s.`;
export const SLOW_TEXT = "Dream está tardando más de lo habitual…";
