// Servidor MCP de Hugo (IA de soporte de Crisp). Solo lectura. docs/HUGO_MCP.md
//
// - Transporte Streamable HTTP sin estado: POST con un mensaje JSON-RPC y
//   respuesta JSON. GET -> 405 (no ofrecemos flujo SSE).
// - Entra solo con Bearer propio (HUGO_MCP_TOKEN) Y firma de Crisp
//   (HMAC-SHA256 de `{timestamp}.{website_id}.{cuerpo}`, secreto
//   HUGO_MCP_SIGNING_SECRET), comprobada con el cuerpo crudo ANTES de leer el JSON.
// - La cuenta se encuentra SOLO por la cabecera X-Crisp-Session-Id (no entra en la
//   firma de Crisp; basta porque sin Bearer y firma válidos no se acepta nada).
//   Las herramientas no aceptan correo, id ni nombre como entrada.
// - Con la clave de servicio, pero SOLO llama a la rpc `hugo_call` (lista cerrada
//   ALLOWED_RPC; hay un test que lo comprueba). Esa función devuelve únicamente
//   los campos permitidos, y aquí se vuelven a filtrar.

const ALLOWED_RPC = new Set(['hugo_call']);
const CRISP_WEBSITE_ID = Deno.env.get('HUGO_CRISP_WEBSITE_ID') || '68c785ab-fe86-483d-aa99-91d2dd045890';
const MAX_AGE_SECONDS = 300;
const MAX_BODY_BYTES = 16_384;
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const NO_ACCOUNT = 'No veo ninguna cuenta con sesión iniciada en este chat.';
const RATE_LIMITED = 'Hay demasiadas consultas seguidas. Inténtalo de nuevo en unos minutos.';

// Misma tabla G que ve el alumno (student-moderation.mjs, RULE_PLAIN). Mantener igual.
const RULE_PLAIN: Record<string, string> = {
  'G-INSULT': 'tratar con respeto a todo el mundo, también al tutor de IA',
  'G-JAILBREAK': 'usar Dream para aprender, sin trucos para que la IA dé la solución o ignore sus normas',
  'G-SPAM': 'no enviar mensajes repetidos ni saturar el chat',
  'G-BOT': 'no usar programas automáticos ni sobrecargar el servicio',
  'G-MULTI': 'una persona, una cuenta: no crear cuentas extra para saltarse límites o un baneo',
  'G-EDAD': 'no compartir la cuenta ni mentir sobre la edad',
  'G-EXAMEN': 'no usar Dream durante un examen oficial o una prueba evaluable',
  'G-COPYRIGHT': 'subir solo contenido propio o que tengas derecho a usar',
  'G-DATOS': 'no subir datos personales de otras personas',
  'G-ILEGAL': 'no subir ni pedir contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño',
  'G-HACK': 'no intentar acceder a datos de otros usuarios ni saltarse la seguridad',
  'G-COMERCIAL': 'no usar Dream con fines comerciales sin permiso por escrito',
  ADMIN: 'una decisión del equipo de Dream',
};
const FALLBACK_RULE = 'las normas de uso de Dream';

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}
/** Comparación en tiempo constante (compara huellas de la misma longitud). */
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0 && a.length === b.length;
}

const unauthorized = () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const rpcResult = (id: unknown, result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const rpcError = (id: unknown, code: number, message: string) => new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Bearer + firma de Crisp + web + hora. Devuelve true solo si todo es válido. */
export async function authorized(req: Request, rawBody: string, env: { token?: string; secret?: string; website?: string; now?: number } = {}) {
  const token = env.token ?? Deno.env.get('HUGO_MCP_TOKEN') ?? '';
  const secret = env.secret ?? Deno.env.get('HUGO_MCP_SIGNING_SECRET') ?? '';
  const website = env.website ?? CRISP_WEBSITE_ID;
  if (!token || !secret) return false;
  const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const timestamp = req.headers.get('x-crisp-timestamp') ?? '';
  const signature = req.headers.get('x-crisp-signature') ?? '';
  const site = req.headers.get('x-crisp-website-id') ?? '';
  const bearerOk = await safeEqual(bearer, token);
  const siteOk = await safeEqual(site, website);
  const expected = 'sha256=' + await hmacHex(secret, `${timestamp}.${website}.${rawBody}`);
  const signatureOk = await safeEqual(signature, expected);
  // La hora puede llegar en segundos o en milisegundos; la firma usa el texto tal cual.
  let ts = Number(timestamp);
  if (ts > 1e12) ts = Math.floor(ts / 1000);
  const now = env.now ?? Math.floor(Date.now() / 1000);
  const fresh = Number.isFinite(ts) && Math.abs(now - ts) <= MAX_AGE_SECONDS;
  const ok = bearerOk && siteOk && signatureOk && fresh;
  // Solo qué comprobación falla (sí/no), nunca valores ni cabeceras.
  if (!ok) console.log(JSON.stringify({ event: 'hugo_auth_failed', bearer: bearerOk, site: siteOk, signature: signatureOk, fresh, has_signature_header: signature !== '', has_bearer: bearer !== '' }));
  return ok;
}

type Db = (fn: string, args: Record<string, unknown>) => Promise<any>;
const serviceDb: Db = async (fn, args) => {
  if (!ALLOWED_RPC.has(fn)) throw new Error('rpc_not_allowed');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('db_error');
  return await res.json();
};

const rulePlain = (rule: unknown) => RULE_PLAIN[String(rule ?? '')] ?? FALLBACK_RULE;
const iso = (v: unknown) => (typeof v === 'string' ? v : null);
const bloqueo = (b: any) => ({
  estado: ['sin_bloqueo', 'limitada', 'baneada_temporal', 'baneada_permanente'].includes(b?.estado) ? b.estado : 'sin_bloqueo',
  norma: b?.regla ? rulePlain(b.regla) : null,
  desde: iso(b?.desde),
  hasta: iso(b?.hasta),
});
const apelacion = (a: any) => ({
  estado: ['ninguna', 'abierta', 'aceptada', 'rechazada'].includes(a?.estado) ? a.estado : 'ninguna',
  fecha: iso(a?.fecha),
});

/** Solo los campos permitidos, aunque la base devolviera más. */
export function shape(tool: string, r: any): { text: string; isError?: boolean } {
  if (r?.code === 'limitada') return { text: RATE_LIMITED, isError: true };
  if (!r?.ok) return { text: 'No he podido consultarlo ahora. Inténtalo más tarde.', isError: true };
  if (tool === 'estado_de_dream') {
    return { text: JSON.stringify({
      ia: ['normal', 'lenta', 'sin_servicio'].includes(r.ia) ? r.ia : 'normal',
      cola_global: r.cola_global === true ? 'sí' : 'no',
      aviso: typeof r.aviso === 'string' ? r.aviso.slice(0, 280) : '',
    }) };
  }
  if (r.linked !== true) return { text: NO_ACCOUNT };
  if (tool === 'consultar_bloqueo') {
    const b = bloqueo(r.bloqueo), a = apelacion(r.apelacion);
    return { text: JSON.stringify({ estado: b.estado, norma: b.norma, desde: b.desde, hasta: b.hasta, apelacion: a.estado, fecha_apelacion: a.fecha }) };
  }
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  return { text: JSON.stringify({
    nombre: typeof r.nombre === 'string' ? r.nombre.split(' ')[0].slice(0, 20) : null,
    bloqueo: bloqueo(r.bloqueo),
    estado: bloqueo(r.bloqueo).estado,
    cuenta_especial: r.cuenta_especial === true ? 'sí' : 'no',
    mensajes_hoy: Number.isFinite(r.mensajes_hoy) ? r.mensajes_hoy : 0,
    limite_hoy: Number.isFinite(r.limite_hoy) ? r.limite_hoy : 'sin límite',
    se_reinicia: iso(r.se_reinicia),
    en_cola: r.en_cola === true ? 'sí' : 'no',
    avisos_recientes: list(r.avisos_recientes).slice(0, 5).map((x: any) => ({ norma: rulePlain(x?.regla), fecha: iso(x?.fecha) })),
    apelaciones: list(r.apelaciones).slice(0, 5).map((x: any) => apelacion(x)),
  }) };
}

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false };
export const TOOLS = [
  { name: 'consultar_bloqueo', description: 'Dice si la cuenta del alumno que escribe en este chat está limitada o baneada, por qué norma, desde cuándo y hasta cuándo, y cómo va su apelación. No necesita datos: usa la cuenta con sesión iniciada en este chat. Si no hay cuenta, lo dice.', inputSchema: NO_INPUT },
  { name: 'consultar_cuenta', description: 'Resumen de la cuenta del alumno que escribe en este chat: su nombre de pila, si hay bloqueo, cuántos mensajes ha usado hoy y su límite, cuándo se reinicia, si está en cola, avisos recientes y apelaciones. No necesita datos: usa la cuenta con sesión iniciada en este chat. Si no hay cuenta, lo dice.', inputSchema: NO_INPUT },
  { name: 'estado_de_dream', description: 'Estado general de la IA de Dream (normal, lenta o sin servicio), si hay cola global y el aviso corto del equipo. No necesita cuenta.', inputSchema: NO_INPUT },
];

export async function handle(req: Request, db: Db = serviceDb, env: Parameters<typeof authorized>[2] = {}) {
  if (req.method !== 'POST') return new Response(null, { status: req.method === 'GET' ? 405 : 405, headers: { Allow: 'POST' } });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return unauthorized();
  // Primero la firma, con el cuerpo crudo; después el JSON.
  if (!(await authorized(req, raw, env))) return unauthorized();
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return rpcError(null, -32700, 'JSON no válido'); }
  if (!msg || Array.isArray(msg) || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Petición no válida');
  const id = msg.id;
  if (msg.method.startsWith('notifications/')) return new Response(null, { status: 202 });
  if (msg.method === 'ping') return rpcResult(id, {});
  if (msg.method === 'initialize') {
    const asked = msg.params?.protocolVersion;
    return rpcResult(id, {
      protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[1],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'hugo-mcp', version: '1.0.0' },
      instructions: 'Herramientas de solo lectura sobre la cuenta de Dream del alumno que escribe en este chat (si abrió el chat con su sesión iniciada). Nunca hay datos de otras personas.',
    });
  }
  if (msg.method === 'tools/list') return rpcResult(id, { tools: TOOLS });
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, 'Herramienta desconocida');
    // Las herramientas no aceptan argumentos: lo que mande el modelo se ignora.
    const header = req.headers.get('x-crisp-session-id') ?? '';
    let out: { text: string; isError?: boolean };
    try { out = shape(name, await db('hugo_call', { p_session: header, p_tool: name })); }
    catch { out = { text: 'No he podido consultarlo ahora. Inténtalo más tarde.', isError: true }; }
    return rpcResult(id, { content: [{ type: 'text', text: out.text }], isError: out.isError === true });
  }
  return rpcError(id, -32601, 'Método no encontrado');
}

if (!Deno.env.get('HUGO_MCP_NO_SERVE')) Deno.serve((req) => handle(req));
