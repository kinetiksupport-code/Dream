// Cuentas de Fundación Loyola: sin límite de uso (Bloque 5, decidido por
// Carlos el 22/10/2026). Único sitio con la lista de dominios; nunca en el
// cliente. Ni el correo ni el dominio se envían a la IA.
//
// «Sin límite» = sin ventana de 5 horas ni tope diario por alumno, pero con un
// límite por minuto contra abusos (limits.special_rpm, 20 por defecto) y la
// misma cola que el resto, sin prioridad.

export const SPECIAL_EMAIL_DOMAINS = Object.freeze(['fundacionloyola.net', 'fundacionloyola.es']);

export const SPECIAL_WELCOME = 'Eres alumno de Fundación Loyola: no tienes límite de uso en Dream.';
export const SPECIAL_RPM_MESSAGE = 'Vas muy rápido, espera unos segundos.';

/** Dominio exacto tras la ÚLTIMA @, en minúsculas; '' si no es un correo. */
export function emailDomain(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return '';
  const domain = value.slice(at + 1);
  return /^[a-z0-9.-]+$/.test(domain) ? domain : '';
}

/** ¿Google dice que el correo está verificado? */
function googleVerified(user) {
  if (!user?.email_confirmed_at) return false;
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const google = identities.find((i) => i?.provider === 'google');
  const data = google?.identity_data ?? user?.user_metadata ?? {};
  return data.email_verified === true || data.email_verified === 'true';
}

/**
 * Dominio especial de la cuenta, o null. Exige el correo verificado de Google
 * y el dominio EXACTO (`x@fundacionloyola.net.otra.com` o
 * `fundacionloyola.net@gmail.com` no cuelan). Si Google manda `hd` (cuenta de
 * Workspace), también tiene que coincidir.
 * @param {any} user usuario de Supabase Auth
 */
export function specialDomain(user, domains = SPECIAL_EMAIL_DOMAINS) {
  if (!googleVerified(user)) return null;
  const domain = emailDomain(user.email);
  if (!domain || !domains.includes(domain)) return null;
  const google = (Array.isArray(user?.identities) ? user.identities : []).find((i) => i?.provider === 'google');
  const hd = google?.identity_data?.hd ?? user?.user_metadata?.hd;
  if (typeof hd === 'string' && hd.trim() && hd.trim().toLowerCase() !== domain) return null;
  return domain;
}
