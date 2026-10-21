// Arnés de pruebas: ejecuta el dream-api REAL (index.ts) contra un Supabase
// falso en 127.0.0.1. Nada sale de la máquina y no hay claves reales.
//  - /auth/v1/user acepta los tokens que se declaran en `users`.
//  - /rest/v1/<tabla> lee y escribe tablas en memoria (filtros eq simples).
//  - /rest/v1/rpc/<función> llama al manejador que se declare en `rpc`.
// Todas las peticiones quedan en `requests` para poder hacer comprobaciones.

const b64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Token con forma de JWT. El servidor falso decide si vale; dream-api lee sus claims. */
export function makeToken(claims) {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.${"s".repeat(16)}`;
}

export async function startHarness({ users = {}, tables = {}, rpc = {}, env = {} } = {}) {
  const requests = [];
  const state = { users, tables, rpc };
  const fake = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }
    requests.push({ method: req.method, path: url.pathname, search: url.search, body });
    if (url.pathname === "/auth/v1/user") {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
      const user = state.users[token];
      return user ? Response.json(user) : Response.json({ message: "invalid JWT", code: 401 }, { status: 401 });
    }
    const byId = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (byId) {
      const found = Object.values(state.users).find((u) => u.id === byId[1]);
      return found ? Response.json(found) : Response.json({ message: "User not found" }, { status: 404 });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.slice("/rest/v1/rpc/".length);
      const handler = state.rpc[name];
      if (!handler) return Response.json({ code: "PGRST202", message: `no such function ${name}` }, { status: 404 });
      try {
        const data = await handler(body ?? {});
        return Response.json(data === undefined ? null : data);
      } catch (error) {
        return Response.json({ code: "P0001", message: String(error?.message ?? error) }, { status: 400 });
      }
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = (state.tables[table] ??= []);
      const wantsObject = (req.headers.get("accept") || "").includes("vnd.pgrst.object");
      if (req.method === "GET" || req.method === "HEAD") {
        let selected = rows.filter((row) => {
          for (const [key, value] of url.searchParams) {
            const m = /^eq\.(.*)$/.exec(value);
            if (m && !["select", "order", "limit", "offset"].includes(key) && String(row[key]) !== m[1]) return false;
            const n = /^in\.\((.*)\)$/.exec(value);
            if (n && !n[1].split(",").includes(String(row[key]))) return false;
          }
          return true;
        });
        const limit = Number(url.searchParams.get("limit"));
        if (limit) selected = selected.slice(0, limit);
        if (wantsObject) {
          return selected.length === 1
            ? Response.json(selected[0])
            : Response.json({ code: "PGRST116", message: "0 rows" }, { status: 406 });
        }
        return Response.json(selected, { headers: { "content-range": `0-${Math.max(0, selected.length - 1)}/${selected.length}` } });
      }
      if (req.method === "POST") {
        const added = Array.isArray(body) ? body : [body];
        rows.push(...added);
        return Response.json(wantsObject ? added[0] : added, { status: 201 });
      }
      return Response.json([], { status: 200 });
    }
    return Response.json({ message: "not found" }, { status: 404 });
  });
  const previous = {};
  const set = { SUPABASE_URL: `http://127.0.0.1:${fake.addr.port}`, SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "service-test", ...env };
  for (const [key, value] of Object.entries(set)) {
    previous[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  let handler = null;
  const realServe = Deno.serve;
  Object.defineProperty(Deno, "serve", { value: (h) => ((handler = h), { finished: Promise.resolve() }), configurable: true, writable: true });
  try {
    await import(`../../functions/dream-api/index.ts?harness=${crypto.randomUUID()}`);
  } finally {
    Object.defineProperty(Deno, "serve", { value: realServe, configurable: true, writable: true });
  }
  return {
    state,
    requests,
    /** Llama a dream-api como lo haría el navegador. */
    async call(token, body, headers = {}) {
      const res = await handler(
        new Request("http://dream.test/functions/v1/dream-api", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://www.edudream.es", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
          body: JSON.stringify(body),
        }),
      );
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, headers: res.headers, text, json };
    },
    async stop() {
      await fake.shutdown();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      }
    },
  };
}

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const goodUser = (id = USER_ID, email = "alumno@example.test") => ({
  id, email, aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, identities: [{ provider: "google", identity_data: { email_verified: true } }],
});
export const profileRow = (id = USER_ID, extra = {}) => ({
  id, email: "alumno@example.test", display_name: "Alumno", ai_consent_at: "2026-10-01T00:00:00Z", terms_version: "2026-10-18", terms_accepted_at: "2026-10-01T00:00:00Z", age_band: "18_plus", ...extra,
});
