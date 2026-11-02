// Repaso espaciado FSRS-5 (prompt de la ruta, Bloque 4): función pura, sin
// dependencias, compartida por dream-api (que programa) y la web (que enseña
// el próximo intervalo bajo cada botón). Parámetros por defecto de FSRS-5 y
// retención deseada del 90 % (configurable entre 80 y 95 %).
// Botones: 1 Otra vez · 2 Difícil · 3 Bien · 4 Fácil.
// Estados: 0 nueva · 1 aprendiendo · 2 repaso · 3 reaprendiendo.

export const FSRS_W = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]);
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86400000;
/** «Otra vez»: vuelve en 10 minutos, dentro de la misma sesión. */
export const AGAIN_MINUTES = 10;
export const MAX_INTERVAL_DAYS = 365;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const clampRetention = (r) => clamp(Number(r) || 0.9, 0.8, 0.95);

/** Probabilidad de recordar tras t días con estabilidad S. */
export function retrievability(t, s) {
  return s > 0 ? Math.pow(1 + (FACTOR * t) / s, DECAY) : 0;
}
/** Días hasta que la probabilidad baje a la retención deseada. */
export function intervalDays(s, retention = 0.9) {
  const r = clampRetention(retention);
  const days = (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS);
}
const initStability = (g, w) => Math.max(w[g - 1], 0.1);
const initDifficulty = (g, w) => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d, g, w) {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  // Vuelta suave a la dificultad de «Fácil» (evita que se quede atascada).
  return clamp(w[7] * initDifficulty(4, w) + (1 - w[7]) * damped, 1, 10);
}
function recallStability(d, s, r, g, w) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}
function forgetStability(d, s, r, w) {
  const next = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(next, s);
}
function shortTermStability(s, g, w) {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

/**
 * Programa un repaso. `card`: { stability, difficulty, reps, lapses, state,
 * last_review (ISO o null) }. Devuelve el nuevo estado y la fecha `due`.
 * @param {{stability:number,difficulty:number,reps:number,lapses:number,state:number,last_review:string|null}} card
 * @param {1|2|3|4} rating
 * @param {Date} now
 */
export function schedule(card, rating, now = new Date(), { retention = 0.9, w = FSRS_W } = {}) {
  const g = Number(rating);
  if (![1, 2, 3, 4].includes(g)) throw new Error("invalid_rating");
  const last = card.last_review ? new Date(card.last_review) : null;
  const elapsed = last ? Math.max(0, (now.getTime() - last.getTime()) / DAY) : 0;
  let { stability: s, difficulty: d, reps, lapses, state } = card;
  if (!state || !s) {
    s = initStability(g, w);
    d = initDifficulty(g, w);
  } else if (elapsed < 1) {
    s = shortTermStability(s, g, w);
    d = nextDifficulty(d, g, w);
  } else {
    const r = retrievability(elapsed, s);
    d = nextDifficulty(d, g, w);
    s = g === 1 ? forgetStability(d, s, r, w) : recallStability(d, s, r, g, w);
  }
  const forgot = g === 1;
  if (forgot && state === 2) lapses += 1;
  const nextState = forgot ? (state === 2 || state === 3 ? 3 : 1) : 2;
  const due = forgot ? new Date(now.getTime() + AGAIN_MINUTES * 60000) : new Date(now.getTime() + intervalDays(s, retention) * DAY);
  return {
    stability: Number(s.toFixed(4)),
    difficulty: Number(d.toFixed(4)),
    reps: reps + 1,
    lapses,
    state: nextState,
    last_review: now.toISOString(),
    due: due.toISOString(),
    elapsed_days: Number(elapsed.toFixed(4)),
  };
}

/** Lo que dice cada botón debajo («10 min», «3 días», «2 meses»). */
export function previewIntervals(card, now = new Date(), opts) {
  return [1, 2, 3, 4].map((g) => {
    const next = schedule(card, g, now, opts);
    return { rating: g, label: humanInterval(new Date(next.due).getTime() - now.getTime()) };
  });
}
export function humanInterval(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const days = Math.round(ms / DAY);
  if (days < 1) return `${Math.round(min / 60)} h`;
  if (days === 1) return "1 día";
  if (days < 31) return `${days} días`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 mes" : `${months} meses`;
}
