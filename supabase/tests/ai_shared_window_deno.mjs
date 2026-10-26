// Límite CONJUNTO de la IA (ventana de 5 h) en el runtime de Deno, el mismo
// que usa dream-api. Base de datos simulada: solo se comprueba qué se envía a
// las RPC y qué ve el alumno.
import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertRejects,
} from "jsr:@std/assert@1.0.14";
import {
  MODES,
  MODE_WEIGHTS,
  SHARED_WINDOW_BUDGET,
  availableModes,
} from "../functions/dream-api/models.mjs";
import {
  WINDOW_LIMIT_CODE,
  createWindowLimiter,
  usageSummary,
} from "../functions/dream-api/usage-window.mjs";
import { AdmissionError } from "../functions/dream-api/admission.mjs";

const T0 = Date.parse("2026-10-19T10:00:00Z");
const HOUR = 3600_000;
const window = {
  started_at: new Date(T0).toISOString(),
  ends_at: new Date(T0 + 5 * HOUR).toISOString(),
};
const allModes = availableModes({ cloudflareConfigured: true });

/** Imita dream_ai_window_charge nuevo: suma TODOS los modos (kind 'mode'). */
function fakeDb() {
  const rows = new Map();
  const attempts = new Map();
  const calls = [];
  const sum = () =>
    [...rows.entries()]
      .filter(([k]) => k.endsWith("|mode"))
      .reduce((a, [, v]) => a + v, 0);
  return {
    calls,
    rows,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "dream_ai_window_charge") {
        if (args.p_kind === "mode" && sum() >= args.p_budget) {
          return {
            data: {
              ok: false,
              status: 429,
              code: WINDOW_LIMIT_CODE,
              retry_after: 3600,
            },
            error: null,
          };
        }
        const key = `${args.p_mode}|${args.p_kind}`;
        rows.set(key, (rows.get(key) || 0) + args.p_tokens);
        attempts.set(args.p_attempt, { key, tokens: args.p_tokens });
        return { data: { ok: true }, error: null };
      }
      if (name === "dream_ai_window_settle") {
        const a = attempts.get(args.p_attempt);
        rows.set(
          a.key,
          Math.max(0, rows.get(a.key) + args.p_tokens - a.tokens),
        );
        a.tokens = args.p_tokens;
        return { data: { ok: true, status: "settled" }, error: null };
      }
      if (name === "dream_ai_usage") {
        const usage = [...rows.entries()].map(([k, tokens]) => {
          const [mode, kind] = k.split("|");
          return { mode, kind, tokens };
        });
        return { data: { window, usage }, error: null };
      }
      return { data: { ok: true }, error: null };
    },
  };
}

Deno.test(
  "one shared budget; each mode charges tokens × its weight, and the settle uses the same weight",
  async () => {
    assertEquals(SHARED_WINDOW_BUDGET, 60_000);
    assertEquals({ ...MODE_WEIGHTS }, { fast: 0.5, normal: 1, think: 2 });
    const db = fakeDb();
    const limiter = createWindowLimiter(db, "owner");
    const fast = await limiter.charge({
      mode: "fast",
      kind: "mode",
      provider: "groq",
      tokens: 4000,
    });
    await fast.settle(3001);
    const think = await limiter.charge({
      mode: "think",
      kind: "mode",
      provider: "cloudflare",
      tokens: 4000,
    });
    await think.settle(3000);
    const fb = await limiter.charge({
      mode: "normal",
      kind: "fallback",
      provider: "cloudflare",
      tokens: 9000,
    });
    await fb.settle(9000);
    const charges = db.calls.filter((c) => c.name === "dream_ai_window_charge");
    assertEquals(
      charges.map((c) => [c.args.p_mode, c.args.p_tokens, c.args.p_budget]),
      [
        ["fast", 2000, SHARED_WINDOW_BUDGET],
        ["think", 8000, SHARED_WINDOW_BUDGET],
        ["normal", 9000, SHARED_WINDOW_BUDGET],
      ],
    );
    // Rows stay per mode, already weighted.
    assertEquals(db.rows.get("fast|mode"), 1501);
    assertEquals(db.rows.get("think|mode"), 6000);
    assertEquals(db.rows.get("normal|fallback"), 9000);
    // Shared percent: (1501 + 6000) / 60000 → 12 %; the fallback does not count.
    const summary = usageSummary(await limiter.read(), {
      now: T0 + HOUR,
      modes: allModes,
    });
    assertEquals([summary.percent, summary.blocked], [12, false]);
    assertEquals(
      summary.modes.map((m) => m.percent),
      [12, 12, 12],
    );
  },
);

Deno.test(
  "when the shared limit is spent every mode is blocked, and ai_usage never shows tokens or models",
  async () => {
    const db = fakeDb();
    const limiter = createWindowLimiter(db, "owner");
    await limiter.charge({
      mode: "think",
      kind: "mode",
      provider: "cloudflare",
      tokens: 30_000,
    });
    for (const mode of ["fast", "normal", "think"]) {
      await assertRejects(
        () =>
          limiter.charge({
            mode,
            kind: "mode",
            provider: MODES[mode].provider,
            tokens: 1,
          }),
        AdmissionError,
      );
    }
    // The Cloudflare fallback is still only recorded.
    await limiter.charge({
      mode: "fast",
      kind: "fallback",
      provider: "cloudflare",
      tokens: 10,
    });
    const body = {
      ...usageSummary(await limiter.read(), {
        now: T0 + HOUR,
        modes: allModes,
      }),
      default_mode: "normal",
    };
    assertEquals(
      [body.percent, body.blocked, body.resets_at],
      [100, true, window.ends_at],
    );
    assertEquals(
      body.modes.every((m) => m.blocked && m.percent === 100),
      true,
    );
    assertEquals(
      body.modes.map((m) => m.relative_cost),
      ["la mitad", "lo normal", "el doble"],
    );
    const text = JSON.stringify(body);
    assertNotMatch(
      text,
      /token|60000|llama|qwen|mistral|gpt|groq|cloudflare|@cf/i,
    );
    assertMatch(text, /"percent":100/);
  },
);
