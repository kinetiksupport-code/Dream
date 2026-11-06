// Hugo MCP (docs/HUGO_MCP.md): firma, Bearer, campos exactos y rpc permitidas.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
Deno.env.set("HUGO_MCP_NO_SERVE", "1");
Deno.env.set("HUGO_MCP_TOKEN", "tok");
Deno.env.set("HUGO_MCP_SIGNING_SECRET", "sec");
const { handle, shape } = await import("../functions/hugo-mcp/index.ts");
const SITE = "68c785ab-fe86-483d-aa99-91d2dd045890";
const hmac = async (p) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("sec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(p)))].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const call = async (body, over = {}, db) => {
  const raw = JSON.stringify(body);
  const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
  const h = { "content-type": "application/json", authorization: over.auth ?? "Bearer tok", "x-crisp-timestamp": ts, "x-crisp-website-id": over.site ?? SITE, "x-crisp-session-id": over.session ?? "session_abc", "x-crisp-signature": over.sig ?? "sha256=" + await hmac(`${ts}.${SITE}.${raw}`) };
  return handle(new Request("https://x/hugo-mcp", { method: "POST", headers: h, body: raw }), db ?? (async () => ({ ok: true, linked: false })));
};
const tool = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "consultar_cuenta", arguments: { email: "otro@x.es" } } };

Deno.test("sin Bearer, firma mala, web mala o hora vieja: 401", async () => {
  assertEquals((await call(tool, { auth: "Bearer mal" })).status, 401);
  assertEquals((await call(tool, { sig: "sha256=00" })).status, 401);
  assertEquals((await call(tool, { site: "otro" })).status, 401);
  assertEquals((await call(tool, { ts: String(Math.floor(Date.now() / 1000) - 400) })).status, 401);
});
Deno.test("válida: lista tres herramientas sin entradas y sin cuenta responde igual", async () => {
  const list = await (await call({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assertEquals(list.result.tools.map((t) => t.name), ["consultar_bloqueo", "consultar_cuenta", "estado_de_dream"]);
  for (const t of list.result.tools) assertEquals(Object.keys(t.inputSchema.properties), []);
  const r = await (await call(tool)).json();
  assertEquals(r.result.content[0].text, "No veo ninguna cuenta con sesión iniciada en este chat.");
});
Deno.test("solo llama a la rpc hugo_call y con la sesión como dato", async () => {
  const seen = [];
  await call(tool, { session: "x'; drop table a;--" }, async (fn, args) => { seen.push([fn, args]); return { ok: true, linked: false }; });
  assertEquals(seen.length, 1);
  assertEquals(seen[0][0], "hugo_call");
  assertEquals(Object.keys(seen[0][1]).sort(), ["p_session", "p_tool"]);
});
Deno.test("campos exactos: lo que sobra se descarta", () => {
  const out = JSON.parse(shape("consultar_cuenta", { ok: true, linked: true, nombre: "Ana García", email: "a@b.es", id: "u", bloqueo: { estado: "baneada_temporal", regla: "G-SPAM", desde: "2026-11-01T00:00:00Z", hasta: "2026-11-09T00:00:00Z", notas: "x" }, cuenta_especial: false, mensajes_hoy: 3, limite_hoy: 50, se_reinicia: "2026-11-07T00:00:00Z", en_cola: false, avisos_recientes: [], apelaciones: [{ estado: "abierta", fecha: "2026-11-02T00:00:00Z", body: "texto" }] }).text);
  assertEquals(Object.keys(out), ["nombre", "bloqueo", "estado", "cuenta_especial", "mensajes_hoy", "limite_hoy", "se_reinicia", "en_cola", "avisos_recientes", "apelaciones"]);
  assertEquals(out.nombre, "Ana");
  assertEquals(Object.keys(out.bloqueo), ["estado", "norma", "desde", "hasta"]);
  assertEquals(Object.keys(out.apelaciones[0]), ["estado", "fecha"]);
  assert(!JSON.stringify(out).includes("@"));
});
