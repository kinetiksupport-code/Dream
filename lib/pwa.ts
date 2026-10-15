/**
 * PWA client logic kept pure so it can be unit-tested without a browser:
 *  - the service-worker update flow (no automatic skipWaiting: the user
 *    decides when to reload, so a chat or exam in progress is never cut);
 *  - which install path applies (Chromium prompt, iOS guide, installed).
 */

export type UpdateStatus = "idle" | "available" | "activating" | "dismissed";
export type UpdateEvent =
  | { type: "waiting" } // a new worker finished installing while controlled
  | { type: "accept" } // user tapped "Actualizar"
  | { type: "dismiss" }
  | { type: "controllerchange" };

export interface UpdateResult {
  status: UpdateStatus;
  /** Message to post to the waiting worker. */
  post?: "SKIP_WAITING";
  /** Reload the page (only after the user accepted). */
  reload?: boolean;
}

export function updateReducer(
  status: UpdateStatus,
  event: UpdateEvent,
): UpdateResult {
  switch (event.type) {
    case "waiting":
      return {
        status:
          status === "activating" || status === "dismissed"
            ? status
            : "available",
      };
    case "accept":
      return status === "available"
        ? { status: "activating", post: "SKIP_WAITING" }
        : { status };
    case "dismiss":
      return { status: status === "available" ? "dismissed" : status };
    case "controllerchange":
      // Another tab may have activated the worker: only reload when this tab
      // asked for it, never in the middle of the user's work.
      return status === "activating"
        ? { status: "idle", reload: true }
        : { status };
  }
}

export type InstallPath = "installed" | "prompt" | "ios" | "unavailable";

export function installPath(env: {
  standalone: boolean;
  userAgent: string;
  maxTouchPoints: number;
  hasPrompt: boolean;
}): InstallPath {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  const ios =
    /iPad|iPhone|iPod/.test(env.userAgent) ||
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  return ios ? "ios" : "unavailable";
}

/** Minimal shape of the non-standard BeforeInstallPromptEvent. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// In-memory store for the deferred install prompt (captured at app start,
// consumed from Ajustes). Never persisted.
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const installStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getPrompt: () => deferred,
  getInstalled: () => installed,
  setPrompt(event: InstallPromptEvent | null) {
    deferred = event;
    emit();
  },
  markInstalled() {
    installed = true;
    deferred = null;
    emit();
  },
};
