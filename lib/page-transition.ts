// Page transitions (PROMPT_EXAMEN_ESTILO.md §3). Pure helpers, unit-tested in
// tests/page-transition.test.ts; the browser side lives in
// components/page-transitions.ts and the motion itself in app/globals.css
// («Transiciones entre páginas»).
//
// Next.js 15.5.27 only offers View Transitions behind
// `experimental.viewTransition`, which switches the app to React's
// experimental build, so Dream wraps the browser's own
// `document.startViewTransition` instead and falls back to a CSS enter
// animation (transform + opacity) where it is missing.

/** How the new page enters. */
export type PageDirection = "forward" | "back" | "lateral";
/**
 * Value of `data-enter` on `.route-view`:
 * - a direction: CSS enter animation (no View Transition ran);
 * - "fade": first load, short fade (as before);
 * - "vt": a View Transition already animated it, so no CSS animation;
 * - "instant": the browser animated it itself (swipe back), nothing to add.
 */
export type PageEnter = PageDirection | "fade" | "vt" | "instant";

/** Query parameters that change what the page shows (the rest are details). */
const VIEW_PARAMS = ["view", "c"] as const;

/** Identity of a page for transitions: path plus the params that switch view. */
export function routeKey(
  pathname: string,
  search: URLSearchParams | { get(name: string): string | null } | string = "",
): string {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const parts = VIEW_PARAMS.flatMap((p) => {
    const v = params.get(p);
    return v ? [`${p}=${v}`] : [];
  });
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return parts.length ? `${path}?${parts.join("&")}` : path;
}

const pathOf = (key: string) => key.split("?")[0];

/**
 * Logical parent of a top-level section. On phones «Más» opens Apuntes,
 * Exámenes, Ajustes and Progreso, so going there is a step forward.
 */
const PARENT: Record<string, string> = {
  "/notes": "/more",
  "/exams": "/more",
  "/settings": "/more",
  "/progress": "/more",
};

/** Ancestors of a path, nearest first: /exams/1/ruta → /exams/1, /exams, /more. */
export function ancestors(pathname: string): string[] {
  const segs = pathname.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = segs.length - 1; i > 0; i--)
    out.push(`/${segs.slice(0, i).join("/")}`);
  const top = `/${segs[0] ?? ""}`;
  if (PARENT[top]) out.push(PARENT[top]);
  return out;
}

/**
 * Direction of a navigation between two route keys.
 * - Browser Back/Forward (traversal) wins: Back always reverses.
 * - Into a descendant (list → detail, Más → Exámenes, Inicio → a
 *   conversation) is forward; to an ancestor is back.
 * - Anything else (tabs, sidebar sections, sibling details) is lateral.
 * Returns null when nothing changes.
 */
export function routeDirection(
  from: string | null,
  to: string,
  traversal: "back" | "forward" | null = null,
): PageDirection | null {
  if (!from || from === to) return null;
  if (traversal) return traversal;
  const a = pathOf(from);
  const b = pathOf(to);
  if (a === b) {
    // Same path, another view: opening a conversation from Inicio goes in.
    const p = new URLSearchParams(from.split("?")[1] ?? "");
    const q = new URLSearchParams(to.split("?")[1] ?? "");
    if (!q.get("view") && !p.get("c") && q.get("c")) return "forward";
    if (!q.get("view") && p.get("c") && !q.get("c")) return "back";
    return "lateral";
  }
  if (ancestors(b).includes(a)) return "forward";
  if (ancestors(a).includes(b)) return "back";
  return "lateral";
}

/** Longest the page may wait for the new route before animating anyway. */
export const VT_MAX_WAIT_MS = 300;

export interface LinkClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}
export interface LinkInfo {
  href: string;
  target: string | null;
  download: boolean;
  optOut: boolean;
}

/**
 * The route key a click on a link leads to, or null when the click should be
 * left alone (new tab, download, another site, same page, opted out).
 */
export function linkTarget(
  click: LinkClick,
  link: LinkInfo,
  location: { href: string; origin: string },
): string | null {
  if (
    click.defaultPrevented ||
    click.button !== 0 ||
    click.metaKey ||
    click.ctrlKey ||
    click.shiftKey ||
    click.altKey
  )
    return null;
  if (link.optOut || link.download) return null;
  if (link.target && link.target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  const here = new URL(location.href);
  const to = routeKey(url.pathname, url.searchParams);
  if (to === routeKey(here.pathname, here.searchParams)) return null;
  return to;
}
