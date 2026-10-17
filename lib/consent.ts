/**
 * Sign-up consent (Parte D). Pure logic and fixed texts, shared by the welcome
 * screen and its tests. Server design: docs/CONSENTIMIENTO.md.
 *
 * The texts come from the legal drafts (Política de privacidad §6 y §7,
 * Términos §2). Do not reword them here without changing those documents.
 */

/** Spanish age of digital consent (LOPDGDD art. 7). */
export const GUARDIAN_AGE = 14;

export const CONSENT_TEXT = {
  guardian:
    "Mi padre, madre o tutor legal me ha dado permiso para usar Dream y acepta la Política de privacidad y los Términos y condiciones",
  ai: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme",
} as const;

/** AI disclosure (EU AI Act, art. 50), fixed next to the chat composer. */
export const AI_NOTICE =
  "Estás hablando con una IA. Puede equivocarse: contrasta lo importante.";

export const CONSENT_ERRORS = {
  birthMissing:
    "Escribe tu fecha de nacimiento. Sirve para saber si necesitas el permiso de tu familia.",
  birthInvalid: "Revisa la fecha: tiene que ser un día real y anterior a hoy.",
  guardian:
    "Con menos de 14 años necesitas el permiso de tu padre, madre o tutor legal. Márcalo para continuar.",
  ai: "Sin este permiso Dream no puede responderte. Márcalo para continuar.",
} as const;

/** Consent fields of the profile. Absent while dream-api does not send them. */
export interface ConsentProfile {
  age_band?: "under_14" | "14_17" | "18_plus" | null;
  guardian_required?: boolean;
  guardian_confirmed_at?: string | null;
  ai_consent_at?: string | null;
}

/**
 * True when the server says consent is missing. While dream-api does not
 * return `ai_consent_at` at all (today), the app keeps working as before: the
 * gate cannot be completed without the server action, so it stays off. The
 * real protection is on the server (docs/CONSENTIMIENTO.md).
 */
export function needsConsent(profile: ConsentProfile | null | undefined) {
  if (!profile || profile.ai_consent_at === undefined) return false;
  if (!profile.ai_consent_at) return true;
  if (!profile.age_band) return true;
  return !!profile.guardian_required && !profile.guardian_confirmed_at;
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
  birthDate: string;
  guardian: boolean;
  ai: boolean;
}
export type ConsentField = "birthDate" | "guardian" | "ai";
export type ConsentErrors = Partial<Record<ConsentField, string>>;

/** Field order on screen: the first error gets the focus. */
export const CONSENT_FIELDS: ConsentField[] = ["birthDate", "guardian", "ai"];

export function validateConsent(
  input: ConsentInput,
  today = new Date(),
): ConsentErrors {
  const errors: ConsentErrors = {};
  const age = input.birthDate ? ageOn(input.birthDate, today) : null;
  if (!input.birthDate) errors.birthDate = CONSENT_ERRORS.birthMissing;
  else if (age === null) errors.birthDate = CONSENT_ERRORS.birthInvalid;
  if (age !== null && age < GUARDIAN_AGE && !input.guardian)
    errors.guardian = CONSENT_ERRORS.guardian;
  if (!input.ai) errors.ai = CONSENT_ERRORS.ai;
  return errors;
}
