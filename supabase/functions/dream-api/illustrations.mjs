// Ilustraciones de los esquemas con FLUX en Cloudflare Workers AI (docs/ESQUEMAS.md,
// Bloque 5). Sin texto dentro: el texto lo pinta Dream. El prompt de la imagen lo
// construye el servidor a partir del `illustration_prompt` ya validado (nunca
// texto libre del alumno), con un estilo fijo. Cada imagen se guarda una vez por
// prompt (caché compartida: no lleva datos personales). Si falta la clave, se
// agota el cupo o el proveedor falla, el esquema sigue con las ilustraciones locales.

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const IMAGE_BUCKET = 'scheme-illustrations';
export const IMAGE_SIZE = Object.freeze({ width: 768, height: 512 });
/** Ilustraciones nuevas (no de caché) por alumno y día. */
export const ILLUSTRATIONS_PER_DAY = 12;
/** Tope global diario: ~26 Neurons por mosaico de 512 px → 300 imágenes ≈ 9.000 Neurons. */
export const ILLUSTRATIONS_GLOBAL_PER_DAY = 300;
/** Máximo de ilustraciones por esquema (igual que lib/esquema.ts). */
export const MAX_SCHEME_ILLUSTRATIONS = 4;

// Temas que no se dibujan (apta para menores). Mejor un paisaje local que una
// imagen dudosa.
const SENSITIVE = /\b(blood|gore|corpse|dead|death|kill|murder|torture|execution|hang(ed|ing)?|suicide|nud(e|ity)|naked|sex|sexy|erotic|drug|cocaine|alcohol|beer|wine|cigarette|smok(e|ing)|weapon|gun|rifle|pistol|bomb|explosion|terror|nazi|swastika|genocide|holocaust|slave|wound|injur|violent|violence|war crime)\b/i;
const PEOPLE = /\b(face|faces|portrait|selfie|close-?up|photo of (a|an) (man|woman|boy|girl|person))\b/i;

/**
 * Deja la descripción de la IA lista para el prompt: inglés plano, sin
 * comillas ni cifras (FLUX intentaría escribirlas), corta. null = no se dibuja.
 * @param {unknown} text
 */
export function sanitizeIllustrationPrompt(text) {
  const plain = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/["'«»“”‘’`]/g, '').replace(/\d+/g, '').replace(/[^A-Za-z ,.;:-]/g, ' ')
    .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim().slice(0, 160);
  if (plain.split(' ').length < 3) return null;
  if (SENSITIVE.test(plain) || PEOPLE.test(plain)) return null;
  return plain;
}

/** Prompt final, siempre con el mismo estilo (casan con la maqueta pastel). */
export function buildImagePrompt(subject) {
  return `${subject}. Soft digital painting for a school study sheet, warm colours, golden-hour light, gentle pastel tones, clean simple composition, background that fades into a light pastel colour. No text, no letters, no numbers, no captions, no signs, no logos, no watermark. No recognizable people and no realistic faces: only tiny distant silhouettes if any. Suitable for children.`;
}

export async function promptHash(prompt) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${IMAGE_MODEL}\n${prompt}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tipo de imagen por sus primeros bytes (el proveedor no lo dice). */
export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { mime: 'image/png', ext: 'png' };
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Pide una imagen a Workers AI (multipart: prompt, width, height). Devuelve los
 * bytes o lanza Error('image_*'). La clave no sale nunca del servidor.
 * @param {{ accountId: string, apiKey: string, prompt: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} options
 */
export async function generateImage({ accountId, apiKey, prompt, fetchImpl = fetch, signal = undefined }) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(IMAGE_SIZE.width));
  form.append('height', String(IMAGE_SIZE.height));
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${IMAGE_MODEL}`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
  });
  if (res.status === 429) { await res.body?.cancel(); throw new Error('image_quota'); }
  if (!res.ok) { await res.body?.cancel(); throw new Error(`image_http_${res.status}`); }
  const data = await res.json();
  const b64 = data?.result?.image ?? data?.image;
  if (typeof b64 !== 'string' || !b64) throw new Error('image_empty');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!imageType(bytes)) throw new Error('image_format');
  return bytes;
}

/** Interruptor: DREAM_ILLUSTRATIONS=off las apaga del todo. */
export function illustrationsEnabled(getEnv) {
  return String(getEnv('DREAM_ILLUSTRATIONS') ?? 'on').trim().toLowerCase() !== 'off';
}

/**
 * Qué secciones llevan ilustración: las mismas que dibuja la maqueta (con
 * descripción, sin fechas ni fórmulas, máx. 4), ya saneadas.
 * @param {{ sections: { kind: string, illustration_prompt: string | null }[] }} scheme
 */
export function illustrationTargets(scheme) {
  const out = [];
  for (const s of scheme?.sections ?? []) {
    if (out.length >= MAX_SCHEME_ILLUSTRATIONS) break;
    if (!s?.illustration_prompt || s.kind === 'dates' || s.kind === 'formula') continue;
    const subject = sanitizeIllustrationPrompt(s.illustration_prompt);
    if (subject) out.push({ key: s.illustration_prompt, prompt: buildImagePrompt(subject) });
  }
  return out;
}
