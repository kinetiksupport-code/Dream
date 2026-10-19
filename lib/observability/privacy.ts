export interface PrivacyPreferences {
  analytics: boolean;
  diagnostics: boolean;
}
export const privacyEvent = "dream:privacy-changed";
const key = "dream-privacy-v1";
export function privacySignal(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true)
  );
}
/**
 * Pages that carry a secret in the URL (the QR upload link, /subir#<token>)
 * never send analytics or diagnostics, whatever the saved choice.
 */
export function isPrivatePath(pathname: string): boolean {
  return pathname === "/subir" || pathname.startsWith("/subir/");
}
export function readPrivacy(): PrivacyPreferences {
  if (
    typeof window === "undefined" ||
    privacySignal() ||
    isPrivatePath(window.location.pathname)
  )
    return { analytics: false, diagnostics: false };
  try {
    const p: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    if (typeof p === "object" && p !== null) {
      const v = p as Record<string, unknown>;
      return {
        analytics: v.analytics === true,
        diagnostics: v.diagnostics === true,
      };
    }
  } catch {}
  return { analytics: false, diagnostics: false };
}
export function savePrivacy(p: PrivacyPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {}
  window.dispatchEvent(new Event(privacyEvent));
}
