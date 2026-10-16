/**
 * "Lectura fácil" (Ajustes): Lexend with more line height. The CSS lives in
 * app/globals.css under :root[data-reading="easy"].
 *
 * Only this on/off preference is stored, in localStorage under
 * READING_KEY on this device (like the theme). It is not personal content and
 * is never sent anywhere.
 */
export const READING_KEY = "dream-reading";

/** Inline script for <head>: applies the saved choice before the first paint. */
export const READING_BOOT = `try{if(localStorage.getItem('${READING_KEY}')==='easy')document.documentElement.dataset.reading='easy'}catch(e){}`;

export function readEasyReading(): boolean {
  try {
    return localStorage.getItem(READING_KEY) === "easy";
  } catch {
    return false;
  }
}

export function applyEasyReading(on: boolean) {
  const root = document.documentElement;
  if (on) root.dataset.reading = "easy";
  else delete root.dataset.reading;
  try {
    if (on) localStorage.setItem(READING_KEY, "easy");
    else localStorage.removeItem(READING_KEY);
  } catch {}
}

/**
 * Cross-fades the whole page while `update` changes colours or type (theme,
 * easy reading). Only opacity animates (CSS in globals.css, "Ajustes"); where
 * View Transitions are not supported the change is simply instant.
 */
export function crossFade(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (typeof doc.startViewTransition !== "function") return update();
  doc.startViewTransition(update);
}
