"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { COOKIEBOT, cookieDeclarationScript } from "@/lib/cookie-consent";
import { cookiesTabla } from "@/content/legal/cookies";

const WAIT_MS = 6000;

/**
 * Cookiebot's automatic declaration (cd.js) under our own introduction. The
 * script is created inside this box, so the declaration lands here; it is
 * trusted by the page CSP through 'strict-dynamic'. If it does not arrive
 * (blocker, offline, a domain Cookiebot does not cover), the table from our
 * own inventory is shown instead.
 */
export function CookieDeclaration() {
  const box = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(!COOKIEBOT.enabled);
  useEffect(() => {
    const el = box.current;
    if (!el || !COOKIEBOT.enabled) return;
    const script = document.createElement("script");
    script.id = "CookieDeclaration";
    script.src = cookieDeclarationScript(COOKIEBOT);
    script.async = true;
    script.dataset.culture = "es";
    script.onerror = () => setFallback(true);
    el.appendChild(script);
    const timer = window.setTimeout(() => {
      // Only the script tag inside: the declaration never arrived.
      if (el.childElementCount <= 1) setFallback(true);
    }, WAIT_MS);
    return () => {
      window.clearTimeout(timer);
      el.replaceChildren();
    };
  }, []);
  return (
    <>
      <div ref={box} className="cookie-declaration" aria-live="polite" />
      {fallback && (
        <div data-testid="cookie-table">
          <Markdown content={cookiesTabla} />
        </div>
      )}
    </>
  );
}
