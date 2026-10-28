"use client";
import { useSyncExternalStore } from "react";
import {
  CONSENT_EVENTS,
  NO_CONSENT,
  readConsent,
  type ConsentState,
  type ConsentWindow,
} from "@/lib/cookie-consent";

// The student's cookie decision, live. Any feature that needs consent reads it
// from here (Crisp today). On the server there is no decision: NO_CONSENT.
let snapshot: ConsentState = NO_CONSENT;
function current(): ConsentState {
  const next = readConsent(window as unknown as ConsentWindow);
  if (
    next.ready !== snapshot.ready ||
    next.decided !== snapshot.decided ||
    next.preferences !== snapshot.preferences ||
    next.statistics !== snapshot.statistics
  )
    snapshot = next;
  return snapshot;
}
function subscribe(onChange: () => void) {
  for (const name of CONSENT_EVENTS) window.addEventListener(name, onChange);
  return () => {
    for (const name of CONSENT_EVENTS) window.removeEventListener(name, onChange);
  };
}

export function useCookieConsent(): ConsentState {
  return useSyncExternalStore(subscribe, current, () => NO_CONSENT);
}
