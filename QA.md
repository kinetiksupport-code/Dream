# QA de Dream

Fecha: 7 de octubre de 2026. Implementación visual Dream sobre la aplicación existente en `/workspace/dream`, utilizando las 45 exportaciones suministradas. El backend y la capa de protocolo se conservan.

## Comprobaciones técnicas

- `npm install`: completado con lockfile y versiones fijas.
- `npm run typecheck`: cero errores.
- `npm run lint`: cero errores y cero warnings.
- `npm run test`: 6 pruebas de protocolo, todas pasan.
- `npm run build`: compilación de producción completada sin errores.
- Playwright sobre el build de producción: **10/10 pruebas pasan** (50,8 s), incluido el barrido visual.

## Evidencia real del servicio

- Leído, sin modificar, el código desplegado de `dream-api`, versión 3.
- Su configuración declara `verify_jwt: true`.
- POST a `dream-api` sin sesión: **401**, `{"error":"Inicia sesión para continuar."}`.
- GET público a Supabase Auth settings: **200**, `external.google: false`, confirmado de nuevo el 7 de octubre al cerrar la implementación visual.
- No se crearon usuarios, tablas, migraciones, SQL, políticas, funciones, claves ni otro proyecto Supabase. No se realizaron mutaciones sobre datos reales.

## Pruebas de protocolo

UTF-8 dividido byte a byte, CRLF, línea final sin newline, delta conservado ante corte, error de servidor, NDJSON malformado, AbortController, widgets malformados/parciales y matemáticas fuera de bloques de código.

## QA de interfaz con contrato aislado

Las fixtures viven únicamente en `tests/browser`. Las acciones de la aplicación siguen usando `dream-api`; los tests interceptan peticiones dentro del navegador de pruebas. No certifican una generación real de IA.

- Redirección de rutas sin sesión a Google login, sin formularios de contraseña.
- Perfil y cabeceras Authorization/apikey.
- Conversación creada al enviar, respuesta renderizada por el parser real.
- Historial, Markdown, tablas, código y KaTeX.
- Subida mediante selector y estados de adjunto.
- Test generado y widget seguro; comentarios internos ocultos.
- Preferencias persistidas por API y tema oscuro.
- Navegación móvil y progreso sin cifras inventadas.
- Práctica: corrección de servidor y resultado.
- Examen: ocho tipos de pregunta, entrega completa y ausencia de corrección previa.
- Renombrado de conversación y diálogo de eliminación con Escape.
- Manifest e iconos PWA servidos correctamente.
- Detener: conservar el texto y una sola llamada, sin reinicio automático.
- Señal `DREAM_ACTION:TEST`: una sola generación y widget insertado.

## Segundo pase visual

Capturas y revisión de composición, spacing, tipos, superficies, contraste, hover/foco/selección y estados:

- Login de escritorio y móvil.
- Chat vacío y conversación corta.
- Conversación larga, scroll libre y botón para volver al final.
- Respuestas con código, tablas, matemáticas y enlaces de fuentes.
- Tests practice/exam, matching y composición de resultados en móvil.
- Progreso y ajustes, incluidos switches y claro/oscuro.
- Barrido en ambos temas: 375×812, 390×844, 393×852, 430×932, 768×1024, 834×1112, 1280×800, 1440×900 y 1728×1117.
- Viewport reducido a 390×430: el composer permanece completamente visible.

Las capturas temporales se generan en `test-results` y no forman parte del producto. Son capturas de interfaz con fixtures, no evidencia de respuestas de Groq reales. La reducción de viewport aproxima el espacio disponible; no sustituye una prueba de teclado físico iOS/Android.

## Pendiente de una sesión real

Google OAuth está desactivado en el backend. Activación y redirects están documentados en el README. Sin modificar la configuración del usuario ni usar una identidad artificial, no es posible certificar:

- Google login, persistencia y logout con una cuenta real.
- Qwen/Groq en streaming, parada y failover reales.
- Búsqueda actual mediante Tavily y sus fuentes.
- Procesamiento real de PNG/JPG/PDF/DOCX/PPTX/XLSX.
- Corrección real de respuestas abiertas y matemáticas.
- Preferencias y memoria real de una cuenta tras varios días.
- Instalación en un dominio HTTPS y dispositivos físicos.

## Límites comprobados del contrato

- No hay acción personal para listar conceptos, tests recientes o intentos anteriores. Progreso muestra una disponibilidad honesta.
- `messages` no devuelve metadatos de adjuntos históricos.
- No hay regeneración ni entrega de tests idempotente: no se reintentan mutaciones automáticamente.
- La lectura de resultados previos no está expuesta. El resultado de la entrega se muestra durante la visita; su persistencia real pertenece al backend.
- La subida y el procesamiento son una petición síncrona; no hay porcentajes ni fases fingidas.
- Composer sin control de voz ficticio; no existe transcripción disponible.

## QA específica del diseño suministrado

- Orb original verificado y empleado como único asset gráfico del diseño; no se renderizan capturas como páginas.
- Home con adjunto conserva topbar y wordmark, con estados reales en el composer.
- FileCard reutiliza el envío y el ID del archivo; CTA de análisis validado.
- Opciones de test: neutral, selected, correct e incorrect, con feedback del contrato servidor, check/X y acceso por radio/checkbox.
- Bottom sheet: apertura, Escape, clic exterior y restauración del foco.
- Estados thinking, searching, composing y error activados mediante eventos reales del parser sobre un stream controlado por el test, sin timers de simulación en producto.
- Subida fallida y reintento, tamaño/nombre/estado reales del File recibido por el componente.
- Fórmulas de práctica y respuesta matemática, jerarquía editorial y tema oscuro.
- Navegación Recientes, Progreso y Tests, manteniendo límites reales del servicio.
- Comparación de fuentes con backup previo: `lib/dream-api.ts`, `lib/supabase.ts`, `lib/streaming.ts`, `lib/widgets.ts`, `lib/attachments.ts`, `lib/types.ts` y `public/sw.js` idénticos. No cambió ningún contrato, endpoint ni lógica de procesamiento del backend.

Las adaptaciones están en [DESIGN_IMPLEMENTATION.md](DESIGN_IMPLEMENTATION.md). El backup anterior a esta fase se guarda en `/workspace/dream-visual-backup/before-figma.tar.gz`.

## UI Claude Design + PWA (15/10/2026)

- `typecheck`, `lint` (0 errores, 0 avisos), `test` (49/49) y `build`: en verde.
- Playwright sobre el build de producción: `dream.spec` 10/10, `exams.spec` 3/3, `security.spec` 4/4. `observability.spec` falla de forma intermitente (1 de 4 repeticiones): un lote de PostHog enviado *antes* de revocar el consentimiento llega después de vaciar `captures`. Es un problema de temporización del test, no hay eventos tras la revocación.
- La suite de capturas por anchos (375–1440 px), Lighthouse y los checks de PWA en preview quedan pendientes (ver PR).
- Para ejecutar en local: `.env.local` con las variables públicas y `PLAYWRIGHT_CHROMIUM_EXECUTABLE` si se usa un Chromium preinstalado.

## Limpieza (rama `chore/limpieza-dream`)

- `typecheck`, `lint` (0 avisos), `test` (50/50) y `build`: en verde.
- Playwright sobre el build de producción: 19/19, incluido el nuevo flujo de Ajustes (borrar historial con error y reintento, enlace de contacto para eliminar la cuenta).
- El `dream-api` desplegado (v22) es un stub; ver `LIMPIEZA.md` §3.
