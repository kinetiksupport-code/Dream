// Acciones de subida por QR (upload-session.ts) con base de datos y despacho
// simulados. La lógica SQL se prueba aparte con
// scripts/security/upload-sessions-integration.mjs.
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  INVALID_LINK_MESSAGE,
  SECRET_PATTERN,
  UPLOAD_QR,
  UploadSessionError,
  base64Size,
  desktopUploadAction,
  displayFileName,
  isExpired,
  mobileUploadAction,
  qrIpHash,
  randomSecret,
  sha256Hex,
} from "../functions/dream-api/upload-session.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const ATTACHMENT = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";

function fakeDb(responses) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      const value = responses[name];
      const data = typeof value === "function" ? value(args) : value;
      return Promise.resolve(data === undefined ? { data: null, error: null } : { data, error: null });
    },
  };
}

Deno.test("secretos de 256 bits en base64url, distintos cada vez", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const s = randomSecret();
    assertMatch(s, SECRET_PATTERN);
    seen.add(s);
  }
  assertEquals(seen.size, 200);
});

Deno.test("SHA-256 en hexadecimal (vector conocido)", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("huella de IP del QR: solo la cabecera de la plataforma, nunca en claro", async () => {
  const real = await qrIpHash(new Headers({ "cf-connecting-ip": "198.51.100.2" }));
  // Cabeceras escritas por el cliente: no cambian la huella.
  assertEquals(await qrIpHash(new Headers({ "cf-connecting-ip": "198.51.100.2", "x-forwarded-for": "1.1.1.1", "x-real-ip": "1.1.1.1", "true-client-ip": "1.1.1.1" })), real);
  // Antes se leía el primer valor de X-Forwarded-For, que escribe el cliente.
  const spoofOnly = await qrIpHash(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
  assertEquals(spoofOnly, await qrIpHash(new Headers()));
  assertEquals(spoofOnly, await qrIpHash(new Headers({ "x-forwarded-for": "198.51.100.99" })));
  assertMatch(real, /^[0-9a-f]{64}$/);
  assert(!real.includes("198.51.100.2"));
  // Con secreto, HMAC: distinta del SHA-256 sin secreto.
  const pepper = "p".repeat(40);
  const keyed = await qrIpHash(new Headers({ "cf-connecting-ip": "198.51.100.2" }), { MOD_IP_PEPPER: pepper });
  assertMatch(keyed, /^[0-9a-f]{64}$/);
  assert(keyed !== real);
});

Deno.test("utilidades: nombre, tamaño y caducidad", () => {
  assertEquals(displayFileName("../../etc/passwd"), "passwd");
  assertEquals(displayFileName("C:\\Users\\ana\\tema\u0007 1.pdf"), "tema 1.pdf");
  assertEquals(displayFileName("a\u202Efdp.exe"), "afdp.exe");
  assertEquals(displayFileName(42), "");
  assertEquals(displayFileName("x".repeat(400)).length, 255);
  assertEquals(base64Size("aGVsbG8="), 5);
  assertEquals(base64Size("aGVsbG8"), 5);
  assertEquals(base64Size("aGVsb"), null);
  assertEquals(base64Size("no es base64!"), null);
  assertEquals(base64Size(""), null);
  assertEquals(isExpired("2026-10-17T10:00:00Z", Date.parse("2026-10-17T09:59:59Z")), false);
  assertEquals(isExpired("2026-10-17T10:00:00Z", Date.parse("2026-10-17T10:00:00Z")), true);
  assertEquals(isExpired("no es fecha"), true);
});

Deno.test("crear: el token sale una vez y solo se guarda su hash", async () => {
  const db = fakeDb({ dream_upload_session_create: { ok: true, session_id: SESSION, expires_at: "2026-10-17T10:10:00Z" } });
  const result = await desktopUploadAction(db, OWNER, { action: "upload_session_create", exam_id: EXAM });
  const { token, url, id, ttl_seconds, max_uploads } = result.session;
  assertMatch(token, SECRET_PATTERN);
  assertEquals(url, `/subir#${token}`);
  assertEquals(id, SESSION);
  assertEquals(ttl_seconds, 600);
  assertEquals(max_uploads, UPLOAD_QR.limits.max_uploads);
  const args = db.calls[0].args;
  assertEquals(args.p_token_hash, await sha256Hex(token));
  assertEquals(JSON.stringify(db.calls).includes(token), false);
  assertEquals(args.p_ttl_seconds, 600);
});

Deno.test("crear, renovar, estado y cerrar: errores claros", async () => {
  await assertRejects(() => desktopUploadAction(fakeDb({}), OWNER, { action: "upload_session_create", exam_id: "x" }), UploadSessionError, "Examen no válido.");
  const busy = fakeDb({ dream_upload_session_create: { ok: false, status: 429, retry_after: 120 } });
  const error = await assertRejects(() => desktopUploadAction(busy, OWNER, { action: "upload_session_create", exam_id: EXAM }), UploadSessionError);
  assertEquals([error.status, error.retryAfter], [429, 120]);
  const done = fakeDb({ dream_upload_session_create: { ok: false, status: 409 } });
  await assertRejects(() => desktopUploadAction(done, OWNER, { action: "upload_session_create", exam_id: EXAM }), UploadSessionError, "ya no admite");
  const gone = fakeDb({ dream_upload_session_renew: { ok: false, status: 410 } });
  await assertRejects(() => desktopUploadAction(gone, OWNER, { action: "upload_session_renew", session_id: SESSION }), UploadSessionError, "caducado");
  const status = fakeDb({
    dream_upload_session_status: { ok: true, session_id: SESSION, state: "connected", connected: true, expires_at: "x", uploads: 1, files: [{ id: FILE, file_name: "a.pdf", status: "processed" }] },
  });
  const s = (await desktopUploadAction(status, OWNER, { action: "upload_session_status", session_id: SESSION })).session;
  assertEquals(s.id, SESSION);
  assertEquals(s.connected, true);
  assertEquals(s.files.length, 1);
  assertEquals("ok" in s, false);
  const close = fakeDb({});
  assertEquals(await desktopUploadAction(close, OWNER, { action: "upload_session_close", session_id: SESSION }), { ok: true });
  assertEquals(close.calls[0], { name: "dream_upload_session_close", args: { p_owner: OWNER, p_session: SESSION } });
});

function mobile(db, overrides = {}) {
  const dispatched = [];
  const logs = [];
  const discarded = [];
  const deps = {
    db,
    headers: new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "192.0.2.1" }),
    dispatch: (owner, payload) => {
      dispatched.push({ owner, payload });
      const handler = overrides[payload.action];
      if (handler) return Promise.resolve(handler(payload));
      if (payload.action === "exam_upload_start") return Promise.resolve({ status: 200, data: { conversation_id: "conv" } });
      if (payload.action === "attachment_upload") return Promise.resolve({ status: 200, data: { attachment: { id: ATTACHMENT, file_name: payload.file_name, status: "processed" } } });
      return Promise.resolve({ status: 200, data: { exam: { id: EXAM, title: "Secreto" } } });
    },
    discardAttachment: (owner, id) => {
      discarded.push({ owner, id });
      return Promise.resolve();
    },
    log: (event) => logs.push(event),
  };
  return { deps, dispatched, logs, discarded };
}
const invalid = { ok: false, status: 404, code: "upload_link_invalid" };

Deno.test("móvil: token mal formado, inexistente o de otro móvil dan el mismo error", async () => {
  const token = randomSecret();
  const shape = mobile(fakeDb({}));
  const a = await assertRejects(() => mobileUploadAction(shape.deps, { action: "upload_qr_connect", token: "corto" }), UploadSessionError);
  assertEquals(shape.deps.db.calls.length, 0);
  const db = fakeDb({ dream_upload_qr_gate: invalid });
  const b = await assertRejects(() => mobileUploadAction(mobile(db).deps, { action: "upload_qr_connect", token }), UploadSessionError);
  const c = await assertRejects(() => mobileUploadAction(mobile(db).deps, { action: "upload_qr_connect", token, device_key: "x" }), UploadSessionError);
  for (const e of [a, b, c]) assertEquals([e.status, e.code, e.message], [404, "upload_link_invalid", INVALID_LINK_MESSAGE]);
});

Deno.test("móvil: conectar no devuelve datos del examen y no registra el token", async () => {
  const token = randomSecret();
  const db = fakeDb({ dream_upload_qr_gate: { ok: true, expires_at: "2026-10-17T10:10:00Z", uploads: 0, max_uploads: 10 } });
  const { deps, logs } = mobile(db);
  const result = await mobileUploadAction(deps, { action: "upload_qr_connect", token });
  assertEquals(Object.keys(result).sort(), ["device_key", "expires_at", "max_uploads", "ok", "uploads"]);
  assertMatch(result.device_key, SECRET_PATTERN);
  const args = db.calls[0].args;
  assertEquals(args.p_kind, "connect");
  assertEquals(args.p_token_hash, await sha256Hex(token));
  assertEquals(args.p_device_hash, await sha256Hex(result.device_key));
  assertEquals(args.p_ip_hash, await sha256Hex("dream-qr-ip:203.0.113.7"));
  const everything = JSON.stringify({ calls: db.calls, logs });
  assertEquals(everything.includes(token), false);
  assertEquals(everything.includes(result.device_key), false);
  assertEquals(everything.includes("203.0.113.7"), false);
  assertEquals(logs, [{ event: "upload_qr", action: "upload_qr_connect", outcome: "connected" }]);
  // Reconexión con la misma llave: la conserva.
  const again = await mobileUploadAction(mobile(db).deps, { action: "upload_qr_connect", token, device_key: result.device_key });
  assertEquals(again.device_key, result.device_key);
});

const slot = { ok: true, owner_id: OWNER, exam_id: EXAM, file_id: FILE, uploads: 1, max_uploads: 10 };
const filePayload = (token, device) => ({
  action: "upload_qr_file", token, device_key: device, file_name: "../apuntes/tema 1.pdf",
  mime_type: "application/pdf", content_base64: btoa("%PDF-1.4 contenido"),
});

Deno.test("móvil: subir recorre la misma ruta que el ordenador y solo a ese examen", async () => {
  const token = randomSecret();
  const device = randomSecret();
  const db = fakeDb({ dream_upload_qr_gate: slot, dream_upload_qr_finish: { ok: true, uploads: 1 } });
  const { deps, dispatched, logs } = mobile(db);
  const result = await mobileUploadAction(deps, filePayload(token, device));
  assertEquals(result, { ok: true, file: { file_name: "tema 1.pdf", status: "processed" }, uploads: 1, max_uploads: 10 });
  assertEquals(dispatched.map((d) => [d.owner, d.payload.action]), [
    [OWNER, "exam_upload_start"], [OWNER, "attachment_upload"], [OWNER, "exam_material_add"],
  ]);
  assertEquals(dispatched[0].payload.exam_id, EXAM);
  assertEquals(dispatched[1].payload.conversation_id, "conv");
  assertEquals(dispatched[1].payload.file_name, "tema 1.pdf");
  assertEquals(dispatched[2].payload, { action: "exam_material_add", exam_id: EXAM, attachment_id: ATTACHMENT });
  const gate = db.calls.find((c) => c.name === "dream_upload_qr_gate").args;
  assertEquals([gate.p_kind, gate.p_file_name, gate.p_bytes], ["upload", "tema 1.pdf", 18]);
  assertEquals(db.calls.at(-1), { name: "dream_upload_qr_finish", args: { p_file: FILE, p_attachment: ATTACHMENT } });
  // La respuesta no lleva nada del examen («Secreto» venía en exam_material_add).
  assertEquals(JSON.stringify(result).includes("Secreto"), false);
  assertEquals(JSON.stringify(logs).includes("tema"), false);
  assertEquals(JSON.stringify({ c: db.calls, logs }).includes(token), false);
});

Deno.test("móvil: archivo rechazado por la validación normal libera el hueco y explica el motivo", async () => {
  const db = fakeDb({ dream_upload_qr_gate: slot, dream_upload_qr_finish: { ok: true, uploads: 0 } });
  const { deps } = mobile(db, {
    attachment_upload: () => ({ status: 415, data: { error: "Formato no compatible." } }),
  });
  const error = await assertRejects(() => mobileUploadAction(deps, filePayload(randomSecret(), randomSecret())), UploadSessionError);
  assertEquals([error.status, error.message], [415, "Formato no compatible."]);
  assertEquals(db.calls.at(-1), { name: "dream_upload_qr_finish", args: { p_file: FILE, p_attachment: null } });
});

Deno.test("móvil: examen lleno borra el adjunto suelto; examen cerrado da error genérico", async () => {
  const db = fakeDb({ dream_upload_qr_gate: slot, dream_upload_qr_finish: { ok: true } });
  const full = mobile(db, { exam_material_add: () => ({ status: 409, data: { error: "máximo" } }) });
  const e1 = await assertRejects(() => mobileUploadAction(full.deps, filePayload(randomSecret(), randomSecret())), UploadSessionError);
  assertEquals(e1.code, "upload_quota");
  assertEquals(full.discarded, [{ owner: OWNER, id: ATTACHMENT }]);
  const closed = mobile(db, { exam_upload_start: () => ({ status: 409, data: { error: "Los materiales de este plan ya están organizados." } }) });
  const e2 = await assertRejects(() => mobileUploadAction(closed.deps, filePayload(randomSecret(), randomSecret())), UploadSessionError);
  assertEquals([e2.status, e2.message], [404, INVALID_LINK_MESSAGE]);
});

Deno.test("móvil: límites y entrada no válida", async () => {
  const token = randomSecret();
  const device = randomSecret();
  const limited = fakeDb({ dream_upload_qr_gate: { ok: false, status: 429, code: "upload_rate", retry_after: 60 } });
  const e1 = await assertRejects(() => mobileUploadAction(mobile(limited).deps, { action: "upload_qr_connect", token }), UploadSessionError);
  assertEquals([e1.status, e1.retryAfter], [429, 60]);
  const quota = fakeDb({ dream_upload_qr_gate: { ok: false, status: 409, code: "upload_quota" } });
  const e2 = await assertRejects(() => mobileUploadAction(mobile(quota).deps, filePayload(token, device)), UploadSessionError);
  assertEquals(e2.code, "upload_quota");
  const empty = fakeDb({});
  await assertRejects(() => mobileUploadAction(mobile(empty).deps, { ...filePayload(token, device), content_base64: "%%%" }), UploadSessionError, "Falta el archivo");
  await assertRejects(() => mobileUploadAction(mobile(empty).deps, { ...filePayload(token, device), file_name: "../" }), UploadSessionError, "Falta el archivo");
  const noDevice = await assertRejects(() => mobileUploadAction(mobile(empty).deps, { ...filePayload(token, device), device_key: undefined }), UploadSessionError);
  assertEquals(noDevice.code, "upload_link_invalid");
  await assertRejects(() => mobileUploadAction(mobile(empty).deps, { action: "exams", token }), UploadSessionError, "Acción no válida.");
  assertEquals(empty.calls.length, 0);
  assert(UPLOAD_QR.limits.max_uploads <= 10 && UPLOAD_QR.ttlSeconds === 600);
});

Deno.test("móvil: los límites de subida de file-guard llegan con su mensaje", async () => {
  const db = fakeDb({ dream_upload_qr_gate: slot, dream_upload_qr_finish: { ok: true } });
  const { deps } = mobile(db, {
    attachment_upload: () => ({ status: 429, data: { error: "Has subido muchos archivos en poco tiempo. Espera un minuto y vuelve a intentarlo.", code: "rate_limit", retry_after: 60 } }),
  });
  const error = await assertRejects(() => mobileUploadAction(deps, filePayload(randomSecret(), randomSecret())), UploadSessionError);
  assertEquals([error.status, error.retryAfter], [429, 60]);
  assertMatch(error.message, /muchos archivos/);
  const macro = mobile(db, { attachment_upload: () => ({ status: 422, data: { error: "Este documento tiene macros y no se puede subir.", code: "office_macros" } }) });
  const e2 = await assertRejects(() => mobileUploadAction(macro.deps, filePayload(randomSecret(), randomSecret())), UploadSessionError);
  assertEquals([e2.status, e2.code], [422, "upload_file_rejected"]);
  assertMatch(e2.message, /macros/);
});
