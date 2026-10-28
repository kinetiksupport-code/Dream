"use client";
import { useEffect } from "react";
import { useCookieConsent } from "@/lib/use-cookie-consent";
import { chatLoadedHere, clearCrispCookies, clearCrispStorage } from "@/lib/consent-cleanup";

const storages = () => {
  const list: Array<Storage | null> = [];
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      list.push(get());
    } catch {
      list.push(null);
    }
  }
  return list;
};

/**
 * Withdrawing consent is as easy as giving it: when the decision says «no» to
 * Preferences, the support chat's cookies and storage are removed, and if the
 * chat was open in this page, the page reloads so its connection closes.
 */
export function ConsentWatcher() {
  const consent = useCookieConsent();
  useEffect(() => {
    if (!consent.decided || consent.preferences) return;
    clearCrispCookies(document, window.location.hostname);
    clearCrispStorage(storages());
    if (chatLoadedHere(window as unknown as { $crisp?: unknown })) window.location.reload();
  }, [consent.decided, consent.preferences]);
  return null;
}
