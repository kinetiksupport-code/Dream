// OpenRouter como fuente de respaldo GRATUITA (Bloque 9, punto 5), detrás de
// AI_FLAGS.openrouterFallback (APAGADO). Solo el modelo «:free» y siempre con
// «excluir proveedores que guardan o entrenan con los datos» (data_collection:
// deny). Antes de encenderlo: nombrarlo en la Política de privacidad (duda 11).
import { createCloudflareProvider, validSecret } from './cloudflare.mjs';

export const OPENROUTER_KEY_NAME = 'OPENROUTER_API_KEY';
export const OPENROUTER_MODEL = 'qwen/qwen3.8-27b:free';
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Cuerpo para OpenRouter: su modelo gratuito y sin proveedores que recojan datos. */
export function openrouterBody(body) {
  const { reasoning_format: _a, reasoning_effort: _b, include_reasoning: _c, ...rest } = body ?? {};
  return { ...rest, model: OPENROUTER_MODEL, provider: { data_collection: 'deny', allow_fallbacks: true } };
}

export function createOpenRouterProvider(options = {}) {
  return createCloudflareProvider({
    ...options,
    name: 'openrouter',
    credentialsFrom: (env) => {
      const key = validSecret(env(OPENROUTER_KEY_NAME), /^sk-or-[^\s"']{20,200}$/);
      return key ? { key } : null;
    },
    endpointFor: () => OPENROUTER_ENDPOINT,
    bodyFor: openrouterBody,
  });
}

export const openrouterProvider = createOpenRouterProvider();
