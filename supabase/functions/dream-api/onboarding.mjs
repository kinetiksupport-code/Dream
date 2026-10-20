// Bienvenida y consentimiento (prompt «bienvenida» §4.4, docs/CONSENTIMIENTO.md).
// Lógica pura del servidor: validación de cada paso, edad mínima, puerta de
// las acciones de IA y personalización sin enviar datos que identifiquen al
// alumno (el apodo nunca va al proveedor: la IA escribe {{APODO}} y aquí se
// sustituye al devolver, también en streaming).

/** Edad mínima (Carlos, 18/10/2026). Sin vía de tutor. */
export const MIN_AGE = 14;
/** Igual que lib/consent.ts › TERMS_VERSION. tests/onboarding-server.test.ts lo comprueba. */
export const TERMS_VERSION = '2026-10-20';
/** Textos exactos de las casillas (lib/consent.ts › CONSENT_TEXT). Se guardan tal cual en consent_events. */
export const CONSENT_TEXT = Object.freeze({
  ai: 'Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme',
  terms: 'He leído y acepto los Términos y la Política de privacidad',
});
export const LIMITS = Object.freeze({ name: 40, nickname: 20, interest: 30, interests: 8, step: 6 });
export const NICKNAME_MARKER = '{{APODO}}';

export class OnboardingError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const clean = (value, max) => [...String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
const same = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

/**
 * onboarding_save: valida solo los campos que llegan. Devuelve el parche de
 * dream_profiles. El nombre es obligatorio si llega; el apodo y las aficiones
 * pueden quedar vacíos.
 */
export function onboardingPatch(body) {
  const patch = {};
  if (body.display_name !== undefined) {
    if (typeof body.display_name !== 'string') throw new OnboardingError('Nombre no válido.', 'invalid_name');
    const name = clean(body.display_name, Infinity);
    if (!name) throw new OnboardingError('Escribe cómo te llamas.', 'invalid_name');
    if ([...name].length > LIMITS.name) throw new OnboardingError(`Tu nombre puede tener hasta ${LIMITS.name} letras.`, 'invalid_name');
    patch.display_name = name;
  }
  if (body.nickname !== undefined) {
    if (typeof body.nickname !== 'string') throw new OnboardingError('Apodo no válido.', 'invalid_nickname');
    const nickname = clean(body.nickname, Infinity);
    if ([...nickname].length > LIMITS.nickname) throw new OnboardingError(`El apodo puede tener hasta ${LIMITS.nickname} letras.`, 'invalid_nickname');
    patch.nickname = nickname || null;
  }
  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.length > LIMITS.interests)
      throw new OnboardingError(`Elige hasta ${LIMITS.interests} cosas que te gusten.`, 'invalid_interests');
    const list = [];
    for (const raw of body.interests) {
      if (typeof raw !== 'string') throw new OnboardingError('Afición no válida.', 'invalid_interests');
      const item = clean(raw, Infinity);
      if (!item) continue;
      if ([...item].length > LIMITS.interest) throw new OnboardingError(`Cada afición puede tener hasta ${LIMITS.interest} letras.`, 'invalid_interests');
      if (!list.some((x) => same(x, item))) list.push(item);
    }
    patch.interests = list;
  }
  if (body.step !== undefined) {
    if (!Number.isInteger(body.step) || body.step < 0 || body.step > 4) throw new OnboardingError('Paso no válido.', 'invalid_step');
    patch.onboarding_step = body.step;
  }
  if (!Object.keys(patch).length) throw new OnboardingError('No hay nada que guardar.', 'empty');
  return patch;
}

/** Fecha local YYYY-MM-DD de `today` en Madrid (el día del alumno, no UTC). */
export function madridToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Años cumplidos, o null si la fecha no es real, es futura o anterior a 1900. */
export function ageOn(birth, today = madridToday()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? ''));
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m || !t) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1900 || birth > today) return null;
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age--;
  return age;
}

export function ageBand(age) {
  return age >= 18 ? '18_plus' : '14_17';
}

/** Lo que se borra cuando un menor de 14 llega al paso de la edad. */
export const MINOR_RESET = Object.freeze({
  display_name: null,
  nickname: null,
  interests: [],
  onboarding_step: 0,
  birth_date: null,
  age_band: null,
});

/**
 * consent: valida la petición contra el perfil guardado. Manda el servidor:
 * la edad se calcula aquí y una fecha ya guardada no se cambia.
 * Devuelve { patch, events } o lanza OnboardingError.
 */
export function consentDecision(body, profile, now = new Date()) {
  const today = madridToday(now);
  const birth = profile?.birth_date ?? body.birth_date;
  const age = ageOn(birth, today);
  if (age === null) throw new OnboardingError('Indica una fecha de nacimiento válida.', 'invalid_birth_date');
  if (age < MIN_AGE) throw new OnboardingError(`Dream es para mayores de ${MIN_AGE} años.`, 'under_age', 403);
  if (body.ai_consent !== true) throw new OnboardingError('Sin este permiso Dream no puede responderte.', 'ai_consent_required');
  if (body.terms_accepted !== true) throw new OnboardingError('Para usar Dream tienes que aceptar los Términos y la Política de privacidad.', 'terms_required');
  if (body.terms_version !== TERMS_VERSION) throw new OnboardingError('Los Términos han cambiado. Recarga la página y vuelve a leerlos.', 'terms_outdated', 409);
  const at = now.toISOString();
  return {
    patch: {
      birth_date: birth,
      age_band: ageBand(age),
      ai_consent_at: at,
      terms_accepted_at: at,
      terms_version: TERMS_VERSION,
      onboarding_completed: true,
      onboarding_step: LIMITS.step,
    },
    events: [
      { kind: 'ai', granted: true, text_shown: CONSENT_TEXT.ai, terms_version: TERMS_VERSION },
      { kind: 'terms', granted: true, text_shown: CONSENT_TEXT.terms, terms_version: TERMS_VERSION },
    ],
  };
}

/**
 * Puerta de las acciones que envían contenido a un proveedor de IA. null =
 * puede seguir; si no, el error con code consent_required. Con el esquema
 * antiguo (sin terms_version en el perfil) no bloquea: así este código puede
 * desplegarse antes que la migración sin dejar a nadie sin chat.
 */
export function consentBlock(profile) {
  if (!profile || !('terms_version' in profile)) return null;
  if (!profile.ai_consent_at || !profile.terms_accepted_at || profile.terms_version !== TERMS_VERSION)
    return new OnboardingError('Para usar Dream, acepta antes enviar tu información a los proveedores de IA.', 'consent_required', 403);
  return null;
}

/** Campos de la bienvenida en la acción profile (nunca birth_date). */
export function welcomeFields(profile) {
  if (!profile || !('terms_version' in profile)) return {};
  return {
    ai_consent_at: profile.ai_consent_at ?? null,
    terms_accepted_at: profile.terms_accepted_at ?? null,
    terms_version: profile.terms_version ?? null,
    age_band: profile.age_band === 'under_14' ? null : (profile.age_band ?? null),
    nickname: profile.nickname ?? null,
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    onboarding_completed: profile.onboarding_completed === true,
    onboarding_step: Number.isInteger(profile.onboarding_step) ? profile.onboarding_step : 0,
  };
}

/**
 * Contexto de personalización para el prompt de sistema. Sin nombre, correo
 * ni identificadores: solo el marcador del apodo y, si hay, las aficiones.
 * Va en el contexto dinámico (un mensaje de sistema corto), no en cada turno
 * del historial.
 */
export function personalContext(profile, { interests = true } = {}) {
  // Sin la migración de la bienvenida, nada cambia (ni marcador ni aficiones).
  if (!profile || !('terms_version' in profile)) return '';
  const lines = [];
  if (profile?.nickname || profile?.display_name)
    lines.push(`- Cuando te dirijas al alumno por su nombre, escribe exactamente ${NICKNAME_MARKER} (Dream lo cambia por el nombre que eligió). No lo uses en cada frase.`);
  const list = interests && Array.isArray(profile?.interests) ? profile.interests.slice(0, LIMITS.interests) : [];
  if (list.length)
    lines.push(`- Le gusta: ${list.map((x) => clean(x, LIMITS.interest)).join(', ')}. Úsalo solo si ayuda a poner un ejemplo; no lo menciones por mencionarlo.`);
  return lines.join('\n');
}

/** El nombre que sustituye al marcador: el apodo, o el primer nombre. */
export function nicknameFor(profile) {
  const nick = clean(profile?.nickname ?? '', LIMITS.nickname);
  if (nick) return nick;
  return clean(profile?.display_name ?? '', LIMITS.name).split(' ')[0] || '';
}

/**
 * Sustituye {{APODO}} en un texto que llega a trozos. Guarda al final de cada
 * trozo lo que podría ser el principio de un marcador partido («{{AP») hasta
 * el siguiente trozo; flush() devuelve lo que quede.
 */
export function createNicknameReplacer(nickname) {
  const value = nickname || '';
  let pending = '';
  const replaceAll = (text) => text.split(NICKNAME_MARKER).join(value);
  return {
    push(chunk) {
      const text = pending + chunk;
      let keep = 0;
      for (let n = Math.min(NICKNAME_MARKER.length - 1, text.length); n > 0; n--) {
        if (NICKNAME_MARKER.startsWith(text.slice(-n))) { keep = n; break; }
      }
      pending = keep ? text.slice(-keep) : '';
      return replaceAll(keep ? text.slice(0, -keep) : text);
    },
    flush() {
      const rest = pending;
      pending = '';
      return replaceAll(rest);
    },
  };
}

/** Lo mismo para un texto completo (respuestas sin streaming). */
export function replaceNickname(text, nickname) {
  return String(text ?? '').split(NICKNAME_MARKER).join(nickname || '');
}
