// Capacity helpers for the free AI tier. Groq limits are per organization, not
// per key, so a 429 on any key applies to all of them (see groq.mjs).

// Above this wait, a provider 429 means "today's quota is spent", not "wait a
// minute": the client must not queue for it.
export const DAILY_LIMIT_THRESHOLD_SECONDS = 15 * 60;

// Groq reset headers look like "7.66s", "2m59.56s", "1h2m3s" or "120ms".
export function parseGroqDuration(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = '';
  let part;
  while ((part = re.exec(value.trim()))) {
    const n = Number(part[1]);
    total += part[2] === 'h' ? n * 3600 : part[2] === 'm' ? n * 60 : part[2] === 's' ? n : n / 1000;
    matched += part[0];
  }
  return matched === value.trim() ? total : null;
}

// Decide whether a provider 429 is a short per-minute limit or the daily quota.
// `body` is Groq's error text; it is only matched against limit names and never
// logged or returned.
/** @param {{ retryAfter: number, header?: (name: string) => string | null, body?: string }} options */
export function classifyProviderLimit({ retryAfter, header = () => null, body = '' }) {
  // x-ratelimit-*-requests is the per-day request quota (RPD).
  const requestsSpent = header('x-ratelimit-remaining-requests') === '0';
  const daily = requestsSpent || /per day|\b(?:TPD|RPD)\b/i.test(body) || retryAfter > DAILY_LIMIT_THRESHOLD_SECONDS;
  const resetRequests = requestsSpent ? parseGroqDuration(header('x-ratelimit-reset-requests')) : null;
  const wait = resetRequests ? Math.max(retryAfter, Math.ceil(resetRequests)) : retryAfter;
  return { code: daily ? 'provider_daily_limit' : 'provider_rate_limit', retryAfter: Math.max(1, Math.ceil(wait)) };
}

// Keep the newest turns whole and shorten older ones so a long conversation
// does not resend thousands of tokens on every message. No extra AI call.
export function compactHistory(messages, { recentFull = 4, olderChars = 400, totalChars = 9000, recentChars = 4000 } = {}) {
  const out = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const recent = messages.length - 1 - i < recentFull;
    const text = String(messages[i].content || '');
    const limit = recent ? recentChars : olderChars;
    const content = text.length > limit ? `${text.slice(0, limit)}…` : text;
    if (used + content.length > totalChars && out.length >= 2) break;
    used += content.length;
    out.unshift({ role: messages[i].role, content });
  }
  return out;
}

// Short answers by default; a full budget only when the student asks for
// complete notes, a summary or a printable test.
const LONG_REQUEST = /\b(apuntes|resumen|resume|esquema completo|tema completo|para imprimir|explicaci[oó]n completa|desarrolla)\b/i;
export const SHORT_ANSWER_TOKENS = 1200;
export const LONG_ANSWER_TOKENS = 2048;
export function answerTokenBudget(prompt) {
  return LONG_REQUEST.test(String(prompt || '')) ? LONG_ANSWER_TOKENS : SHORT_ANSWER_TOKENS;
}
