# Subida desde el móvil con QR (PR 5)

Fecha: 17/10/2026. Apartados 5.3 y 8 de `PROMPT_EXAMEN_ESTILO.md`.

**Nada de esto está aplicado ni desplegado.** Hace falta el OK de Carlos para:

1. Aplicar la migración `supabase/migrations/20261018153000_upload_sessions.sql`.
2. Desplegar `dream-api` con `upload-session.ts` y los cambios de `index.ts`.

No hace falta tocar la configuración: `verify_jwt` sigue en `true`. Comprobado el 17/10 con una petición sin sesión: la pasarela deja pasar las llamadas que llevan solo `apikey` (clave publicable) y es `dream-api` quien decide. Si en el futuro la pasarela exigiera un JWT de usuario, habría que desplegar con `--no-verify-jwt`: todas las acciones salvo las dos del móvil ya comprueban la sesión dentro de la función (`auth.getUser`).

## Cómo funciona

1. El ordenador (con sesión) llama a `upload_session_create` con el examen en borrador. Recibe el token una sola vez y el enlace `/subir#<token>`, y pinta el QR.
2. El móvil abre `/subir#<token>` (sin sesión). El token va en el fragmento (`#`), que el navegador nunca envía al servidor. La página lo lee de `location.hash`, lo borra de la barra y del historial con `history.replaceState` y lo manda en el cuerpo. Lo guarda en `sessionStorage` de esa pestaña para que una recarga tras la cámara siga funcionando. Después llama a `upload_qr_connect`: el primer móvil que entra queda atado a la sesión con una llave aleatoria propia. Otro móvil con el mismo enlace recibe «Este código ya no vale».
3. Cada archivo va a `upload_qr_file`, que dentro de `dream-api` recorre **la misma ruta que la subida desde el ordenador**, como el dueño del examen: `exam_upload_start` → `attachment_upload` (validación y extracción, la que deje la rama `security/subidas-seguras`) → `exam_material_add`. Lleva la misma admisión (`attachment_upload` consume).
4. El ordenador consulta `upload_session_status` con sondeo corto y ve aparecer cada archivo (`processing` → `processed` o `failed`).
5. Al pasar de paso o salir, el ordenador llama a `upload_session_close` y el enlace deja de valer al momento. Si nadie lo renueva, caduca a los 10 minutos.

## Base de datos (migración 20261018153000_upload_sessions.sql)

- `dream_private.upload_sessions`: `owner_id`, `exam_id`, `token_hash` (SHA-256 en hex, único), `device_hash`, `state` (`open`, `connected`, `closed`), `created_at`, `expires_at`, `connected_at`, `closed_at`, `uploads_count`, `bytes_received`, `attempts`.
- `dream_private.upload_session_files`: lo que ha llegado del móvil, con su estado y el `attachment_id`.
- RLS activada y sin políticas. `anon` y `authenticated` no tienen permisos sobre las tablas ni sobre las funciones. Todo pasa por funciones `security definer` que solo puede ejecutar `service_role`.
- Borrado en cascada con la cuenta y con el examen. Las sesiones caducadas hace más de un día se borran solas al crear una nueva.
- Los contadores de intentos usan `dream_private.counters`, que ya existe y se limpia con `dream_admission_cleanup`.
- Probada en un PostgreSQL 16 local de usar y tirar: `DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<puerto>/postgres node scripts/security/upload-sessions-integration.mjs`.

## Límites

| Límite | Valor | Dónde |
|---|---|---|
| Token | 32 bytes aleatorios (256 bits), base64url | `randomSecret()` |
| Caducidad | 10 minutos; el ordenador renueva cuando quedan menos de 2 | `UPLOAD_QR.ttlSeconds` |
| Vida máxima aunque se renueve | 1 hora | `maxLifetimeSeconds` |
| Sesiones nuevas por alumno | 30 por hora | `hourlySessions` |
| Peticiones por IP | 30 por minuto | `limits.ip_per_minute` |
| Fallos por IP (token malo, caducado…) | 20 por hora; después, 429 aunque el token sea bueno | `limits.ip_failures_per_hour` |
| Peticiones por sesión | 200 | `limits.session_attempts` |
| Archivos por sesión | 10 | `limits.max_uploads` |
| Bytes recibidos por sesión | 40 MB (cuentan también los fallidos) | `limits.max_bytes` |
| Archivos a la vez | 2 | `limits.max_in_flight` |
| Tamaño y formato de cada archivo | los de `attachment_upload` | `attachments.mjs` |
| Materiales por examen | 20, en `dream_exam_link_material` | migración `20261018160000_exam_materials_limit.sql` |

La IP solo se guarda como SHA-256 dentro de los contadores (se borran a los 2 días).

## Contrato de las acciones

Todas por `POST` a `NEXT_PUBLIC_DREAM_API_URL`. Errores: `{ error, code, retry_after }` con el estado HTTP indicado.

### Ordenador (con sesión: `Authorization: Bearer <token de usuario>`)

`upload_session_create { exam_id }` →
```json
{ "session": { "id": "uuid", "token": "43 caracteres", "url": "/subir#<token>", "expires_at": "ISO", "ttl_seconds": 600, "max_uploads": 10 } }
```
El token solo sale aquí. Crear otra sesión cierra la anterior del mismo alumno. Errores: 400 `invalid_request`, 409 `exam_not_editable` (el examen ya no es borrador), 429 `upload_session_rate`.

`upload_session_renew { session_id }` → `{ "session": { "id", "expires_at" } }`. Error: 410 `upload_session_gone` (cerrada, caducada o examen ya no editable: crear otra).

`upload_session_status { session_id }` →
```json
{ "session": { "id": "uuid", "state": "open|connected|expired|closed", "connected": true, "connected_at": "ISO|null", "expires_at": "ISO", "uploads": 2, "max_uploads": 10,
  "files": [{ "id": "uuid", "attachment_id": "uuid|null", "file_name": "tema1.pdf", "size_bytes": 1234, "status": "processing|processed|failed", "created_at": "ISO" }] } }
```
Error: 404 `upload_session_gone`. Los archivos `processed` ya están asociados al examen (salen también en `exam_get`).

`upload_session_close { session_id }` → `{ "ok": true }`. Idempotente.

### Móvil (sin sesión: solo `apikey` y la cabecera `X-Dream-Channel: qr`)

`upload_qr_connect { token, device_key? }` →
```json
{ "ok": true, "device_key": "43 caracteres", "expires_at": "ISO", "uploads": 0, "max_uploads": 10 }
```
`upload_qr_file { token, device_key, file_name, mime_type, content_base64 }` →
```json
{ "ok": true, "file": { "file_name": "tema1.pdf", "status": "processed" }, "uploads": 1, "max_uploads": 10 }
```
Nunca devuelven datos del examen ni del alumno. Errores:

- 404 `upload_link_invalid`, siempre con el mismo texto, para token mal formado, inexistente, caducado, cerrado, de otro móvil o de un examen que ya no es borrador.
- 429 `upload_rate` / `upload_busy` con `retry_after`.
- 409 `upload_quota`: tope de archivos de la sesión o del examen.
- 400, 413, 415, 422 `upload_file_rejected`: el mensaje de la validación normal del archivo.

### Cliente

- `lib/upload-session.ts` (ordenador): `createUploadSession`, `renewUploadSession`, `getUploadSessionStatus`, `closeUploadSession`, `watchUploadSession` y utilidades (`shouldRenew`, `nextPollDelay`…).
- `components/exams/qr-panel.tsx`: `<QrPanel examId onFiles onConnectedChange />`, listo para el paso de subida del asistente en escritorio (`(min-width: 900px) and (pointer: fine)`). Se monta al entrar en el paso y al desmontarse cierra el código.
- `lib/upload-qr.ts` y `components/upload/mobile-upload.tsx`: el lado del móvil.

## Decisiones

- **Sondeo corto con retroceso, no Realtime.** El proyecto no tiene Realtime: la publicación `supabase_realtime` no tiene tablas y no hay políticas en `realtime.messages` (consultado el 17/10). Todo el acceso a datos pasa por `dream-api` con `service_role`, y la tabla de sesiones es privada. Usar Realtime obligaría a abrir lectura con RLS al navegador o a montar canales privados con políticas nuevas. El sondeo empieza en 1,5 s, crece ×1,6 hasta 6 s si nada cambia, vuelve a 1,5 s con cada cambio o mientras hay un archivo procesándose, se pausa con la pestaña oculta y para al caducar o cerrar. Coste: como mucho unas 200 llamadas ligeras (sin IA) por QR abierto 10 minutos.
- **Misma validación.** El móvil no tiene su propia validación de archivos: `dream-api` despacha internamente `attachment_upload` con el dueño del examen (igual que `exam_session_create` despacha `test_generate`). El endurecimiento de `security/subidas-seguras` (PR #31: `file-guard.mjs`, firma real, macros, PDF activo, nombres, cuota por usuario y minuto) está en esa ruta, así que se aplica también al QR sin código aparte; sus mensajes y su `retry_after` llegan tal cual al móvil. Comprobado que las dos ramas se unen sin conflictos.
- **Un solo móvil por código.** El primero que se conecta recibe una llave aleatoria (guardada en `sessionStorage` de esa pestaña para sobrevivir a una recarga tras la cámara). Solo se guarda su hash.
- **Errores que no filtran.** Todo lo que tenga que ver con el código da el mismo 404 y la misma página («Este código ya no vale»).
- **El token no se registra.** Va en el cuerpo, nunca en cabeceras ni en registros. Los registros de `dream-api` solo guardan `{event:"upload_qr", action, outcome}`. La página `/subir` (y cualquier `/subir/*`) no envía analítica ni diagnóstico aunque el alumno los haya aceptado (`isPrivatePath` en `lib/observability/privacy.ts`), lleva `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex` (middleware y `next.config.ts`) y `robots: noindex`.
- **Token en el fragmento, no en la ruta** (decisión técnica del 17/10). `/subir#<token>` no llega nunca al servidor, así que no queda en los registros de peticiones de Vercel ni en los de la CDN. Cualquier `/subir/<algo>` redirige (307) a `/subir` sin el token, con las mismas cabeceras, y la página muestra «Este código ya no vale». Si se escanea otro código en la misma pestaña, solo cambia el fragmento: la página lo detecta (`hashchange`) y empieza de cero.
- **QR propio.** `lib/qr.ts` (unos 300 líneas, sin dependencias): modo byte, corrección M, versiones 1 a 10. Se carga con `import()` solo al pintar el panel. Probado contra matrices de referencia de segno 1.6.6 (versiones 1, 2, 5, 6, 7, 8, 9 y 10, las 8 máscaras): `tests/qr.test.ts`. No hace falta instalar nada.

## Tope de materiales por examen: 20 (decisión de Carlos, 17/10)

- Migración nueva `20261018160000_exam_materials_limit.sql` (sin aplicar): redefine `dream_exam_link_material` con 20 en vez de 4, con la misma firma y los mismos permisos. La migración ya aplicada no se toca.
- `exams.ts` (mensaje de error), `lib/exam-plans.ts` (`MAX_EXAM_MATERIALS = 20`) y `exam-wizard.tsx` (usa la constante). Una prueba (`tests/exams.test.ts`) comprueba que el número del cliente coincide con la última migración que define la función.
- Límites que **no** cambian, porque son otra cosa: 4 adjuntos por mensaje del chat y 4 archivos a la vez en Apuntes.
- **Contexto de la IA:** `examContext` (plan, chat y simulacros) sigue acotado a 20.000 caracteres de material. En esta rama el recorte es al final del texto unido, así que con muchos archivos los primeros ocupan todo. Con `wrapStudentMaterial` del PR #31, el presupuesto se reparte por igual entre los archivos (unos 800 caracteres cada uno con 20). `supabase/tests/exam_context_deno.mjs` comprueba el tope siempre, y el reparto cuando `file-guard.mjs` está presente.
- Probado en PostgreSQL local con `scripts/security/exam-materials-integration.mjs`: 20 entran, el 21 da error y volver a asociar uno ya incluido no cuenta.
