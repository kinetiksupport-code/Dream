// Crisp support chat (Ajustes > Ayuda and the ban screen). Loaded only when the
// student asks for it, never on page load: many students are minors and Crisp
// is an outside service that stores messages and sets cookies. Nothing about
// the student (email, name, id) is sent to Crisp; they type what they want to
// share. It also needs consent for Preferences cookies (Cookiebot): `allowed`
// is checked inside load(), so no caller can skip it.
// Commands from docs.crisp.chat (Web SDK, $crisp): "chat:hide", "chat:show",
// "chat:open", the "chat:closed" event and window.CRISP_READY_TRIGGER.

import { readConsent, type ConsentWindow } from "./cookie-consent";

export const CRISP_SCRIPT = "https://client.crisp.chat/l.js";
// Public site id (not a secret). NEXT_PUBLIC_CRISP_WEBSITE_ID overrides it.
export const CRISP_DEFAULT_WEBSITE_ID = "68c785ab-fe86-483d-aa99-91d2dd045890";
/** Browser flag: the student already accepted the notice about Crisp. */
export const CRISP_NOTICE_KEY = "dream-crisp-notice";

type CrispCommand = unknown[];
interface CrispApi {
  push: (command: CrispCommand) => void;
  is?: (state: string) => boolean;
}
export interface CrispWindow {
  $crisp?: CrispApi | CrispCommand[];
  CRISP_WEBSITE_ID?: string;
  CRISP_READY_TRIGGER?: () => void;
  CRISP_RUNTIME_CONFIG?: { locale?: string };
}
interface ScriptLike {
  src: string;
  async: boolean;
  onerror: ((event: Event) => void) | null;
  remove?: () => void;
}
export interface CrispDeps {
  win: CrispWindow;
  createScript: () => ScriptLike;
  appendScript: (script: ScriptLike) => void;
  websiteId: string;
  /** Consent for Crisp's cookies. Without it nothing is inserted. */
  allowed: () => boolean;
  /** Wait for Crisp to be ready before giving up (ad blocker, offline). */
  loadTimeoutMs?: number;
  /** Time between checks that the chat really opened. */
  checkMs?: number;
  /** Opening attempts (show + open) before giving up. */
  attempts?: number;
  wait?: (ms: number) => Promise<void>;
}

export class CrispUnavailable extends Error {
  constructor(public reason: "no_consent" | "load_failed" | "timeout" | "not_opened") {
    super(reason);
    this.name = "CrispUnavailable";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createCrisp({
  win,
  createScript,
  appendScript,
  websiteId,
  allowed,
  loadTimeoutMs = 10_000,
  checkMs = 1_200,
  attempts = 3,
  wait = sleep,
}: CrispDeps) {
  let loading: Promise<void> | null = null;
  const push = (command: CrispCommand) => {
    const api = win.$crisp;
    if (api) api.push(command);
  };

  /** Inserts the script once and resolves when Crisp is fully ready. */
  function load(): Promise<void> {
    if (loading) return loading;
    if (!allowed()) return Promise.reject(new CrispUnavailable("no_consent"));
    loading = new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (error?: CrispUnavailable) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) {
          loading = null; // let the student try again later
          reject(error);
        } else resolve();
      };
      const timer = setTimeout(
        () => finish(new CrispUnavailable("timeout")),
        loadTimeoutMs,
      );
      win.$crisp = [];
      win.CRISP_WEBSITE_ID = websiteId;
      win.CRISP_RUNTIME_CONFIG = { locale: "es" };
      win.CRISP_READY_TRIGGER = () => finish();
      // Queued until the script runs: no floating bubble, ever. Closing the
      // chat hides it again.
      push(["do", "chat:hide"]);
      push(["on", "chat:closed", () => push(["do", "chat:hide"])]);
      const script = createScript();
      script.src = CRISP_SCRIPT;
      script.async = true;
      script.onerror = () => {
        script.remove?.();
        finish(new CrispUnavailable("load_failed"));
      };
      appendScript(script);
    });
    return loading;
  }

  const isOpen = () => {
    const api = win.$crisp;
    if (!api || Array.isArray(api) || typeof api.is !== "function") return false;
    try {
      return api.is("chat:opened") && api.is("chat:visible");
    } catch {
      return false;
    }
  };

  /** Loads Crisp if needed and makes sure its chat is on screen. */
  async function open() {
    await load();
    for (let i = 0; i < attempts; i++) {
      push(["do", "chat:show"]);
      push(["do", "chat:open"]);
      await wait(checkMs);
      if (isOpen()) return;
    }
    throw new CrispUnavailable("not_opened");
  }

  return { load, open, isOpen };
}

let browserCrisp: ReturnType<typeof createCrisp> | null = null;
/**
 * Explicit «Permitir y abrir» when Cookiebot is not on the page (a blocker):
 * valid for this visit only, never saved.
 */
let grantedThisVisit = false;
export function allowCrispThisVisit() {
  grantedThisVisit = true;
}
/** The page's single Crisp loader (created on first use, in the browser). */
export function crisp() {
  browserCrisp ??= createCrisp({
    win: window as unknown as CrispWindow,
    createScript: () => document.createElement("script") as ScriptLike,
    appendScript: (script) =>
      document.head.appendChild(script as unknown as HTMLScriptElement),
    websiteId:
      process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID || CRISP_DEFAULT_WEBSITE_ID,
    allowed: () =>
      grantedThisVisit || readConsent(window as unknown as ConsentWindow, document.cookie).preferences,
  });
  return browserCrisp;
}

/** Did the student already accept the notice? Storage may be blocked. */
export function noticeAccepted(storage: Pick<Storage, "getItem"> | null) {
  try {
    return storage?.getItem(CRISP_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberNotice(storage: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(CRISP_NOTICE_KEY, "1");
  } catch {
    /* private mode: the notice shows again next time */
  }
}
