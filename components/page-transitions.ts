"use client";
// Page transitions inside the Shell (PROMPT_EXAMEN_ESTILO.md §3).
//
// - A click on an internal link starts a View Transition (when the browser
//   has one) that waits for the new route, at most VT_MAX_WAIT_MS, then lets
//   CSS slide the page area (globals.css, «Transiciones entre páginas»). The
//   click itself is untouched: next/link still navigates, prefetches, honours
//   `replace` and `scroll`, so nothing is ever blocked.
// - Browser Back/Forward never waits: the new page plays the CSS enter
//   animation in the right direction, or nothing when the browser already
//   animated a swipe-back. The scroll position of the page area is restored.
// - Without View Transitions the same CSS enter animation runs on mount.
// Motion: transform + opacity only; reduced motion keeps a 120 ms fade.
import { useEffect, useState } from "react";
import {
  linkTarget,
  routeDirection,
  routeKey,
  VT_MAX_WAIT_MS,
  type PageDirection,
  type PageEnter,
} from "@/lib/page-transition";

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}
type DocWithVT = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike;
};
interface NavigateEventLike extends Event {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { index: number; url: string };
  hasUAVisualTransition?: boolean;
}
interface NavigationLike extends EventTarget {
  currentEntry: { index: number; key: string } | null;
}

/** Module state shared by the listeners and the hook (one Shell per page). */
const state = {
  /** A View Transition is waiting for the route to change. */
  waiting: null as null | { to: string; done: () => void },
  /** Direction of a Back/Forward that has not committed yet. */
  traversal: null as null | { dir: "back" | "forward" | "instant" },
  /** Scroll offsets of the page area per history entry (memory only). */
  scroll: new Map<string, number>(),
  /** Don't record scroll while the page area swaps content. */
  frozen: false,
};

const SCROLLER = ".workspace-main";
const navigation = (): NavigationLike | null =>
  (window as unknown as { navigation?: NavigationLike }).navigation ?? null;
const entryKey = () => navigation()?.currentEntry?.key ?? location.href;
let unfreeze = 0;
/** Stop recording scroll while the page swaps (safety net: 1 s). */
function freeze() {
  state.frozen = true;
  window.clearTimeout(unfreeze);
  unfreeze = window.setTimeout(() => (state.frozen = false), 1000);
}

function rememberScroll(key = entryKey()) {
  const el = document.querySelector<HTMLElement>(SCROLLER);
  if (!el) return;
  state.scroll.set(key, el.scrollTop);
  // Keep the map small: it only needs the recent history.
  if (state.scroll.size > 60)
    state.scroll.delete(state.scroll.keys().next().value as string);
}

/** Restores the page area's scroll once the content is tall enough. */
function restoreScroll(top: number) {
  let frames = 0;
  let cancelled = false;
  const stop = () => (cancelled = true);
  const opts = { once: true, passive: true, capture: true } as const;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  const step = () => {
    const el = document.querySelector<HTMLElement>(SCROLLER);
    if (cancelled || !el) return;
    if (el.scrollHeight - el.clientHeight >= top - 1 || frames > 40) {
      el.scrollTop = top;
      return;
    }
    frames++;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function startTransition(to: string, dir: PageDirection) {
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== "function") return;
  state.waiting?.done(); // a quicker second click replaces the first
  const root = document.documentElement;
  root.dataset.pageTransition = dir;
  let finish = () => {};
  const update = () =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        // The route is slow (data on the server): don't keep the screen
        // frozen. Skip the animation; the page will enter with CSS.
        if (state.waiting?.to === to) state.waiting = null;
        transition.skipTransition();
        resolve();
      }, VT_MAX_WAIT_MS);
      finish = () => {
        window.clearTimeout(timer);
        resolve();
      };
      if (!state.waiting || state.waiting.to !== to) resolve();
    });
  state.waiting = { to, done: () => finish() };
  const transition = doc.startViewTransition(update);
  const cleanup = () => {
    if (root.dataset.pageTransition === dir) delete root.dataset.pageTransition;
  };
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  transition.finished.then(cleanup, cleanup);
}

function onClick(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || !link.closest(".app-shell"))
    return;
  const to = linkTarget(
    e,
    {
      href: link.href,
      target: link.getAttribute("target"),
      download: link.hasAttribute("download"),
      optOut: link.dataset.transition === "off",
    },
    location,
  );
  if (!to) return;
  rememberScroll();
  freeze();
  const from = routeKey(location.pathname, location.search);
  startTransition(to, routeDirection(from, to) ?? "lateral");
}

function onNavigate(e: Event) {
  const n = e as NavigateEventLike;
  if (n.navigationType !== "traverse") return;
  rememberScroll();
  freeze();
  const current = navigation()?.currentEntry?.index ?? 0;
  state.traversal = {
    dir: n.hasUAVisualTransition
      ? "instant"
      : n.destination.index < current
        ? "back"
        : "forward",
  };
}

function onPopState() {
  freeze();
  // Without the Navigation API the direction is unknown: Back is far more
  // common, and the hierarchy decides when it is clear (see the hook).
  if (!navigation()) state.traversal ??= { dir: "back" };
}

function onScroll(e: Event) {
  const el = e.target;
  if (state.frozen || !(el instanceof HTMLElement) || !el.matches(SCROLLER))
    return;
  state.scroll.set(entryKey(), el.scrollTop);
}

/** Decides how the page that is about to mount enters (pure read). */
function enterFor(from: string, to: string): PageEnter {
  // A View Transition is about to capture this page (or a redirect of it).
  if (state.waiting) return "vt";
  if (state.traversal?.dir === "instant") return "instant";
  return routeDirection(from, to, state.traversal?.dir ?? null) ?? "fade";
}

/**
 * Installs the listeners once and returns the `data-enter` value for the
 * current `.route-view`. Call it on every render of the Shell, before any
 * early return.
 */
export function usePageTransitions(
  pathname: string,
  search: { get(name: string): string | null },
): PageEnter {
  const key = routeKey(pathname, search);
  const [view, setView] = useState({ key, path: pathname, enter: "fade" as PageEnter });
  if (view.key !== key) {
    // Only a new path remounts .route-view; a new query keeps its animation.
    setView({
      key,
      path: pathname,
      enter: view.path === pathname ? view.enter : enterFor(view.key, key),
    });
  }

  useEffect(() => {
    const nav = navigation();
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    nav?.addEventListener("navigate", onNavigate);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("scroll", onScroll, { capture: true });
      nav?.removeEventListener("navigate", onNavigate);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    // The new route is in the DOM: let the View Transition capture it.
    // (A redirect lands on another key: animate whatever arrived.)
    state.waiting?.done();
    state.waiting = null;
    const traversed = state.traversal !== null;
    state.traversal = null;
    const saved = state.scroll.get(entryKey());
    if (traversed && saved) restoreScroll(saved);
    // Record again once the swap has settled.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => (state.frozen = false)),
    );
    return () => cancelAnimationFrame(id);
  }, [key]);

  return view.enter;
}
