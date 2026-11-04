// Cloudflare Workers AI con la MISMA interfaz que el gestor de Groq
// (request, stream, configured), usando su API compatible con OpenAI.
// Solo se usa desde dream-api; la clave nunca llega al navegador.
// Sin CLOUDFLAREAI_API_KEY o CLOUDFLARE_ACCOUNT_ID, configured() es false y
// Dream sigue como siempre (cola de espera), sin avisar a nadie.
import { retryAfterSeconds } from './admission.mjs';
import { parseSSE } from './groq.mjs';

export const CLOUDFLARE_KEY_NAME = 'CLOUDFLAREAI_API_KEY';
export const CLOUDFLARE_ACCOUNT_NAME = 'CLOUDFLARE_ACCOUNT_ID';
export const cloudflareEndpoint = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

const TRANSIENT_COOLDOWN_MS = 30_000;
const AUTH_COOLDOWN_MS = 15 * 60_000;

export class CloudflareProviderError extends Error {
  constructor(code, { status = 0, retryable = false, emittedContent = false, retryAfter = 0 } = {}) {
    super(code); this.name = 'CloudflareProviderError'; this.code = code; this.status = status;
    this.retryAfter = retryAfter; this.retryable = retryable; this.emittedContent = emittedContent;
  }
}

function validSecret(value, pattern) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && pattern.test(v) ? v : null;
}

// Segundos hasta la medianoche UTC: el cupo gratuito diario de Workers AI
// («neuronas») se reinicia a las 00:00 UTC.
export { validSecret };

export function secondsToUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

const toProviderError = (error, emittedContent = false) =>
  error instanceof CloudflareProviderError ? error
    : new CloudflareProviderError(error?.code || 'network_or_timeout', { retryable: error?.retryable ?? true, emittedContent });

/**
 * Mismo cliente para cualquier proveedor compatible con OpenAI. Por defecto,
 * Cloudflare; openrouter.mjs lo usa con otro nombre, endpoint, clave y cuerpo.
 */
export function createCloudflareProvider({
  getEnv = (name) => Deno.env.get(name), fetchImpl = fetch,
  now = () => Date.now(), logger = console,
  name = 'cloudflare',
  credentialsFrom = (env) => {
    const key = validSecret(env(CLOUDFLARE_KEY_NAME), /^[^\s"']{20,200}$/);
    const account = validSecret(env(CLOUDFLARE_ACCOUNT_NAME), /^[0-9a-f]{32}$/i);
    return key && account ? { key, account } : null;
  },
  endpointFor = (creds) => cloudflareEndpoint(creds.account),
  bodyFor = (body) => body,
} = {}) {
  let health = { failures: 0, cooldownUntil: 0 };
  const credentials = () => credentialsFrom(getEnv);
  const log = (fields) => logger.log(JSON.stringify({ provider: name, ...fields }));
  const fail = (kind) => {
    const failures = health.failures + 1;
    const cooldown = kind === 'auth' ? AUTH_COOLDOWN_MS : failures >= 2 ? TRANSIENT_COOLDOWN_MS : 0;
    health = { failures, cooldownUntil: now() + cooldown };
  };

  async function open({ body, signal, timeoutMs, generationId, operation, beforeAttempt, pause }) {
    const creds = credentials();
    if (!creds) throw new CloudflareProviderError('missing_key');
    if (health.cooldownUntil > now()) {
      throw new CloudflareProviderError('provider_unavailable', { status: 503, retryable: true, retryAfter: Math.ceil((health.cooldownUntil - now()) / 1000) });
    }
    if (signal?.aborted) throw new CloudflareProviderError('aborted');
    const reservation = await beforeAttempt?.(name, body);
    const started = now();
    let response;
    try {
      const attempt = AbortSignal.timeout(timeoutMs);
      response = await fetchImpl(endpointFor(creds), {
        method: 'POST', signal: signal ? AbortSignal.any([signal, attempt]) : attempt,
        headers: { Authorization: `Bearer ${creds.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFor(body)),
      });
    } catch {
      if (signal?.aborted) throw new CloudflareProviderError('aborted');
      fail('transient');
      log({ generation: generationId, operation, result: 'network_or_timeout', duration_ms: now() - started });
      throw new CloudflareProviderError('network_or_timeout', { retryable: true });
    }
    if (response.ok && (!body.stream || response.body)) return { response, reservation, started };
    await response.body?.cancel().catch(() => {});
    if (response.status === 429) {
      // Casi siempre es el cupo diario gratuito: pausa hasta las 00:00 UTC
      // salvo que Cloudflare indique otra espera.
      const header = response.headers.get('retry-after');
      const retryAfter = header ? retryAfterSeconds(header, now()) : secondsToUtcMidnight(now());
      log({ generation: generationId, operation, result: 'rate_limit', retry_after: retryAfter });
      await pause?.(name, retryAfter);
      throw new CloudflareProviderError(retryAfter > 15 * 60 ? 'provider_daily_limit' : 'provider_rate_limit', { status: 429, retryAfter });
    }
    const kind = response.status === 401 || response.status === 403 ? 'auth'
      : response.status === 408 || response.status === 425 || response.status >= 500 ? 'transient' : 'request';
    // Solo el código de error del proveedor (números), nunca el texto: sirve
    // para saber por qué Cloudflare rechaza una petición (400) sin registrar contenido.
    let providerCode = null;
    if (kind === 'request') {
      try { const body = await response.clone().json(); providerCode = Number(body?.errors?.[0]?.code) || null; } catch { /* sin cuerpo JSON */ }
    }
    log({ generation: generationId, operation, result: kind, status: response.status, ...(providerCode ? { provider_code: providerCode } : {}), duration_ms: now() - started });
    if (kind === 'request') throw new CloudflareProviderError(`http_${response.status}`, { status: response.status });
    fail(kind);
    throw new CloudflareProviderError(`http_${response.status}`, { status: response.status >= 500 ? response.status : 503, retryable: true });
  }

  /** @param {{body: object, signal?: AbortSignal, timeoutMs?: number, generationId?: string, operation?: string, beforeAttempt?: (provider:string,body:Record<string,unknown>)=>Promise<unknown>, pause?: (provider:string,seconds:number)=>Promise<unknown>}} options */
  async function request({ body, signal = undefined, timeoutMs = 60_000, generationId = crypto.randomUUID(), operation = 'completion', beforeAttempt = undefined, pause = undefined }) {
    const { response, reservation, started } = await open({ body: { ...body, stream: false }, signal, timeoutMs, generationId, operation, beforeAttempt, pause });
    const data = await response.json();
    health = { failures: 0, cooldownUntil: 0 };
    await reservation?.reconcile?.(data?.usage).catch(() => {});
    log({ generation: generationId, operation, result: 'success', duration_ms: now() - started });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  /** @param {{body: object, signal?: AbortSignal, timeoutMs?: number, generationId?: string, operation?: string, beforeAttempt?: (provider:string,body:Record<string,unknown>)=>Promise<unknown>, pause?: (provider:string,seconds:number)=>Promise<unknown>}} options */
  async function* stream({ body, signal = undefined, timeoutMs = 60_000, generationId = crypto.randomUUID(), operation = 'chat_stream', beforeAttempt = undefined, pause = undefined }) {
    const { response, reservation, started } = await open({ body: { ...body, stream: true }, signal, timeoutMs, generationId, operation, beforeAttempt, pause });
    let emittedContent = false; let usage = null;
    try {
      for await (const chunk of parseSSE(response.body)) {
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) emittedContent = true;
        if (chunk?.usage) usage = chunk.usage;
        yield chunk;
      }
    } catch (error) {
      if (signal?.aborted) throw new CloudflareProviderError('aborted', { emittedContent });
      fail('transient');
      log({ generation: generationId, operation, result: emittedContent ? 'stream_interrupted' : 'network_or_timeout', duration_ms: now() - started });
      throw emittedContent ? new CloudflareProviderError('stream_interrupted', { emittedContent: true }) : toProviderError(error);
    }
    if (!emittedContent) {
      fail('transient');
      throw new CloudflareProviderError('empty_stream', { retryable: true });
    }
    health = { failures: 0, cooldownUntil: 0 };
    await reservation?.reconcile?.(usage).catch(() => {});
    log({ generation: generationId, operation, result: 'success', duration_ms: now() - started });
  }

  return { request, stream, configured: () => credentials() !== null, configuredKeyCount: () => (credentials() ? 1 : 0) };
}

export const cloudflareProvider = createCloudflareProvider();
