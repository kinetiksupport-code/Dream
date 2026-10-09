import { retryAfterSeconds } from './admission.mjs';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

const KEY_NAMES = ['GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4'];
const TRANSIENT_COOLDOWN_MS = 30_000;
const AUTH_COOLDOWN_MS = 15 * 60_000;

export class GroqProviderError extends Error {
  constructor(code, { status = 0, retryable = false, emittedContent = false, retryAfter = 0 } = {}) {
    super(code); this.name = 'GroqProviderError'; this.code = code; this.status = status;
    this.retryAfter = retryAfter; this.retryable = retryable; this.emittedContent = emittedContent;
  }
}

function validKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = value.trim();
  return /[\s"']/.test(key) ? null : key;
}

function statusPolicy(status) {
  if (status === 401 || status === 403) return { failover: true, kind: 'auth' };
  if (status === 408 || status === 425 || status >= 500) return { failover: true, kind: 'transient' };
  return { failover: false, kind: status === 429 ? 'rate_limit' : 'request' };
}

function attemptSignal(parent, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

async function discardResponse(response) {
  try { await response.body?.cancel(); } catch { /* best effort: release the connection */ }
}

export function createGroqProviderManager({
  getEnv = (name) => Deno.env.get(name), fetchImpl = fetch,
  now = () => Date.now(), logger = console,
} = {}) {
  const health = new Map();
  const configuredKeys = () => KEY_NAMES.flatMap((name, index) => {
    const key = validKey(getEnv(name));
    if (key && KEY_NAMES.slice(0,index).some(n => validKey(getEnv(n)) === key)) return [];
    return key ? [{ slot: index + 1, key }] : [];
  });
  const stateFor = (slot) => health.get(slot) || { consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, state: 'healthy' };
  const candidates = () => configuredKeys().filter(({ slot }) => stateFor(slot).cooldownUntil <= now());

  function safeLog(fields) { logger.log(JSON.stringify({ provider: 'groq', ...fields })); }
  function markSuccess(slot) { health.set(slot, { consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, state: 'healthy' }); }
  function markFailure(slot, kind) {
    const previous = stateFor(slot); const consecutiveFailures = previous.consecutiveFailures + 1; const timestamp = now();
    const authFailure = kind === 'auth';
    const cooldown = authFailure ? AUTH_COOLDOWN_MS : consecutiveFailures >= 2 ? Math.min(120_000, TRANSIENT_COOLDOWN_MS * (consecutiveFailures - 1)) : 0;
    health.set(slot, { consecutiveFailures, lastFailureAt: timestamp, cooldownUntil: timestamp + cooldown,
      state: authFailure ? 'unavailable' : cooldown ? 'cooldown' : 'degraded' });
  }
  function ensureConfigured() { if (!configuredKeys().length) throw new GroqProviderError('missing_key'); }

  /** @param {{body: object, signal?: AbortSignal, timeoutMs?: number, generationId?: string, operation?: string, beforeAttempt?: (provider:string,body:Record<string,unknown>)=>Promise<unknown>, pause?: (provider:string,seconds:number)=>Promise<unknown>}} options */
  async function request({ body, signal = undefined, timeoutMs = 60_000, generationId = crypto.randomUUID(), operation = 'completion', beforeAttempt = undefined, pause = undefined }) {
    signal = attemptSignal(signal, 90_000);
    ensureConfigured(); const available = candidates();
    if (!available.length) throw new GroqProviderError('all_keys_cooling_down', { status: 503, retryable: true, retryAfter: Math.max(1,Math.ceil(Math.min(...configuredKeys().map(k => stateFor(k.slot).cooldownUntil-now()))/1000)) });
    let lastError = null;
    for (let index = 0; index < available.length; index++) {
      const { slot, key } = available[index];
      if (signal?.aborted) throw new GroqProviderError('aborted');
      const started = now();
      await beforeAttempt?.('groq', body);
      try {
        const response = await fetchImpl(GROQ_ENDPOINT, { method: 'POST', signal: attemptSignal(signal, timeoutMs),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (response.ok) {
          markSuccess(slot); safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'success', duration_ms: now() - started });
          return response;
        }
        const policy = statusPolicy(response.status);
        if (response.status === 429) {
          const retryAfter = retryAfterSeconds(response.headers.get('retry-after'), now());
          await discardResponse(response);
          for (const entry of configuredKeys()) health.set(entry.slot, { ...stateFor(entry.slot), cooldownUntil: now() + retryAfter * 1000, state: 'cooldown' });
          await pause?.('groq', retryAfter);
          throw new GroqProviderError('provider_rate_limit', { status: 429, retryAfter });
        }
        safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: policy.kind, status: response.status, duration_ms: now() - started });
        await discardResponse(response);
        if (!policy.failover) throw new GroqProviderError(`http_${response.status}`, { status: response.status });
        markFailure(slot, policy.kind); lastError = new GroqProviderError(`http_${response.status}`, { status: response.status, retryable: true });
      } catch (error) {
        if (error?.name === 'AdmissionError' || error instanceof GroqProviderError && !error.retryable) throw error;
        if (signal?.aborted) {
          safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'aborted', duration_ms: now() - started });
          throw new GroqProviderError('aborted');
        }
        if (!(error instanceof GroqProviderError)) {
          markFailure(slot, 'transient');
          safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'network_or_timeout', duration_ms: now() - started });
          lastError = new GroqProviderError('network_or_timeout', { retryable: true });
        } else lastError = error;
      }
    }
    throw lastError || new GroqProviderError('provider_unavailable', { retryable: true });
  }

  /** @param {{body: object, signal?: AbortSignal, timeoutMs?: number, generationId?: string, operation?: string, beforeAttempt?: (provider:string,body:Record<string,unknown>)=>Promise<unknown>, pause?: (provider:string,seconds:number)=>Promise<unknown>}} options */
  async function* stream({ body, signal = undefined, timeoutMs = 60_000, generationId = crypto.randomUUID(), operation = 'chat_stream', beforeAttempt = undefined, pause = undefined }) {
    signal = attemptSignal(signal, 90_000);
    ensureConfigured(); const available = candidates();
    if (!available.length) throw new GroqProviderError('all_keys_cooling_down', { status: 503, retryable: true, retryAfter: Math.max(1,Math.ceil(Math.min(...configuredKeys().map(k => stateFor(k.slot).cooldownUntil-now()))/1000)) });
    let lastError = null;
    for (let index = 0; index < available.length; index++) {
      const { slot, key } = available[index];
      if (signal?.aborted) throw new GroqProviderError('aborted');
      const started = now(); let emittedContent = false;
      await beforeAttempt?.('groq', body);
      try {
        const response = await fetchImpl(GROQ_ENDPOINT, { method: 'POST', signal: attemptSignal(signal, timeoutMs),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok || !response.body) {
          const policy = statusPolicy(response.status);
        if (response.status === 429) {
          const retryAfter = retryAfterSeconds(response.headers.get('retry-after'), now());
          await discardResponse(response);
          for (const entry of configuredKeys()) health.set(entry.slot, { ...stateFor(entry.slot), cooldownUntil: now() + retryAfter * 1000, state: 'cooldown' });
          await pause?.('groq', retryAfter);
          throw new GroqProviderError('provider_rate_limit', { status: 429, retryAfter });
        }
          safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: policy.kind, status: response.status, duration_ms: now() - started });
          await discardResponse(response);
          if (!policy.failover) throw new GroqProviderError(`http_${response.status}`, { status: response.status });
          markFailure(slot, policy.kind); lastError = new GroqProviderError(`http_${response.status}`, { status: response.status, retryable: true });
          continue;
        }
        for await (const chunk of parseSSE(response.body)) {
          const delta = chunk?.choices?.[0]?.delta?.content;
          if ((typeof delta === 'string' && delta) || chunk?.choices?.[0]?.delta?.tool_calls?.length) emittedContent = true;
          yield chunk;
        }
        if (!emittedContent) {
          markFailure(slot, 'transient');
          safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'empty_stream', duration_ms: now() - started });
          lastError = new GroqProviderError('empty_stream', { retryable: true }); continue;
        }
        markSuccess(slot);
        safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'success', duration_ms: now() - started });
        return;
      } catch (error) {
        if (signal?.aborted) {
          safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: 'aborted', duration_ms: now() - started });
          throw new GroqProviderError('aborted', { emittedContent });
        }
        if (error?.name === 'AdmissionError' || error instanceof GroqProviderError && !error.retryable) throw error;
        markFailure(slot, 'transient');
        safeLog({ generation: generationId, operation, key_slot: slot, attempt: index + 1, result: emittedContent ? 'stream_interrupted' : 'network_or_timeout', duration_ms: now() - started });
        if (emittedContent) throw new GroqProviderError('stream_interrupted', { emittedContent: true });
        lastError = new GroqProviderError('network_or_timeout', { retryable: true });
      }
    }
    throw lastError || new GroqProviderError('provider_unavailable', { retryable: true });
  }

  return { request, stream, configuredKeyCount: () => configuredKeys().length,
    configured: () => configuredKeys().length > 0,
    healthSnapshot: () => configuredKeys().map(({ slot }) => ({ slot, ...stateFor(slot) })) };
}

export const groqProvider = createGroqProviderManager();

export function groqModel() {
  const value = Deno.env.get('GROQ_MODEL');
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_MODEL;
}
export function groqConfigured() { return groqProvider.configured(); }

export async function* parseSSE(stream) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let completed = false;
  const parseLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    if (!payload) return null;
    if (payload === '[DONE]') { completed = true; return null; }
    try { return JSON.parse(payload); }
    catch { throw new GroqProviderError('malformed_stream', { retryable: true }); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 262144) throw new GroqProviderError('oversized_stream');
      let pos;
      while ((pos = buffer.indexOf('\n')) !== -1) {
        const parsed = parseLine(buffer.slice(0, pos)); buffer = buffer.slice(pos + 1);
        if (parsed) yield parsed;
        if (completed) return;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const parsed = parseLine(buffer);
      if (parsed) yield parsed;
    }
    if (!completed) throw new GroqProviderError('incomplete_stream', { retryable: true });
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function upstreamError(status) {
  if (status === 401 || status === 403) return 'El servidor no tiene una credencial válida para el servicio de IA.';
  if (status === 404) return 'El modelo configurado no está disponible.';
  if (status === 429) return 'El servicio de IA ha limitado las peticiones. Inténtalo en unos minutos.';
  if (status === 400 || status === 422) return 'El servicio rechazó los parámetros de la petición.';
  return 'Dream está teniendo problemas para responder ahora mismo. Tu mensaje se ha conservado. Puedes intentarlo de nuevo.';
}

