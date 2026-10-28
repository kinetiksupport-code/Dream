// Cookiebot by Usercentrics (docs/cookiebot-panel.md, docs/cookies-inventario.md).
// The banner and the consent record are Cookiebot's; this module only reads
// the decision and asks for it. Dream never uses advertising, profiling or
// cross-site tracking cookies: the «Marketing» category stays empty and is
// never granted from code.
//
// Google Consent Mode v2 is not needed: Dream has no Google tags. If Google
// Analytics is ever added, turn Consent Mode on in the Cookiebot panel with
// every default set to "denied" and load the tag with afterInteractive.

/** Public domain group id given by Carlos (not a secret). */
export const COOKIEBOT_DEFAULT_CBID = "d0c2f6fa-09c9-4036-8807-4ed977783c45";
const CBID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CookiebotConfig {
  /** false: no Cookiebot at all (NEXT_PUBLIC_COOKIEBOT_CBID=off). */
  enabled: boolean;
  cbid: string;
  /** "auto" as Carlos asked; "manual" is the documented fallback for the Free plan. */
  blockingMode: "auto" | "manual";
  /** consent.cookiebot.com, or the EU CDN (consent.cookiebot.eu) when Carlos confirms it. */
  tld: "com" | "eu";
}

export function cookiebotConfig(env: {
  cbid?: string;
  blockingMode?: string;
  tld?: string;
}): CookiebotConfig {
  const raw = env.cbid?.trim();
  const off = raw === "off" || (!!raw && !CBID_PATTERN.test(raw));
  return {
    enabled: !off,
    cbid: raw && !off ? raw : COOKIEBOT_DEFAULT_CBID,
    blockingMode: env.blockingMode === "manual" ? "manual" : "auto",
    tld: env.tld === "eu" ? "eu" : "com",
  };
}

/** Read once per process: the NEXT_PUBLIC_ values are inlined at build time. */
export const COOKIEBOT = cookiebotConfig({
  cbid: process.env.NEXT_PUBLIC_COOKIEBOT_CBID,
  blockingMode: process.env.NEXT_PUBLIC_COOKIEBOT_BLOCKINGMODE,
  tld: process.env.NEXT_PUBLIC_COOKIEBOT_TLD,
});

/** Official Cookiebot hosts (script, consent API, declaration iframe, pixel). */
export function cookiebotHosts(tld: CookiebotConfig["tld"]) {
  return {
    consent: `https://consent.cookiebot.${tld}`,
    cdn: `https://consentcdn.cookiebot.${tld}`,
    pixel: `https://imgsct.cookiebot.${tld}`,
  };
}
export const cookiebotScript = (c: CookiebotConfig) => `${cookiebotHosts(c.tld).consent}/uc.js`;
export const cookieDeclarationScript = (c: CookiebotConfig) =>
  `${cookiebotHosts(c.tld).consent}/${c.cbid}/cd.js`;

/**
 * Cookiebot (banner and floating icon) only on the landing and the legal
 * pages: Términos, Privacidad and the cookie policy. Before consent the app
 * only uses strictly necessary storage (docs/cookies-inventario.md), so it
 * needs no banner; inside it, the decision is read from the CookieConsent
 * cookie and «Configurar cookies» goes to /cookies.
 */
export const COOKIEBOT_PAGES: readonly string[] = ["/", "/terminos", "/privacidad", "/cookies"];
export const cookiebotPage = (pathname: string) => COOKIEBOT_PAGES.includes(pathname);

export interface ConsentState {
  /** Cookiebot's script is on the page and answered. */
  ready: boolean;
  /** The student pressed a button in the banner (silence is never consent). */
  decided: boolean;
  preferences: boolean;
  statistics: boolean;
}
export const NO_CONSENT: ConsentState = {
  ready: false,
  decided: false,
  preferences: false,
  statistics: false,
};

interface CookiebotApi {
  consent?: { preferences?: boolean; statistics?: boolean; marketing?: boolean };
  hasResponse?: boolean;
  consented?: boolean;
  declined?: boolean;
  renew?: () => void;
  submitCustomConsent?: (preferences: boolean, statistics: boolean, marketing: boolean) => void;
}
export interface ConsentWindow {
  Cookiebot?: CookiebotApi;
}

/** Events Cookiebot fires on window (docs: Cookiebot SDK, "Events"). */
export const CONSENT_EVENTS = [
  "CookiebotOnLoad",
  "CookiebotOnConsentReady",
  "CookiebotOnAccept",
  "CookiebotOnDecline",
] as const;

/**
 * The decision, from Cookiebot when it is on the page, or else from its
 * CookieConsent cookie (app pages, where Cookiebot is not loaded).
 */
export function readConsent(win: ConsentWindow | undefined, cookie?: string): ConsentState {
  const api = win?.Cookiebot;
  if (!api || typeof api !== "object") return consentFromCookie(cookie);
  const c = api.consent ?? {};
  const decided = api.hasResponse === true;
  return {
    ready: true,
    decided,
    // Only a real decision counts: before it, Cookiebot reports false anyway.
    preferences: decided && c.preferences === true,
    statistics: decided && c.statistics === true,
  };
}

/**
 * Cookiebot's own cookie: `{stamp:'…',necessary:true,preferences:false,…}`,
 * URL-encoded. Anything else (no cookie, «-1» for regions without consent,
 * garbage) is no decision.
 */
export function consentFromCookie(cookie: string | undefined): ConsentState {
  const match = cookie?.match(/(?:^|;\s*)CookieConsent=([^;]*)/);
  if (!match) return NO_CONSENT;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return NO_CONSENT;
  }
  const flag = (key: string) => new RegExp(`["']?${key}["']?\\s*:\\s*(true|false)\\b`).exec(value)?.[1];
  if (!flag("preferences")) return NO_CONSENT;
  return { ready: false, decided: true, preferences: flag("preferences") === "true", statistics: flag("statistics") === "true" };
}

/**
 * «Permitir y abrir» in the support sheet: grants Preferences and keeps the
 * student's earlier choice on Statistics. Marketing is always false.
 * Returns false when Cookiebot is not on the page (app pages, blocker).
 */
export function grantPreferences(win: ConsentWindow | undefined): boolean {
  const api = win?.Cookiebot;
  if (typeof api?.submitCustomConsent !== "function") return false;
  try {
    api.submitCustomConsent(true, readConsent(win).statistics, false);
    return true;
  } catch {
    return false;
  }
}

/** «Configurar cookies»: opens Cookiebot's banner again. */
export function renewConsent(win: ConsentWindow | undefined): boolean {
  const api = win?.Cookiebot;
  if (typeof api?.renew !== "function") return false;
  try {
    api.renew();
    return true;
  } catch {
    return false;
  }
}
