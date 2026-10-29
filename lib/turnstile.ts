/**
 * Cloudflare Turnstile en el navegador (docs/turnstile.md). Solo se carga en
 * las pantallas que lo usan, y solo si existe NEXT_PUBLIC_TURNSTILE_SITE_KEY.
 * El token que da el widget no vale nada aquí: lo valida dream-api.
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
/** Las mismas que supabase/functions/dream-api/turnstile.mjs. */
export const TURNSTILE_ACTIONS = { qr: "subida_qr", appeal: "reclamar", firstAi: "primera_ia" } as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
export const HUMAN_CHECK_MESSAGE = "No hemos podido comprobar que eres una persona, vuelve a intentarlo.";
/** Respuestas de dream-api que piden (otra vez) la comprobación. */
export const isHumanCheckCode = (code: string) =>
  code === "turnstile_required" || code === "turnstile_failed" || code === "turnstile_unavailable";

export const turnstileSiteKey = (value = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) => value?.trim() || "";
export const turnstileOn = (value?: string) => turnstileSiteKey(value) !== "";

export interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      language: string;
      theme: "light" | "dark";
      size: "flexible";
      "response-field": boolean;
      "refresh-expired": "auto";
      callback: (token: string) => void;
      "error-callback": () => boolean | void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
/** Carga el script una sola vez, a demanda. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("turnstile_ssr"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const currentTheme = (): "light" | "dark" =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
