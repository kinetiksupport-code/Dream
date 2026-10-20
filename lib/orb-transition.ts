// Landing → login: the Orb «travels» from the landing hero to its place in
// the login (prompt «landing, login y bienvenida» §3.2). The React in Next 15
// has no stable <ViewTransition>, so it uses document.startViewTransition when
// the browser has it; the element on each page shares
// `view-transition-name: dream-orb` (landing.module.css, login.module.css).
// Without View Transitions, or with reduced motion, the link just navigates
// and the login plays its own short entrance.

/** Longest wait for the login to render before the snapshot is taken. */
export const ORB_MAX_WAIT_MS = 600;

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition: () => void;
}
type DocWithVT = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike;
};

let arrive: (() => void) | null = null;

/** The login calls this once it has rendered: the transition can go on. */
export function orbArrived() {
  arrive?.();
  arrive = null;
}

/** True when the transition can run here (supported and motion allowed). */
export function canTravel(win: Window = window) {
  const doc = win.document as DocWithVT;
  return (
    typeof doc.startViewTransition === "function" &&
    !win.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Runs `go` (the navigation) inside a View Transition. Returns false when it
 * cannot, so the caller navigates normally.
 */
export function travelWithOrb(go: () => void, win: Window = window): boolean {
  if (!canTravel(win)) return false;
  const doc = win.document as DocWithVT;
  const root = doc.documentElement;
  root.dataset.orbTransition = "";
  let transition: ViewTransitionLike | null = null;
  transition = doc.startViewTransition!(
    () =>
      new Promise<void>((resolve) => {
        const timer = win.setTimeout(() => {
          // The login is slow to arrive: never freeze the screen.
          arrive = null;
          transition?.skipTransition();
          resolve();
        }, ORB_MAX_WAIT_MS);
        arrive = () => {
          win.clearTimeout(timer);
          resolve();
        };
        go();
      }),
  );
  transition.finished.finally(() => delete root.dataset.orbTransition);
  return true;
}
