// Turnstile contra el siteverify REAL de Cloudflare, con sus claves de PRUEBA
// públicas (developers.cloudflare.com/turnstile/troubleshooting/testing/).
// No toca edudream.es ni Supabase. Uso: node scripts/security/turnstile-real.mjs
import { createSpentTokens, verifyTurnstile } from "../../supabase/functions/dream-api/turnstile.mjs";

const DUMMY = "XXXX.DUMMY.TOKEN.XXXX";
const PASS = "1x0000000000000000000000000000000AA";
const FAIL = "2x0000000000000000000000000000000AA";
const SPENT = "3x0000000000000000000000000000000AA";
const quiet = () => {};
const run = (secret, extra = {}) =>
  verifyTurnstile({ token: DUMMY, action: "subida_qr", env: { TURNSTILE_SECRET_KEY: secret, ...extra }, spent: createSpentTokens(), log: quiet });

const cases = [
  // La clave de prueba responde hostname «example.com» y sin action: Dream la rechaza.
  ["Clave que siempre pasa, pero dominio y acción no son los de Dream", await run(PASS), "turnstile_failed"],
  ["Clave que siempre falla", await run(FAIL), "turnstile_failed"],
  ["Token ya gastado (timeout-or-duplicate)", await run(SPENT), "turnstile_failed"],
  ["Clave secreta inventada", await run("0x0000000000000000000000000000000AA"), "turnstile_unavailable"],
];
let bad = 0;
for (const [name, out, want] of cases) {
  const got = out.ok ? "ok" : out.code;
  if (got !== want) bad++;
  console.log(`${got === want ? "✓" : "✗"} ${name}: ${got}`);
}
process.exit(bad ? 1 : 0);
