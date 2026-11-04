import { historyPlaceholder, isLongDocument, selectChunks, splitChunks } from './long-text.mjs';
import { words } from './conversation-memory.mjs';

// Capacity helpers for the free AI tier. Groq limits are per organization; each
// of Dream's keys belongs to its own organization, so a 429 cools only that key
// (see groq.mjs).

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
// Prompt «ahorrar tokens» (8): a pasted text or a long Dream document is never
// resent cut at 4.000 characters; it goes as «[Texto pegado: «título», N
// palabras — resumen: …]». If the student asks about a Dream document again,
// only the part that fits the question comes back (`prompt`).
export const PASTED_CHARS = 1500;
export function compactHistory(messages, { recentFull = 4, olderChars = 400, totalChars = 9000, recentChars = 4000, prompt = '' } = {}) {
  const out = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const recent = messages.length - 1 - i < recentFull;
    const role = messages[i].role;
    const text = String(messages[i].content || '').replace(/<!--DREAM_DOC:[\s\S]*?-->/g, '').trim();
    const limit = recent ? recentChars : olderChars;
    let content;
    if (role === 'assistant' && (text.length > limit || isLongDocument(text)) && isLongDocument(text)) {
      const back = prompt ? selectChunks(splitChunks(text), prompt, 2) : [];
      const asked = back.length && keysMatch(prompt, back) ? `\n${back.map((c) => c.text).join('\n\n').slice(0, 1500)}` : '';
      content = `${historyPlaceholder(text, 'assistant')}${asked}`;
      if (!recent && !asked) content = content.slice(0, Math.max(limit, 200));
    } else if (role === 'user' && text.length > PASTED_CHARS) {
      content = historyPlaceholder(text, 'user');
      if (!recent) content = content.slice(0, Math.max(limit, 200));
    }
    else content = text.length > limit ? `${text.slice(0, limit)}…` : text;
    if (used + content.length > totalChars && out.length >= 2) break;
    used += content.length;
    out.unshift({ role, content });
  }
  return out;
}

// Only bring a document part back when the question shares real words with it.
function keysMatch(prompt, chunks) {
  const asked = words(prompt).filter((w) => w.length > 3);
  return chunks.some((c) => { const body = new Set(words(c.text)); return asked.some((w) => body.has(w)); });
}

// Short answers by default; a full budget only when the student asks for
// complete notes, a summary or a printable test.
const LONG_REQUEST = /\b(apuntes|resumen|resume|esquema completo|tema completo|para imprimir|explicaci[oó]n completa|desarrolla)\b/i;
export const SHORT_ANSWER_TOKENS = 1200;
export const LONG_ANSWER_TOKENS = 2048;
export const wantsLongAnswer = (prompt) => LONG_REQUEST.test(String(prompt || ''));
export function answerTokenBudget(prompt, { short = SHORT_ANSWER_TOKENS, long = LONG_ANSWER_TOKENS } = {}) {
  return wantsLongAnswer(prompt) ? long : short;
}
