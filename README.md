# Dream

La ampliación de **Exámenes** usa persistencia real por usuario y `dream-api` v5. Sus rutas, migraciones, seguridad, recuperación y límites de verificación están documentados en [EXAMS_IMPLEMENTATION.md](EXAMS_IMPLEMENTATION.md). Las secciones siguientes describen también los contratos originales v3 que esta ampliación conserva.


Aplicación Dream existente, actualizada visualmente con las exportaciones aprobadas de Figma. Next.js 15, React 19, TypeScript strict, Tailwind CSS 4, Inter, Supabase JS, Markdown seguro y KaTeX. Se mantiene la lógica de autenticación, API, conversaciones, streaming, adjuntos y tests. No contiene otro backend ni accede a tablas directamente.

La implementación visual y sus adaptaciones están detalladas en [DESIGN_IMPLEMENTATION.md](DESIGN_IMPLEMENTATION.md).

## Ejecutar

```bash
npm install
cp .env.example .env.local
# Completar las tres variables públicas
npm run dev
```

Disponible en `http://localhost:3000`. Para producción:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm start
```

`npm run test:browser` requiere la aplicación en el puerto 3000 y Chromium (`npx playwright install chromium`). El lockfile fija las versiones. Node 22 o superior recomendado.

## Variables

Solo se necesitan:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://cxaujyagtpsxvkwkdxbc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key del proyecto Dream AI>
NEXT_PUBLIC_DREAM_API_URL=https://cxaujyagtpsxvkwkdxbc.supabase.co/functions/v1/dream-api
```

La clave publishable es pública por diseño. Nunca añadir claves de Groq, Tavily, service role ni secretos de Google a esta aplicación. No existe proxy de IA en Next.js; todo pasa por la Edge Function existente.

## Autenticación

`lib/supabase.ts` crea un único cliente Supabase con sesión persistente, renovación automática y PKCE. Los tokens los administra el SDK; la aplicación no mantiene un almacén alternativo. `onAuthStateChange` mantiene el estado de sesión. Los errores 401 limpian la sesión local y vuelven a `/login`.

`/login` solo permite Google. Usa `signInWithOAuth({ provider: 'google', options: { redirectTo: '<origin>/auth/callback' } })`. Antes de redirigir se comprueba la configuración pública de Auth: si Google está desactivado, se muestra un error en la misma pantalla en lugar de llevar al usuario a una página técnica. El callback permite que el SDK intercambie el código PKCE, comprueba la sesión y abre `/chat`. El arranque obtiene `profile` antes de abrir la aplicación interna. Los campos internos de compatibilidad se descartan al normalizar el perfil; no se usan para navegación, autorización ni onboarding.

### Bloqueo comprobado de nuevo el 7 de octubre de 2026

La consulta real a `/auth/v1/settings` devuelve `external.google: false`. Por tanto, el flujo Google todavía no puede completarse en el proyecto. No se cambió configuración del backend.

Para habilitar el acceso, el propietario debe configurar Google en **Supabase → Authentication → Sign In / Providers**:

1. Habilitar Google con las credenciales OAuth del propietario, guardadas en Supabase, nunca en el frontend.
2. En Google Cloud, autorizar el retorno de Supabase: `https://cxaujyagtpsxvkwkdxbc.supabase.co/auth/v1/callback`.
3. En Supabase URL Configuration, autorizar `http://localhost:3000/auth/callback` para desarrollo y `https://<dominio-final>/auth/callback` para producción. Configurar Site URL con el dominio final.

No se creó un usuario artificial, no se entró por email/password y no se modificó Auth, RLS, tablas, funciones o migraciones. El QA con una cuenta real está pendiente de esa configuración y del acceso del propietario. El código de frontend está preparado; esto no equivale a afirmar que la integración autenticada esté validada en producción.

## Rutas

| Ruta | Comportamiento |
| --- | --- |
| `/` | Resuelve sesión y redirige a `/chat` o `/login`. Puede sustituirse por el landing futuro sin cambiar la aplicación interna. |
| `/login` | Acceso minimalista con Google. |
| `/auth/callback` | Retorno OAuth PKCE. |
| `/chat` | Nuevo espacio local de conversación. |
| `/chat?c=<id>` | Conversación guardada. |
| `/tests/[id]` | Práctica o examen y resultado devuelto por el servidor. |
| `/progress` | Explica la memoria real y la disponibilidad pendiente del historial. |
| `/settings` | Preferencias del backend, tema, cuenta, logout y eliminación de conversaciones. |

No existen pantallas docentes, roles visibles, clases, invitaciones, administración, pagos ni colaboración multiusuario.

## Arquitectura

- `app/`: App Router. El layout y las rutas que no requieren estado son Server Components. El grupo `(dream)` comparte la protección de sesión y el shell.
- `components/providers.tsx`: sesión, perfil mínimo y apariencia.
- `components/shell.tsx`: navegación, conversaciones, renombrado y eliminación.
- `components/composer.tsx`: edición, auto-grow, adjuntos, envío y parada.
- `components/markdown.tsx`: Markdown, código copiable y matemáticas.
- `components/test-experience.tsx`: navegación, respuestas, corrección y resultados.
- `components/modal.tsx`: foco, Escape, tabulación contenida y restauración del foco.
- `lib/dream-api.ts`: única capa de comunicación con la Edge Function.
- `lib/streaming.ts`: parser NDJSON, independiente de React.
- `lib/widgets.ts`: comentarios y widgets del protocolo.
- `lib/attachments.ts`: validación local de tamaño/formato y lectura base64, sin extraer contenido.
- `lib/types.ts`: tipos de producto y protocolo, sin `any`.
- `app/globals.css`: tokens visuales, superficies claras/oscuras, composición, estados y responsive.
- `public/sw.js`: service worker con estrategia de privacidad explícita.

## API real

Cada petición de `callDream` o `streamDreamChat` incluye:

- `Authorization: Bearer <access_token de la sesión Supabase>`.
- `apikey: <publishable key>`.
- `Content-Type: application/json`.

La capa tiene una lista explícita de acciones permitidas: perfil, conversaciones, mensajes, adjuntos, chat, tests y preferencias. No expone las acciones antiguas ajenas a Dream. Los errores de la función se muestran sin reemplazarlos por resultados ficticios. No hay reintentos automáticos de mutaciones.

Los envoltorios siguen el contrato leído de `dream-api` versión 3: `{profile, service_ready}`, `{items}`, `{conversation}`, `{attachment}`, `{test}`, `{evaluation}` y `{result}`. El frontend no necesita un cliente privilegiado.

## Conversaciones y chat

Nueva conversación limpia el espacio local. La conversación persistente se crea solo al enviar o adjuntar. Una promesa compartida evita que varias subidas simultáneas creen varias conversaciones. El historial se obtiene mediante `messages`; solo se renderizan `user` y `assistant`.

El envío aparece inmediatamente y usa el flujo real `thinking → composing/searching → complete → idle`. La identidad Dream responde a estados reales. El botón detener llama a `AbortController.abort()`, conserva el texto recibido y deja el composer disponible; no lanza otra solicitud.

El usuario que sube en el historial conserva su posición; el seguimiento automático se activa solo cerca del final. Existe un botón para volver al final. Los mensajes anteriores se memorizan para limitar sus rerenders durante streaming.

El backend guarda el mensaje antes de iniciar la generación. Una petición cortada puede haber persistido parcialmente: por eso **Recuperar conversación** vuelve a leer el historial sin reenviar el prompt. No se proporciona una regeneración ciega que duplique mensajes. El backend actual no ofrece una acción de regeneración idempotente.

## Streaming NDJSON

El chat nunca usa `response.json()`. `TextDecoder` preserva UTF-8 dividido entre chunks. Se conservan líneas parciales y se procesa la línea final aunque no termine en newline. Se admiten CRLF, líneas vacías y eventos futuros desconocidos. JSON malformado, errores explícitos y fin sin `complete` producen un error visible conservando lo recibido.

Eventos implementados: `delta`, `activity`, `complete`, `error`. `searching` muestra actividad de búsqueda; los enlaces de fuentes se renderizan como enlaces externos seguros. El frontend no llama a Tavily ni Groq.

## Markdown y matemáticas

`react-markdown` no permite HTML de las respuestas (`skipHtml`), mantiene su transformación segura de URLs y React escapa el contenido. No se inyecta HTML generado por el modelo. KaTeX usa `trust: false`, con fallback para fórmulas inválidas.

Se admiten párrafos, encabezados, listas, tablas con scroll, citas, enlaces, código inline y bloques con lenguaje y copiar. Se normalizan `\\(…\\)` y `\\[…\\]` a delimitadores matemáticos, manteniendo intactos los bloques e inline code. También funcionan `$…$` y `$$…$$`. Los paréntesis ordinarios nunca se interpretan como matemáticas.

## Adjuntos

Hasta cuatro por mensaje. Los límites replican el contrato publicado: 8 MB para imagen/PDF/Office y 500 KB para texto/código. Extensiones soportadas: PNG/JPG/JPEG/WebP/GIF, PDF, DOCX/PPTX/XLSX, TXT/Markdown/CSV/JSON y las extensiones de código de la función.

Entrada mediante selector, drag & drop o pegado de archivos/imágenes. Las imágenes tienen preview local mediante object URL, liberada al quitar/enviar/salir. Estados: lectura (`uploading`), petición conjunta de subida/procesamiento (`processing`), `ready`, `error`. El endpoint es síncrono y no emite progreso de bytes ni separa la extracción: no se inventa porcentaje ni se fingen fases mediante timers.

`attachment_upload` recibe nombre, MIME y base64 y devuelve un ID; el chat recibe esos IDs. Toda extracción de PDF/Office/OCR/análisis visual ocurre en el servidor. Los errores de formato, tamaño, documento dañado, PDF sin texto o análisis visual se muestran desde el backend. Quitar un chip cancela su petición local; no hay un endpoint publicado para eliminar un adjunto huérfano.

El endpoint `messages` actual no devuelve metadatos de adjuntos. Los nombres se muestran durante el envío local; no se inventan asociaciones de archivos al reabrir el historial.

## Tests

Las solicitudes explícitas de test/práctica/examen utilizan `test_generate` con contexto, conversación y adjuntos. Para este flujo se usa `persist_user_message: true`, soportado por la función existente, para conservar el turno una sola vez. Un test para imprimir continúa por el chat.

`<!--DREAM_ACTION:TEST-->` se oculta y, al terminar el streaming, genera un test sin volver a guardar el prompt. Los comentarios `<!--DREAM_WIDGET:{...}-->` se parsean de forma defensiva. Los widgets `quiz` enlazan al test persistente. JSON inválido o un comentario parcial no rompe el mensaje ni se muestra al usuario.

`test_get` carga solo las preguntas públicas. Se implementan:

- `multiple_choice`: radio.
- `multiple_select`: checkbox y array de respuestas.
- `true_false`: radio.
- `short_answer`: texto libre.
- `numeric`: entrada decimal, sin coerción que pierda el texto del usuario.
- `fill_blank`: texto corto.
- `matching`: relaciones usando `metadata.left` / `metadata.right`.
- `math`: razonamiento escrito y KaTeX en el enunciado.

Práctica llama a `test_check_answer` y muestra la evaluación del servidor. Examen no muestra claves ni evaluación individual antes de entregar. `test_submit` recibe `{question_id, answer}[]`; exige responder todas las preguntas. Resultado: nota derivada de score/total, porcentaje del servidor, explicación por pregunta y conceptos devueltos. Practicar errores genera otro test real usando los errores y conceptos del resultado.

La entrega guarda intento y memoria en el backend. El servicio actual no expone lectura de intentos anteriores ni un resultado por ID: la vista de resultado se conserva durante la sesión de esa pantalla, no se falsifica su recuperación después de recargar. Tampoco hay endpoint idempotente de entrega; no se reintenta automáticamente un submit ante un corte de red.

## Memoria y progreso

La memoria académica pertenece al backend. No existe memoria educativa en localStorage ni un perfil alternativo. `test_submit` registra conceptos y evidencia, y el chat recibe memoria por la lógica de servidor.

La función leída no ofrece una acción personal de listado de conceptos o tests recientes. `/progress` presenta un estado honesto sin métricas ni gráficos inventados. Para convertirlo en un historial consultable haría falta un contrato público de lectura futura; **no se ha implementado ni modificado el backend para crearlo**.

## Preferencias y apariencia

`pref_step_by_step`, `pref_practice_suggestions` y `pref_calm_tone` se guardan por `preferences_update`; la interfaz solo confirma una preferencia después del éxito. El tema claro/oscuro/sistema es la única preferencia local de producto, con detección del sistema y aplicación temprana para evitar parpadeo. Supabase mantiene su propio almacenamiento de sesión.

## PWA y móvil

Manifest standalone, iconos PNG provisionales de 192/512, icono maskable, apple-touch-icon, SVG y service worker. El símbolo es temporal, no una propuesta de logo definitivo.

El SW cachea únicamente la página offline y los iconos. Las peticiones autenticadas, conversaciones, archivos, resultados y páginas con información personal **no se guardan en Cache Storage**. Navegaciones usan red con fallback informativo offline. Chat e IA requieren conexión. El deploy final debe usar HTTPS, salvo localhost.

Se utilizan `100dvh`, VisualViewport y safe areas. La altura del shell responde al teclado; el composer permanece en el flujo inferior del chat. Se respeta reduced motion, foco visible, navegación por teclado, objetivos táctiles y entradas semánticas. El teclado y la instalación real en Safari/iOS y Android requieren QA en dispositivos; la emulación de Chromium no demuestra esos comportamientos físicos.

La lógica de voz no está disponible; el composer respeta los controles de la referencia sin añadir una transcripción ficticia.

## Validación y límites de QA

Consultar [QA.md](QA.md). Las pruebas unitarias cubren los puntos donde un fallo podría perder texto o interpretar mal el protocolo. Playwright valida flujos y estados usando **fixtures aisladas en `tests/browser`**; ninguna ruta de aplicación, build de producción ni SW utiliza esas respuestas. Esas pruebas no constituyen verificación de IA autenticada en vivo.

Lecturas reales efectuadas: contrato de `dream-api`, configuración pública de Auth y rechazo 401 de peticiones sin sesión. Pendiente, por Google desactivado: login real, persistencia/logout con cuenta Google, generación Groq, búsqueda Tavily, procesamiento real de PDF/Office/imágenes y memoria tras volver días después.

No se ha desplegado a un servicio externo. El proyecto se puede desplegar como Next.js estándar con estas mismas tres variables y el callback permitido en Supabase; no depende del proyecto Vercel anterior.
