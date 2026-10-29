import type { TurnstileAction } from "./turnstile";

/**
 * Puente entre lib/dream-api.ts y la hoja de comprobación
 * (components/human-check/human-check-host.tsx). Sin hoja montada, o sin
 * Turnstile configurado, no hay comprobación posible: devuelve null.
 */
type Ask = (action: TurnstileAction) => Promise<string | null>;
let ask: Ask | null = null;

export function registerHumanCheck(fn: Ask) {
  ask = fn;
  return () => {
    if (ask === fn) ask = null;
  };
}

export function askHuman(action: TurnstileAction): Promise<string | null> {
  return ask ? ask(action) : Promise.resolve(null);
}
