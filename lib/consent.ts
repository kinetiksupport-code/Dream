/**
 * Sign-up consent (bienvenida, paso «Vas a hablar con una IA»). Pure logic and
 * fixed texts, shared by the welcome flow, its tests and dream-api (which
 * stores the exact text shown). Server design: docs/CONSENTIMIENTO.md.
 *
 * The texts come from the legal drafts (Política de privacidad §6 y §7,
 * Términos §2). Do not reword them here without changing those documents.
 */

/**
 * Minimum age to use Dream (Carlos, 18/10/2026; Spanish age of digital
 * consent, LOPDGDD art. 7). Under it there is no guardian path: the welcome
 * says goodbye and nothing is kept.
 */
export const MIN_AGE = 14;

/**
 * Version of the Términos and the Política that the student accepts. When the
 * texts change in a way that needs a new acceptance, bump it here and in
 * dream-api: the welcome comes back at the consent step.
 */
export const TERMS_VERSION = "2026-10-20";

export const CONSENT_TEXT = {
  ai: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme",
  terms: "He leído y acepto los Términos y la Política de privacidad",
} as const;

/** AI disclosure (EU AI Act, art. 50), fixed next to the chat composer. */
export const AI_NOTICE =
  "Estás hablando con una IA. Puede equivocarse: contrasta lo importante.";

/** The «Vas a hablar con una IA» screen, before the two boxes. */
export const AI_DISCLOSURE =
  "Dream funciona con inteligencia artificial. Estás hablando con una IA, no con una persona. Puede equivocarse: contrasta lo importante.";

export const CONSENT_ERRORS = {
  ai: "Sin este permiso Dream no puede responderte. Márcalo para continuar.",
  terms: "Para usar Dream tienes que aceptar los Términos y la Política de privacidad.",
} as const;

/**
 * Consent and welcome fields of the profile. All absent while dream-api does
 * not send them (today): then the welcome never shows.
 */
export interface ConsentProfile {
  age_band?: "14_17" | "18_plus" | null;
  ai_consent_at?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  nickname?: string | null;
  interests?: string[];
  onboarding_completed?: boolean;
  onboarding_step?: number | null;
}

/**
 * What the app must show before anything else:
 * - "off": today's server (no consent fields) or everything in order.
 * - "welcome": a new student; the whole welcome replaces the app.
 * - "consent": the welcome was done but the AI permission was withdrawn or the
 *   terms changed. Only the consent step; Ajustes stays open.
 * The real protection is on the server (docs/CONSENTIMIENTO.md).
 */
export function consentGate(
  profile: ConsentProfile | null | undefined,
): "off" | "welcome" | "consent" {
  if (!profile || profile.ai_consent_at === undefined) return "off";
  if (!profile.onboarding_completed) return "welcome";
  if (
    !profile.ai_consent_at ||
    !profile.terms_accepted_at ||
    profile.terms_version !== TERMS_VERSION ||
    !profile.age_band
  )
    return "consent";
  return "off";
}

/** Local calendar date as YYYY-MM-DD (the student's day, not UTC). */
export function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole years between a YYYY-MM-DD birth date and `today`, or null if invalid. */
export function ageOn(birth: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects 2026-02-30 and similar: the Date would roll over.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    y < 1900 ||
    birth > isoDate(today)
  )
    return null;
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() < mo - 1 ||
    (today.getMonth() === mo - 1 && today.getDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export interface ConsentInput {
  ai: boolean;
  terms: boolean;
}
export type ConsentField = keyof ConsentInput;
export type ConsentErrors = Partial<Record<ConsentField, string>>;

/** Order on screen: the first error gets the focus. */
export const CONSENT_FIELDS: ConsentField[] = ["ai", "terms"];

/** Nothing is accepted by default: both boxes must be ticked. */
export function validateConsent(input: ConsentInput): ConsentErrors {
  const errors: ConsentErrors = {};
  if (!input.ai) errors.ai = CONSENT_ERRORS.ai;
  if (!input.terms) errors.terms = CONSENT_ERRORS.terms;
  return errors;
}
