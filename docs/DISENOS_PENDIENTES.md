# Diseños que necesitan el OK de Carlos

Fecha: 15/10/2026. Nada de esto está implementado. Cada apartado dice qué tablas, acciones y coste haría falta.

## 1. Lecciones de «texto inteligente» (Parte B.4)

**Idea:** cada lección se genera una sola vez por tema y se guarda para todos los alumnos. Así, el segundo alumno que la abre no gasta tokens.

- **Tabla nueva `public.dream_lessons`:**
  - `id uuid pk`
  - `topic_key text unique`: clave normalizada de asignatura, nivel y tema, por ejemplo `matematicas-ii|2bach|integrales-por-partes`.
  - `subject`, `level`, `title`.
  - `steps jsonb`: de 3 a 6 pasos. Cada paso tiene `{ title, body_markdown, why_it_matters, sources: [{title,url}], checks: [{statement, is_true, explanation}] }`.
  - `quiz jsonb`: test breve final, de 3 a 5 preguntas.
  - `model`, `created_at`, `status` (`ready` / `generating` / `failed`).
- **Progreso por alumno, tabla `public.dream_lesson_progress`:**
  - `(lesson_id, student_id) pk`, `step`, `completed_at`, `quiz_score`.
  - FK a `auth.users` con `on delete cascade`.
- **RLS:**
  - `dream_lessons`: lectura para `authenticated`, sin escritura desde el cliente (solo `dream-api` con `service_role`).
  - `dream_lesson_progress`: cada alumno solo lee lo suyo. Las escrituras pasan por `dream-api`, como el resto.
- **Acciones nuevas en `dream-api`:**
  - `lesson_get { subject, level, topic }`: si existe y está `ready`, la devuelve sin IA. Si no, la genera una vez, con un candado por `topic_key` (`insert … on conflict do nothing` y estado `generating`) para que dos alumnos no la generen a la vez.
  - `lesson_progress_save { lesson_id, step, quiz_answers? }`: la corrección del test va en el servidor, como en los tests actuales.
- **Contenido:** nunca ejercicios resueltos, solo explicación, pistas y preguntas. Las fuentes salen de Tavily (1 búsqueda por lección) y se citan.
  - Ojo: es contenido compartido entre alumnos. No puede incluir nada de los apuntes privados de un alumno; se genera solo a partir del nombre del tema.
- **Coste:** una generación cuesta unos 5.000 tokens de entrada y 3.000 de salida, más 1 búsqueda. Solo se paga la primera vez por tema.
- **Privacidad:** hay que añadir «lecciones guardadas» a la política (el propio documento lo apunta).
- **Pregunta:** ¿quién revisa las lecciones antes de que las vean todos? Propuesta: un estado `review`, para que puedas revisar las primeras.

## 2. Subida con QR desde el móvil (Parte B.5)

No encuentro en el repo el prompt `prompt-claude-code-dream-espana.md` que lo define. Este es el diseño mínimo:

- **Tabla nueva `public.dream_upload_sessions`:**
  - `id uuid pk`, `owner_id`, `conversation_id` (o `exam_id`), `token_hash text`, `expires_at` (10 minutos), `used_count`.
  - RLS: el dueño solo puede leer las suyas.
- **Acciones nuevas:**
  - `upload_session_create { conversation_id }`: devuelve un enlace `https://www.edudream.es/subir/<token>`. El token es aleatorio y de 32 bytes, se guarda solo su hash y es de un solo uso por archivo, con un máximo de 4.
  - `upload_session_add { token, file }`: es la única acción sin sesión de Google. El token autoriza. Reutiliza la misma extracción y los mismos límites que `attachment_upload`, y cuenta para la admisión del dueño.
- **En directo:** el ordenador escucha con Supabase Realtime (canal privado con RLS) las filas nuevas de `dream_attachments` de esa conversación, o pregunta cada 3 s mientras el QR está abierto.
- **Interfaz:** botón «Desde este dispositivo» o «Desde el móvil». Este último muestra el QR, que se genera en el navegador, sin servicios externos.
- **Riesgo:** cualquiera con el enlace puede subir archivos durante 10 minutos. Por eso caduca, tiene pocos usos y no deja leer nada.

## 3. Pizarra (Parte C)

Investigado: `qwen/qwen3.8-27b` en Groq **sí acepta imágenes**, hasta 3 por petición. Cada imagen cuenta como 2.048 tokens de entrada.

- Es viable con lo que ya hay:
  1. Un lienzo (lápiz, goma, deshacer, rehacer, finalizar) exporta un PNG de 1024 px como máximo, con fondo blanco.
  2. El PNG se envía por el flujo de adjuntos actual, que ya lee imágenes con Groq.
- **Requisito:** poner `DREAM_VISION_INPUT_TOKEN_CEILING=2048` en los secretos de Supabase. Sin él, cualquier imagen da error.
- **Riesgo:** el modelo está en «Preview» en Groq. Además, con el plan gratis (8.000 tokens/minuto) una imagen ocupa un cuarto del minuto de todos.

## 4. Voz (Parte C)

Investigado (caniuse, MDN y WebKit):

- **Funciona** en Chrome (escritorio y Android), Samsung Internet y Safari (macOS e iOS, en el navegador) con `webkitSpeechRecognition` y `lang = 'es-ES'`.
- **No funciona:**
  - Firefox (desactivado).
  - Edge y Opera: el objeto existe pero no llegan eventos.
  - **La app instalada en la pantalla de inicio de iPhone (PWA):** Apple no lo permite.
- **Plan:**
  1. Pulsar para hablar, con `continuous = false`.
  2. Antes de pedir el micrófono, el texto «El audio lo procesa tu navegador. Dream solo recibe el texto».
  3. Ocultar el botón si no hay API, y desactivarlo en la PWA de iOS.
  4. Si no arranca en 3 s, desactivarlo en esa sesión con «Dictado no disponible en este navegador».
- Chrome envía el audio a Google y Safari a Apple. Eso ya lo dice el apartado «Voz y micrófono» de los términos.
- **Alternativa de pago** (no se hace sin tu OK): grabar y transcribir con Groq Whisper. Cuesta 0,04 $ por hora de audio, y entonces el audio sí pasaría por Dream.

## 5. Orbes y animación de voz (Parte E)

- `thinking-orbs` 0.3.2 (MIT, sin WebGL, 2D canvas):
  - Estados: `working`, `searching`, `solving`, `listening`, `connecting`, `weaving`, `composing`, `breathing` y `shaping`.
  - Tamaños 20 o 64. Tema `auto`/`light`/`dark`.
  - Respeta «reducir movimiento» y se pausa fuera de pantalla.
- `voice-glow` 0.3.0 (MIT): `VoiceBeam` con `stream` o `level`, más `useMicrophone`. Su versión más reciente tiene 10 días. Propongo fijar la 0.2.1, que tiene más de dos semanas, salvo que haga falta algo de la 0.3.
- Comando propuesto (**no ejecutado**): `npm install --save-exact thinking-orbs@0.3.2 voice-glow@0.2.1`
- **Decisión pendiente:** hoy Dream usa su propio Orb de marca en SVG. Propuesta:
  - Mantener el Orb de marca como avatar.
  - Usar `ThinkingOrb` de 20 px solo en la línea de estado del chat, para las esperas de 2 s o más: pensando (`working`), buscando (`searching`), escribiendo (`composing`), esperando turno (`breathing`) y reintentando (`connecting`).
  - Nunca los dos en el mismo sitio.
