# Operación segura y reproducción

No se ha aplicado la migración ni desplegado esta versión de dream-api. La rama depende de Exámenes y observabilidad, PR #1/#2. Revisar e integrar en ese orden. No es una declaración de preparación para producción.

## Activación revisable

1. Revisar `20261008192123_security_admission.sql`: esquema privado nuevo; no altera registros académicos; reduce permisos UPDATE del perfil a sus campos editables. Tomar backup y verificar compatibilidad de otros clientes antes de aplicar. No ejecutar `db reset` contra remoto.
2. Configurar `dream_private.limits` con un operador autorizado: `enabled=false` de inicio. `token_microusd` debe cubrir **el mayor precio real por token de entrada, salida y visión** de los modelos configurados; `search_microusd`, el coste máximo de una búsqueda básica. Un millón de microUSD equivale a US$1. No hay tarifas supuestas escondidas ni sincronización de claves desde Vercel. Estos datos deben revisarse al cambiar precios/modelos. Sin valores positivos, la IA devuelve 503; las lecturas continúan.
3. Definir en Supabase `DREAM_ALLOWED_ORIGINS` con orígenes exactos de producción y previews autorizadas separados por coma (sin rutas, sin comodín). Configurar las claves numeradas y un `DREAM_VISION_INPUT_TOKEN_CEILING` verificado para visión; sin él el análisis de imágenes no se admite. `.env.example` de Edge contiene solo nombres vacíos. No cambiar modelo ni prompts.
4. Revisar cuotas iniciales: 6 operaciones de consumo/minuto/usuario, 50/día, 5 generaciones de test/plan/simulacro/día, 15 búsquedas/día, 1 operación concurrente/usuario, 8 globales; 500k unidades conservadoras de tokens/usuario/día, 2M globales; US$1/usuario/día y US$10/global/día. Son topes de reserva, **no previsiones de gasto**. Ajustar a las cuotas contratadas antes de habilitar. Cada intento de proveedor, incluidos fallos, se reserva sin devolver costes inciertos. Las claves no multiplican las cuotas.
5. Programar `dream_admission_cleanup()` al menos diariamente con privilegio de servidor; revisar retención antes de activar. Contadores 2 días, tombstones de solicitudes completadas 1 día. Las leases activas vencen a los 3 minutos; el límite global de operación es 150 segundos. La adquisición atómica devuelve 429 inmediatamente si hay contención: no hay cola indefinida.
6. Revisar la configuración completa, aplicar en un entorno de staging aislado, probar OAuth real y cada proveedor con cuentas autorizadas, y solo después solicitar revisión de un despliegue de producción. El código y la migración deben desplegarse coordinadamente: backend nuevo sin RPC responde 503 en IA, no omite límites.

## Idempotencia y entregas

El cliente envía `request_id` UUID en el JSON por operación; el servidor también acepta `x-dream-request-id`. Usar JSON conserva compatibilidad CORS con el backend anterior durante la revisión. Una retransmisión de la misma petición con el mismo identificador se rechaza 409 mientras está activa y durante la retención; no se reenvían prompts ni se almacenan respuestas privadas en el contador. Un nuevo identificador representa una nueva operación: no se promete deduplicación semántica de mensajes iguales. No hay retries automáticos ni replay de solicitudes al reconectar. Exámenes conservan sus identificadores y CAS existentes. Los tests generales ya entregados rechazan una segunda entrega: una nueva práctica necesita un test nuevo. La nueva RPC `dream_test_commit` guarda intento, respuestas y evidencia en una sola transacción con bloqueo del test e incrementos atómicos. Las correcciones parciales heredadas exigen recuperación, no una repetición automática que altere evidencia.

## Proveedores y degradación

Groq: claves válidas únicas, 401/403 con cooldown local de 15 minutos, 408/425/5xx con failover acotado; ventana total 90 segundos por pasada. El cooldown local acelera decisiones, no implementa cuotas. Un 429 detiene la pasada, respeta Retry-After y persiste una pausa compartida de proveedor para todas las claves. No se cambia de clave para superar cuotas. Streaming emitido nunca se reinicia; se cancela el reader y se conserva el texto parcial.

Tavily: dos slots numerados; fallback heredado solo si faltan ambos. Timeout 10 segundos/intento y 25 total, máximo los slots disponibles, una ronda web por chat. 429 pausa toda la cuenta, no usa otra clave. Respuestas acotadas a 100 KB, 4 resultados, URLs HTTP(S). Fallo explícito; no se genera una respuesta con supuestas fuentes cuando falla la búsqueda.

HTTP 429 distingue `dream_rpm`, `dream_daily`, `dream_concurrency`, `dream_admission_busy`, `dream_budget` de `provider_rate_limit`, con Retry-After. Si sucede después de abrir NDJSON, el evento error transporta `code` y `retry_after`: HTTP ya no puede cambiar. El parser del cliente conserva esos metadatos y emite analítica permitida. Los endpoints de lectura no consumen presupuesto de IA.

## Observabilidad y alertas

PostHog existente: consentimiento explícito, sin autocaptura ni Replay. Añadido `rate_limit_reached`; nunca contenido, identidad, UUID de conversación o adjunto. El plugin confirma Dream y un `analytics_verification` el 8/10/2026. No interpretar sus usuarios anónimos como número exacto de personas registradas.

Sentry Next mantiene sus filtros. Edge utiliza un SDK Deno **independiente**, sin integraciones automáticas ni propagación/tracing: envía únicamente mensajes constantes y etiquetas técnicas permitidas, sin stack privado, request, usuario o documentos. Medir Edge con logs técnicos agregados, no asumir que Next cubre Groq/Supabase. Falta DSN/cuenta para demostrar recepción real y configurar alertas. No copiar el token de lectura en chat o repositorio.

Alertas propuestas pendientes de instalación en la cuenta: cualquier `admission_unavailable` durante 5 minutos; 5xx >1% con mínimo 100 peticiones/5 minutos; pausa de proveedor >5 minutos; presupuesto al 80%/95%; errores de guardado/corrección y expiración de lease; latencia de lecturas p95 >500ms/p99 >1s. Revisar volumen y falsos positivos. Ninguna alerta remota se ha creado ni se declara activa.

## Reproducción local

Requiere Node24, Docker, PostgreSQL17 y k6 2.3.0 (binario oficial; no dependencia cliente).

```sh
npm ci --ignore-scripts
docker run --name dream-security-postgres -e POSTGRES_PASSWORD=isolated-test-only -p 127.0.0.1:55432:5432 -d postgres:17-alpine
docker exec -i dream-security-postgres psql -U postgres -v ON_ERROR_STOP=1 < scripts/security/bootstrap.sql
docker exec -i dream-security-postgres psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261008192123_security_admission.sql
npm run test:security-db
npm run test:load-server
```

En otra terminal, **sin builds ni otras cargas simultáneas**:

```sh
k6 run -e VUS=10 -e DURATION=20s scripts/security/load.k6.js
# Revisar thresholds antes de subir a 50, 100, 250, etc.
k6 run -e VUS=50 -e DURATION=20s scripts/security/load.k6.js
# AI=0 separa las lecturas de la IA sintética.
k6 run -e VUS=50 -e AI=0 -e DURATION=20s scripts/security/load.k6.js
```

El harness escucha exclusivamente 127.0.0.1:3400 y rechaza bases de datos remotas. Autenticación firmada sintética, 10.000 usuarios sintéticos, 50.000 conversaciones sintéticas, exámenes sintéticos y demora de IA de 40ms: **no es OAuth, Qwen ni Supabase de producción**. Reutiliza el gestor Groq y las RPC reales de admisión sobre PostgreSQL. Las cuotas de pruebas son distintas de los defaults de producción para aislar concurrencia. Medir separadamente aceptación/rechazo: muchos 429 no prueban capacidad de generación.

CI instala, valida TypeScript/ESLint, unitarios, npm audit de ejecución, PostgreSQL/admisión y build, y hace QA de contrato en navegador. No despliega. `npm audit` completo conserva avisos de desarrollo sin parche; no se ocultan.

## Subidas de archivos (apartado 7)

Todo ocurre en `dream-api` (`file-guard.mjs` y `attachments.mjs`); la validación del navegador es solo comodidad. El archivo se lee en memoria y se descarta: solo se guarda el texto extraído y saneado (máx. 24.000 caracteres) y el nombre saneado, que nunca se usa para rutas.

- **Firma real:** PDF `%PDF-`, PNG, JPEG, WebP, GIF y Office (ZIP con `[Content_Types].xml` y carpeta `word/`, `ppt/` o `xl/`). Debe cuadrar con la extensión y con el MIME declarado. Entre imágenes se tolera la extensión cambiada (.jpg que es PNG) y se usa siempre el tipo real. Texto: UTF-8 estricto sin bytes nulos.
- **Office:** fuera macros (`vbaProject.bin`, tipos `macroEnabled`), ActiveX, OLE (`oleObject*.bin`), ejecutables, cifrado (ZIP cifrado u OLE con `EncryptedPackage`) y relaciones externas que se cargan solas (plantillas, imágenes, marcos). Los hipervínculos externos y los libros `.xlsx` de los gráficos se permiten. ZIP: máx. 1000 entradas, 4 MB por entrada, proporción 100:1 por entrada y 16 MB en total (presupuesto anterior), rutas con `..`, absolutas, unidad `C:`, barras invertidas o controles rechazadas.
- **PDF:** cifrados fuera (`/Encrypt`); contenido activo fuera (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFiles`, `/RichMedia`, `/XFA`, `/SubmitForm`, `/ImportData`, también con nombres escapados), además de las acciones JS, adjuntos y anotaciones activas que ve pdf.js. Máx. 80 páginas. Lectura cancelada a los 8 s (temporizador y plazo comprobado entre páginas). Límite: una sola página patológica puede bloquear hasta que termine la página; la Edge Function tiene además su propio límite de tiempo.
- **Imágenes:** dimensiones leídas de la cabecera real (máx. 10.000 px por lado y 50 megapíxeles). Antes de enviarla a la IA se quitan EXIF/GPS/XMP/IPTC/comentarios (JPEG: APP1–APP13, APP15 y COM; PNG: lista blanca de bloques; WebP: EXIF y XMP; GIF: comentarios y extensiones de aplicación salvo el bucle). No se decodifica el píxel (no hay decodificador sin dependencias nuevas). La orientación EXIF se pierde: una foto girada puede llegar girada a la IA.
- **Límites:** 8 archivos y 40 MB por minuto, 60 archivos y 200 MB por hora y usuario, contados sobre `dream_attachments` (sin tabla nueva). Se suman a `dream_admit` (peticiones por minuto y concurrencia 1 por usuario).
- **Registro:** `{"event":"upload_rejected","code","ext","size","actor"}` sin nombre ni contenido; `actor` es un SHA-256 truncado del id de usuario.
- **Material = datos:** todo texto de apuntes llega a la IA dentro de `<material_del_alumno archivo="…">` con la instrucción `MATERIAL_GUARD` de no obedecer órdenes internas (chat, tests y planes de examen). El texto no puede cerrar la etiqueta.

**Recomendación (no aplicada, decide Carlos):** si se quiere un antivirus, la opción sin proveedor nuevo es un ClamAV propio detrás de una función aparte; con proveedor, un escaneo por API con contrato de tratamiento de datos (no VirusTotal: comparte las muestras con terceros).  Hoy el riesgo es bajo porque nada se ejecuta, sirve ni guarda.
