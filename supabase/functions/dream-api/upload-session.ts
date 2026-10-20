// Subida desde el móvil con QR (PROMPT_EXAMEN_ESTILO 5.3 y 8). Diseño en
// docs/SUBIDA_QR.md; migración 20261018153000_upload_sessions.sql.
//
// - El ordenador (sesión de usuario) crea, renueva, consulta y cierra.
// - El móvil (SIN sesión de usuario, solo token) se conecta y sube archivos a
//   ese examen. Cada archivo pasa por la MISMA ruta que la subida normal:
//   exam_upload_start → attachment_upload → exam_material_add, despachadas
//   dentro de dream-api con el dueño del examen (deps.dispatch).
// - El token y la llave del móvil nunca se guardan ni se registran: solo su
//   SHA-256. Los errores de token son siempre el mismo (no dicen por qué).

export const UPLOAD_QR = {
  /** Vida de cada tramo; el ordenador lo renueva mientras el QR está a la vista. */
  ttlSeconds: 600,
  /** Ninguna sesión vive más de una hora aunque se renueve. */
  maxLifetimeSeconds: 3600,
  /** Sesiones nuevas por alumno y hora. */
  hourlySessions: 30,
  limits: {
    ip_per_minute: 30,
    ip_failures_per_hour: 20,
    session_attempts: 200,
    max_uploads: 10,
    max_bytes: 40 * 1024 * 1024,
    max_in_flight: 2,
  },
} as const;

export const DESKTOP_UPLOAD_ACTIONS = new Set([
  'upload_session_create',
  'upload_session_renew',
  'upload_session_status',
  'upload_session_close',
]);
export const MOBILE_UPLOAD_ACTIONS = new Set(['upload_qr_connect', 'upload_qr_file']);
/** Cabecera con la que el móvil pide la ruta sin sesión de usuario. */
export const QR_CHANNEL_HEADER = 'x-dream-channel';

export class UploadSessionError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter = 0) {
    super(message);
    this.name = 'UploadSessionError';
  }
}
export const INVALID_LINK_MESSAGE = 'Este código ya no vale. Escanea uno nuevo desde tu ordenador.';
const invalidLink = () => new UploadSessionError(404, 'upload_link_invalid', INVALID_LINK_MESSAGE);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 32 bytes en base64url sin relleno: 43 caracteres. */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** IP del cliente tal y como la ve la pasarela de Supabase. Solo se usa hasheada. */
export function clientIp(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip') || headers.get('x-real-ip');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  return (direct || forwarded || 'unknown').trim().slice(0, 64) || 'unknown';
}

/** Nombre para mostrar: sin rutas ni caracteres de control. Nunca se usa para rutas. */
export function displayFileName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const base = value.split(/[\\/]/).pop() ?? '';
  // deno-lint-ignore no-control-regex
  return base.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').trim().slice(0, 255);
}

/** Bytes que ocupa un base64; null si no es base64. */
export function base64Size(value: unknown): number | null {
  if (typeof value !== 'string' || !value || value.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  return Math.floor((value.replace(/=+$/, '').length * 3) / 4);
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= now;
}

type RpcResult = { data: unknown; error: unknown };
export interface UploadDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}
type Row = Record<string, unknown>;

async function call(db: UploadDb, name: string, args: Record<string, unknown>): Promise<Row> {
  const { data, error } = await db.rpc(name, args);
  if (error || !data || typeof data !== 'object') throw new UploadSessionError(503, 'upload_unavailable', 'No se pudo conectar ahora. Inténtalo de nuevo.');
  return data as Row;
}
const retry = (row: Row) => (typeof row.retry_after === 'number' ? row.retry_after : 0);

// ------------------------------------------------------------------ ordenador
export async function desktopUploadAction(db: UploadDb, owner: string, body: Row): Promise<Row> {
  const action = String(body.action);
  if (action === 'upload_session_create') {
    if (typeof body.exam_id !== 'string' || !UUID.test(body.exam_id)) throw new UploadSessionError(400, 'invalid_request', 'Examen no válido.');
    const token = randomSecret();
    const row = await call(db, 'dream_upload_session_create', {
      p_owner: owner, p_exam: body.exam_id, p_token_hash: await sha256Hex(token),
      p_ttl_seconds: UPLOAD_QR.ttlSeconds, p_hourly_limit: UPLOAD_QR.hourlySessions,
    });
    if (row.ok !== true) {
      if (row.status === 429) throw new UploadSessionError(429, 'upload_session_rate', 'Has pedido muchos códigos seguidos. Espera un poco.', retry(row));
      if (row.status === 409) throw new UploadSessionError(409, 'exam_not_editable', 'Este examen ya no admite archivos nuevos.');
      throw new UploadSessionError(400, 'invalid_request', 'No se pudo crear el código.');
    }
    // El token sale una sola vez, en esta respuesta. Va en el fragmento (#), que
    // el navegador no envía al servidor: no queda en registros de Vercel.
    return {
      session: {
        id: row.session_id, token, url: `/subir#${token}`, expires_at: row.expires_at,
        ttl_seconds: UPLOAD_QR.ttlSeconds, max_uploads: UPLOAD_QR.limits.max_uploads,
      },
    };
  }
  if (typeof body.session_id !== 'string' || !UUID.test(body.session_id)) throw new UploadSessionError(400, 'invalid_request', 'Código no válido.');
  const args = { p_owner: owner, p_session: body.session_id };
  if (action === 'upload_session_renew') {
    const row = await call(db, 'dream_upload_session_renew', { ...args, p_ttl_seconds: UPLOAD_QR.ttlSeconds, p_max_lifetime_seconds: UPLOAD_QR.maxLifetimeSeconds });
    if (row.ok !== true) throw new UploadSessionError(410, 'upload_session_gone', 'Este código ha caducado. Crea uno nuevo.');
    return { session: { id: row.session_id, expires_at: row.expires_at } };
  }
  if (action === 'upload_session_status') {
    const row = await call(db, 'dream_upload_session_status', args);
    if (row.ok !== true) throw new UploadSessionError(404, 'upload_session_gone', 'Este código ya no existe.');
    const { ok: _ok, session_id, ...rest } = row;
    return { session: { id: session_id, ...rest, max_uploads: UPLOAD_QR.limits.max_uploads } };
  }
  if (action === 'upload_session_close') {
    const { error } = await db.rpc('dream_upload_session_close', args);
    if (error) throw new UploadSessionError(503, 'upload_unavailable', 'No se pudo cerrar el código. Caducará solo.');
    return { ok: true };
  }
  throw new UploadSessionError(400, 'invalid_request', 'Acción no válida.');
}

// ---------------------------------------------------------------------- móvil
export type Dispatch = (owner: string, payload: Row) => Promise<{ status: number; data: Row }>;
export interface MobileDeps {
  db: UploadDb;
  headers: Headers;
  /** Ejecuta una acción normal de dream-api como el dueño del examen. */
  dispatch: Dispatch;
  /** Borra un adjunto que no se pudo asociar al examen. */
  discardAttachment: (owner: string, attachmentId: string) => Promise<void>;
  /** Registro técnico sin token, llave, nombres ni contenido. */
  log?: (event: Row) => void;
}

async function gate(deps: MobileDeps, body: Row, kind: 'connect' | 'upload', device: string, file?: { name: string; bytes: number }) {
  const row = await call(deps.db, 'dream_upload_qr_gate', {
    p_token_hash: await sha256Hex(String(body.token)),
    p_ip_hash: await sha256Hex(`dream-qr-ip:${clientIp(deps.headers)}`),
    p_device_hash: await sha256Hex(device),
    p_kind: kind,
    p_file_name: file?.name ?? null,
    p_bytes: file?.bytes ?? null,
    p_limits: UPLOAD_QR.limits,
  });
  if (row.ok === true) return row;
  if (row.status === 429) {
    throw new UploadSessionError(429, String(row.code ?? 'upload_rate'), row.code === 'upload_busy' ? 'Espera a que termine el archivo anterior.' : 'Demasiados intentos. Espera un momento y vuelve a probar.', retry(row) || 30);
  }
  if (row.status === 409) throw new UploadSessionError(409, 'upload_quota', 'Has llegado al máximo de archivos desde el móvil. Sigue en tu ordenador.');
  if (row.status === 400) throw new UploadSessionError(400, 'invalid_request', 'No se pudo leer el archivo. Prueba con otro.');
  throw invalidLink();
}

function fileFailure(status: number, data: Row): UploadSessionError {
  const message = typeof data.error === 'string' ? data.error : 'No se pudo subir el archivo. Inténtalo de nuevo.';
  // Sesión del dueño o examen fuera de borrador: misma respuesta que un token inválido.
  if (status === 401 || status === 403 || status === 404) return invalidLink();
  // Límites y rechazos de la validación normal (file-guard.mjs): su mensaje, tal cual.
  if (status === 429) return new UploadSessionError(429, 'upload_rate', typeof data.error === 'string' ? message : 'Hay muchas subidas ahora. Espera un momento y vuelve a probar.', Number(data.retry_after) || 30);
  if ([400, 413, 415, 422].includes(status)) return new UploadSessionError(status, 'upload_file_rejected', message);
  if (status === 503 && data.code === 'quota_unavailable') return new UploadSessionError(503, 'upload_failed', message);
  return new UploadSessionError(status >= 500 ? 503 : 409, 'upload_failed', 'No se pudo subir el archivo. Inténtalo de nuevo.');
}

export async function mobileUploadAction(deps: MobileDeps, body: Row): Promise<Row> {
  const action = String(body.action);
  const log = (outcome: string) => deps.log?.({ event: 'upload_qr', action, outcome });
  try {
    if (typeof body.token !== 'string' || !SECRET_PATTERN.test(body.token)) throw invalidLink();
    if (body.device_key !== undefined && (typeof body.device_key !== 'string' || !SECRET_PATTERN.test(body.device_key))) throw invalidLink();

    if (action === 'upload_qr_connect') {
      const device = typeof body.device_key === 'string' ? body.device_key : randomSecret();
      const row = await gate(deps, body, 'connect', device);
      log('connected');
      // Ningún dato del examen ni del alumno: solo lo que la página necesita.
      return { ok: true, device_key: device, expires_at: row.expires_at, uploads: row.uploads, max_uploads: row.max_uploads };
    }

    if (action !== 'upload_qr_file') throw new UploadSessionError(400, 'invalid_request', 'Acción no válida.');
    if (typeof body.device_key !== 'string') throw invalidLink();
    const name = displayFileName(body.file_name);
    const bytes = base64Size(body.content_base64);
    if (!name || bytes === null || bytes < 1) throw new UploadSessionError(400, 'invalid_request', 'Falta el archivo o no se puede leer.');

    const slot = await gate(deps, body, 'upload', body.device_key, { name, bytes });
    const owner = String(slot.owner_id);
    const examId = String(slot.exam_id);
    let attachmentId: string | null = null;
    try {
      const start = await deps.dispatch(owner, { action: 'exam_upload_start', exam_id: examId });
      if (start.status !== 200 || typeof start.data.conversation_id !== 'string') throw fileFailure(start.status === 200 ? 503 : start.status === 409 ? 404 : start.status, start.data);
      const upload = await deps.dispatch(owner, {
        action: 'attachment_upload', conversation_id: start.data.conversation_id,
        file_name: name, mime_type: typeof body.mime_type === 'string' ? body.mime_type.slice(0, 100) : '',
        content_base64: body.content_base64,
      });
      const attachment = upload.data.attachment as Row | undefined;
      if (upload.status !== 200 || typeof attachment?.id !== 'string') throw fileFailure(upload.status === 200 ? 503 : upload.status, upload.data);
      const linked = await deps.dispatch(owner, { action: 'exam_material_add', exam_id: examId, attachment_id: attachment.id });
      if (linked.status !== 200) {
        await deps.discardAttachment(owner, attachment.id).catch(() => {});
        if (linked.status === 409) throw new UploadSessionError(409, 'upload_quota', 'Tu examen ya tiene el máximo de archivos. Quita alguno en tu ordenador.');
        throw fileFailure(linked.status, linked.data);
      }
      attachmentId = attachment.id;
    } finally {
      const done = await deps.db.rpc('dream_upload_qr_finish', { p_file: slot.file_id, p_attachment: attachmentId });
      if (done.error) log('finish_failed');
    }
    log('uploaded');
    return { ok: true, file: { file_name: name, status: 'processed' }, uploads: slot.uploads, max_uploads: slot.max_uploads };
  } catch (error) {
    log(error instanceof UploadSessionError ? error.code : 'error');
    throw error;
  }
}
