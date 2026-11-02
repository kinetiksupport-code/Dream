"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cookiebotPage } from "@/lib/cookie-consent";
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
  const pathname = usePathname();
  // Cookiebot stays in memory after a client-side jump from the landing into
  // the app: globals.css hides its banner and icon there.
  useEffect(() => {
    document.documentElement.dataset.cookiebot = cookiebotPage(pathname) ? "on" : "off";
  }, [pathname]);
  useEffect(() => {
    if (!consent.decided || consent.preferences) return;
    clearCrispCookies(document, window.location.hostname);
    clearCrispStorage(storages());
    if (chatLoadedHere(window as unknown as { $crisp?: unknown })) window.location.reload();
  }, [consent.decided, consent.preferences]);
  return null;
}
