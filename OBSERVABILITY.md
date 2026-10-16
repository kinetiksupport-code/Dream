# Observabilidad de Dream

## Alcance y estado

Integración sobre `feature/exams-persistent`, en la rama independiente `feature/privacy-observability`. No cambia el backend, el diseño, OAuth, el motor educativo ni las correcciones. No se despliega automáticamente en producción.

SDK fijados: `posthog-js` 1.414.0, `@sentry/nextjs` y `@sentry/core` 11.6.0. La versión de PostHog seleccionada evita un fallo de publicación de su última dependencia (`@posthog/types@^1.415.2`, ETARGET observado). Next.js 15.5.27 usa Webpack.

Se inspeccionó el código y README del wizard oficial 2.81.1 antes de ejecutar `npx -y @posthog/wizard@latest --no-telemetry`. El wizard utiliza un gateway de IA externo que recibe archivos del repositorio; esa opción no queda desactivada por `--no-telemetry`. Se canceló antes de autorizar análisis de código o vincular una cuenta. El terminal mostró un requisito de tamaño y errores de red del propio instalador. La integración se completó manualmente usando el SDK oficial, sin transferir el repositorio privado al asistente.

Se descargó y leyó completamente `https://skills.sentry.dev/instrument`, sus instrucciones de instrumentación/primer error y la documentación oficial de Next.js. Se siguió la instalación manual oficial para errores, Edge, servidor y rendimiento; no se instrumenta aquí el proveedor de IA.

## Variables

Consultar `.env.example`. Configurar por entorno:

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`: token público de proyecto `phc_`, nunca token personal.
- `NEXT_PUBLIC_POSTHOG_HOST`: host del proyecto; Dream utiliza `https://us.i.posthog.com`.
- `NEXT_PUBLIC_SENTRY_DSN`: DSN público para navegador y fallback del servidor.
- `SENTRY_DSN`: DSN opcional separado para Node/Edge, exclusivamente en el servidor.
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`: organización, proyecto y token privado de compilación para subir source maps. Guardar el token en secretos de CI/Vercel; jamás `NEXT_PUBLIC`.

Las variables públicas se incorporan al bundle durante la compilación. Cambiarlas exige reconstruir. La clave PostHog recibida está solo en `.env.local`, ignorado por Git; no está en esta documentación ni en `.env.example`.

Sin DSN Sentry no inicia ni envía nada. Sin las tres variables de source maps, su generación/subida está desactivada. Con ellas se suben durante el build y se eliminan los mapas tras subir; revisar el resultado de CI. La telemetría del plugin de compilación está desactivada.

## Privacidad y consentimiento

Ajustes → Privacidad permite activar por separado analítica y diagnóstico del navegador. Ambos están apagados por defecto. La decisión se guarda únicamente en este dispositivo bajo `dream-privacy-v1`; no constituye memoria académica. DNT o Global Privacy Control desactivan ambas opciones, incluso si antes se aceptaron. Revocar detiene capturas, descarta la cola y cierra Sentry; cerrar sesión renueva el identificador anónimo de PostHog.

No hay Session Replay, autocapture, pageview automático, captura de clics, grabación de entradas, identificación de usuarios, emails, IDs Supabase, títulos de conversación, prompts, respuestas, nombres de archivo ni contenido educativo. PostHog usa un UUID aleatorio de navegador. Usuarios activos representan navegadores anónimos con consentimiento, no un censo de cuentas identificadas.

`before_send` de PostHog rechaza eventos fuera de la lista y reconstruye sus propiedades desde una lista permitida, descartando las propiedades automáticas del SDK. Solo conserva el UUID anónimo y el token público necesario para enrutar el proyecto, además de desactivar geolocalización. Los servicios receptores necesariamente reciben conexiones de red; configurar también sus políticas de retención/acceso y el acuerdo de tratamiento antes de producción.

Sentry desactiva datos de usuario, cookies, cabeceras/cuerpos HTTP, parámetros de URL, variables GraphQL, entradas/salidas de IA, datos de consultas, colas, variables locales y contexto de código. Sin breadcrumbs ni logs. No se añade `Sentry.setUser`. Los eventos se reconstruyen: mensaje genérico, categoría de error, posiciones de frames y rutas de código estático sin query. Los spans v11 se filtran en `beforeSendSpan` (la versión usa spans en streaming por defecto); El SDK usa el ciclo de trazas streaming; no se configura el hook legacy ignorado en v11. No hay propagación de cabeceras de trazas hacia Supabase (`tracePropagationTargets: []`).

Los errores/trazas esenciales del servidor y Edge, cuando el operador configura su DSN, se envían sin información personal independientemente del consentimiento opcional del navegador. Documentar esta operación y su base jurídica en la política de privacidad pública antes del despliegue. No se afirma cumplimiento legal automático.

## Eventos explícitos

| Evento | Momento | Datos permitidos |
| --- | --- | --- |
| `section_viewed` | Cambio real de ruta | sección agregada, sin IDs/query |
| `login_completed` | Sesión Supabase válida tras OAuth iniciado | sección login |
| `conversation_started` | `conversation_create` completado | acción/sección |
| `exam_created` | `exam_create` completado | acción/sección |
| `simulation_completed` | Sesión pasa a completed tras submit real | sección, modo |
| `api_request_completed` | API JSON/stream finalizado o fallido | acción, estado HTTP, duración, resultado |
| `feature_error` | HTTP, red o stream fallido | misma metadata técnica |
| `analytics_verification` | Verificación solicitada | sección |

Las únicas propiedades de producto admitidas son `section`, `action`, `mode`, `http_status`, `duration_ms`, `outcome`. Se validan valores enumerados y límites numéricos. No hay objeto `payload` ni excepción original en los eventos API. Un abort del usuario se mide como `aborted`, no como fallo. El streaming conserva sus deltas, Stop y errores reales. La duración de chat incluye lectura NDJSON, no solo los headers.

## Archivos y arquitectura

- `lib/observability/privacy.ts`: consentimiento y señales del navegador.
- `policy.ts`: lista permitida y agregación de rutas.
- `analytics.ts`: carga diferida de PostHog, cola limitada, consentimiento y eventos.
- `sentry-policy.ts`: eliminación de datos antes de la salida, compartida entre runtimes.
- `diagnostics.ts`: Sentry del navegador, captura y revocación.
- `instrumentation-client.ts`: único punto de entrada del navegador para ambos SDK.
- `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`: inicialización por runtime y `onRequestError`.
- `components/observability.tsx`: navegación y ajustes de privacidad.
- `app/error.tsx`, `app/global-error.tsx`: recuperación visible y captura respetando consentimiento.
- `lib/dream-api.ts`: instrumentación técnica central, sin duplicar fetch ni lógica de IA.
- `next.config.ts`: configuración oficial de Sentry y source maps.

## Cobertura de Supabase

Sentry Next.js observa navegador, servidor Next.js y Edge de Next.js. **No cubre el runtime Deno de las Edge Functions Supabase ni fallos internos de Groq/Tavily**. Dream captura desde el cliente estados HTTP (incluido 429), errores de red, duración y eventos de error NDJSON. El backend sigue usando sus logs actuales. Instrumentar Deno requiere una tarea y configuración independientes; no se añadió otro SDK/exportador al backend.

## Verificación

Ejecutar `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` y `npm run test:browser`. Los tests verifican listas permitidas con canarios de email/token/contenido, spans, rutas, consentimiento y la red del SDK real de PostHog usando transporte interceptado exclusivamente en tests. La prueba de PostHog representa un navegador humano; el filtro de bots del SDK se conserva en producción. Las pruebas de chat/exámenes usan fixtures de contrato; no certifican OAuth ni IA en producción.

Un evento real `analytics_verification` anónimo enviado al endpoint PostHog configurado obtuvo HTTP 200 y `{"status":"Ok"}`. Eso confirma aceptación HTTP, no la posterior indexación o visualización en el proyecto. Revisar el evento en PostHog cuando su complemento exponga herramientas.

El control de verificación de Ajustes existe solo en desarrollo (o en una compilación de prueba con `NEXT_PUBLIC_OBSERVABILITY_DEBUG=true`). Requiere consentimiento y configuración. El diagnóstico crea un error real controlado y hace flush del SDK; el ID mostrado no equivale por sí solo a confirmación de recepción. No activar ese flag en producción.

## Pendientes externos y alertas

La búsqueda oficial de complementos encontró PostHog instalado/enabled, pero no expone herramientas utilizables en esta sesión. No encontró un complemento Sentry. No se inventaron llamadas MCP, autorizaciones ni credenciales.

Faltan el DSN, organización/proyecto Sentry y autorización oficial para verificar un evento en el proyecto, subir source maps y crear alertas. Sin esos datos Sentry permanece desactivado. Solicitar acceso mediante el flujo del complemento, no pegar tokens privados en el chat.

Con acceso al proyecto, crear y verificar una alerta de issues: entorno production; primer error nuevo de nivel error/fatal, y otra de incremento de fallos HTTP 429/5xx mediante tags de acción. Asignar destinatarios explícitos del equipo en Sentry. No se ha creado ninguna regla ni enviado avisos a terceros. Los umbrales de rendimiento deben definirse con tráfico real, no datos inventados.

Revisar y aprobar la PR antes de cualquier despliegue de producción. No se han modificado variables remotas ni promovido Vercel.

### Resultado de QA de esta entrega

- `npm install`: dependencias fijadas y lockfile actualizado.
- TypeScript y ESLint: sin errores.
- `npm test`: 15/15 pruebas pasan, incluyendo el SDK real de Sentry con transporte local y canarios privados.
- `npm run build`: producción correcto; no se generaron mapas públicos sin credenciales de subida.
- Navegador: 10 comprobaciones de chat/tests/PWA y 4 comprobaciones de Exámenes/observabilidad pasan. La ejecución final enfocada de las cuatro últimas valida el build final, incluido HTTP 429 y revocación.
- Capturas: Playwright las genera en `test-results/` al ejecutar `npm run test:browser`.

Sentry en un proyecto remoto, upload de source maps y alertas quedan pendientes de credenciales/acceso; PostHog confirma aceptación HTTP pero no se pudo verificar indexación mediante su complemento. No se despliega producción.
