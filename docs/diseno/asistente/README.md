# Asistente de crear examen a pantalla completa (PR 3)

Encargo: `PROMPT_EXAMEN_ESTILO.md` de Carlos (17/10/2026), apartado 5 entero (sin modelos 3D ni recortar fotos) y 9. Va encima del PR 2 (#34), con #32 (subida por QR) y #31 (subidas seguras) unidos.

## Auditoría previa (apartado 0.2) de `components/exams/exam-wizard.tsx`

**Qué había (663 líneas):** un formulario de tres pasos dentro del Shell (con menú y barra):
1. Nombre, asignatura, fecha nativa, objetivo y minutos al día.
2. Temas (texto, uno por línea), dificultades y apuntes (hasta 4; 20 con #32).
3. Revisión y «Generar plan de estudio».

**Qué se conserva:** `getExam`, `updateExam`, `exam_create`, `exam_upload_start` → `attachment_upload` → `exam_material_add`, `exam_material_remove`, `validateFile`, `toBase64` y `fileAccept`. La redirección de `/exams/new?id=` de un examen terminado al detalle se mantiene.

**Qué sobra (§5.1):**
- Nombre, asignatura, temas, punto de partida y dificultades escritos a mano: ahora los pone la IA.
- El campo de materiales.
- Los minutos al día.

**Qué cambio:** el asistente entero. El archivo sigue en la misma ruta y los pasos están en `components/exams/wizard/`.

## El recorrido

| Paso | Pantalla | Detalle |
|---|---|---|
| 1 de 5 | **«Vamos a preparar tu examen»** | Orbe respirando, titular con la palabra «examen» subrayada a mano, «Sube tus apuntes y yo hago el resto» y «Empezar». Entrada escalonada (`.stagger`, 40 ms). |
| 2 de 5 | **«Primero, sube tus apuntes»** | **Escritorio** (`(min-width: 900px) and (pointer: fine)`): zona para soltar con estados de arrastre y «Añadir desde este dispositivo», y a la derecha el `<QrPanel>` de #32 («Esperando a tu móvil…» → «Móvil conectado»). Lo que sube el móvil aparece solo, por sondeo corto (#32). **Móvil:** «Hacer foto» (cámara trasera, varias seguidas: el botón pasa a «Hacer otra foto» y las fotos se numeran) y «Subir archivo». Cada fila pasa por «Subiendo…» (barra), «Procesando archivo…» (orbe pulsando) y un tick que se dibuja (`DrawnTick`). Se puede quitar o reintentar. Avisa de los **archivos repetidos** (mismo contenido por SHA-256, o mismo nombre y tamaño) con «No subirlo» o «Subirlo igualmente». Tope de 20 por examen (`MAX_EXAM_MATERIALS`). Lleva la línea «No subas datos de otras personas». |
| — | **«Estoy leyendo tus apuntes…»** | Orbe pulsando y una frase que cambia (1,4 s). `exam_analyze` cuenta el texto extraído. Si hay **pocos apuntes**, sale una hoja con el orbe: «Veo que son pocos apuntes. ¿Tienes alguno más?…», con «Continuar con estos» y «Subir más archivos». Si elige continuar, se guarda (`few_notes_ack`) y no se vuelve a preguntar en ese examen. |
| 3 de 5 | **«¿Cuándo es tu examen?»** | Calendario propio: semanas de lunes a domingo, días pasados desactivados y hoy marcado. Se maneja con flechas, Re Pág, Av Pág, Inicio, Fin, Intro o espacio, con foco itinerante y cada día leído entero («lunes, 2 de noviembre de 2026»). Debajo, «Faltan 12 días» con el número que rueda. Errores en palabras. |
| 4 de 5 | **«¿Qué nota quieres sacar?»** | **La ruedecita**, de 10 arriba a 0 abajo en saltos de 0,5, empezando en 8:<br>• Rodillo con `scroll-snap`. Cada fotograma escala y aclara los vecinos según su distancia (solo `transform` y `opacity`).<br>• Al asentarse, un pequeño rebote con `--ease-spring`, y `navigator.vibrate(8)` donde exista.<br>• El número grande rueda con `AnimatedNumber`.<br>• Accesible como `slider`: «8,5 sobre 10», flechas ±0,5, Re Pág y Av Pág ±1, Inicio y Fin.<br>• El fondo es **cálido y se intensifica con la nota**: una capa naranja sobre amarillo con opacidad = nota/10. |
| 5 de 5 | **«Tu examen»** | Primero «Preparando tu examen…» con el orbe. Luego aparece **la asignatura en grande** con su **objeto 3D**, que entra con un rebote. Debajo:<br>• El nombre, con «Cambiar» para editarlo ahí mismo.<br>• Los **temas como etiquetas**, que se quitan con la cruz o se añaden.<br>• «No es esta asignatura», que abre una hoja con la lista.<br>Si la IA falla o se agota el uso, sale un mensaje amable, «Volver a intentarlo» y el nombre y la asignatura a mano. «Crear mi ruta» guarda los datos y llama a `exam_prepare`. |
| ✓ | **«Tu examen está listo»** (amarillo) | El orbe salta y el objeto rebota, con seis chispas que salen una vez (360 ms, sin confeti). Debajo, los tres primeros pasos de la ruta, «y N pasos más» y **«Empezar»**: va a la ruta si la IA la ha hecho y, si no, a la primera unidad. |

**El marco:**
- `/exams/new` es pantalla completa: `isFocusRoute` y el Shell no pintan la barra lateral ni la de pestañas. No hay otro Shell.
- Arriba están la flecha para salir, la barra de progreso fina (`scaleX`) y «2 de 5».
- Un solo botón principal abajo: un botón 3D que se queda pegado abajo, con un degradado del color de fondo para que no tape la lista. Respeta las safe areas.
- Al cambiar de paso, el foco va al título y una región viva lee «Paso 3 de 5: Fecha».
- Los pasos entran con `page-enter-forward` y `page-enter-back`, el mismo sistema que las páginas del PR 1 (`.wizard-step[data-enter]`, `globals.css` › «Asistente: pasos»). Con movimiento reducido, solo un fundido.

**Colores (decisión de Carlos del 17/10):**
- Azul eléctrico en todos los pasos.
- Cálido creciente en la nota.
- Amarillo en «listo».
- Los fondos son capas fijas que solo cambian de opacidad.
- El texto pasa a tinta oscura sobre amarillo y naranja: 12,15:1 y 5,79:1.

## Casos raros (§10), comprobados en `tests/browser/asistente.spec.ts`

| Caso | Qué pasa |
|---|---|
| **Refrescar** en cada paso | El paso va en la URL (`?id=…&paso=fecha`) y el borrador guarda `wizard_step`. Al recargar se vuelve al mismo paso con lo elegido. Si la URL pide un paso más allá de lo que hay guardado (por ejemplo, la IA sin fecha), se queda en el último paso posible. |
| **Atrás del navegador** a mitad | Vuelve al paso anterior, entrando desde la izquierda, con la fecha y la nota conservadas. El QR se cierra al salir del paso. |
| **Doble clic** | Cada acción tiene un cerrojo. El botón queda `aria-busy` y desactivado, y solo sale una llamada (comprobado con `exam_draft_update`). |
| **Sin conexión** | Aviso «Sin conexión. Lo que ya has hecho está guardado; sigue cuando vuelva.» y los botones de avanzar y subir quedan desactivados. |
| `/exams/new?id=` de un examen **listo o hecho** | Redirige a su detalle, como antes. «Preparando» también. |
| **Salir** | Con apuntes, la hoja «¿Salir? Tu examen se guarda como borrador», con «Salir» y «Seguir con mi examen». Si sales del paso 2 sin haber subido nada, el borrador vacío se borra sin preguntar. |
| **Retomar** desde el historial | El borrador (pegatina «Sin terminar» en el PR 2) abre el asistente donde iba, con «Continúa con tu examen de Matemáticas». |

## Backend (necesita el OK de Carlos: nada aplicado ni desplegado)

**Migración `supabase/migrations/20261018170000_exam_wizard.sql`** (va después de las dos de #32):
- Un borrador puede no tener aún nombre, asignatura ni fecha. Fuera de `draft`, las restricciones los siguen exigiendo (`dream_exams_title_check`, `dream_exams_subject_check` y `dream_exams_date_when_planned`).
- Columnas nuevas:
  - `target_grade numeric(3,1)`: de 0 a 10 en saltos de 0,5.
  - `wizard_step`: `upload`, `date`, `grade` o `identify`.
  - `few_notes_ack boolean`.
  - Antes he revisado `ExamFields` y la tabla. `goal` es texto libre: la nota se guarda también ahí («Sacar un 8,5 sobre 10.») para que la IA de la ruta la vea sin tocar sus prompts.
- `dream_admit` admite `exam_identify`.
- **Arreglo encontrado:** `exam_route_regenerate` estaba en `consumingActions` de dream-api pero no en la lista de `dream_admit`, así que la admisión lo rechazaba (`invalid_admission` → 503). Ahora está, y una prueba comprueba que toda acción que consume aparece en la última definición de `dream_admit`.
- Probada en un PostgreSQL 16 local de usar y tirar, con las migraciones reales de exámenes y admisión: `DREAM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<puerto>/postgres node scripts/security/exam-wizard-integration.mjs` → «exam wizard migration: ok».

**`dream-api` (`exams.ts`, `validation.ts`, `exam-identify.mjs` nuevo, `admission.mjs`):**

| Acción | Qué hace | IA |
|---|---|---|
| `exam_create { exam_id, wizard: true }` | Crea un borrador vacío: sin nombre ni fecha, `wizard_step: upload` y **`daily_minutes: 45`** (ya no se pregunta, §9.2). Sin `wizard`, todo sigue igual. | No |
| `exam_draft_update { exam_id, …parcial }` (nueva) | Solo los campos que llegan: fecha (no pasada), `target_grade`, `wizard_step`, `few_notes_ack`, nombre, asignatura y temas. Solo en `draft` o `failed`. | No |
| `exam_analyze { exam_id }` (nueva) | `{ analysis: { files, chars } }`: caracteres del texto extraído y saneado. El umbral vive en el cliente. | No |
| `exam_identify { exam_id }` (nueva) | Nombre, asignatura y temas a partir de los apuntes. Detalle en la lista de abajo. | Sí |
| `exam_prepare` | Ahora exige nombre, asignatura y fecha. Admite «sin temas» si hay apuntes (entrada a mano). | Sí (como antes) |
| `exam_get` y `exams` | `exam_date` llega como `''` mientras no hay fecha. | — |

`exam_identify` en detalle:
- Pasa por la admisión y la cola de siempre (`consumingActions` y `dream_admit`) en **modo Normal** (`groqJson` con `groqModel()`, temperatura 0,25 y `json_object`).
- La IA **solo** recibe los apuntes, delimitados con `wrapStudentMaterial` y `MATERIAL_GUARD` de #31, hasta 12.000 caracteres. **Nunca** recibe el correo ni el nombre del alumno.
- El JSON se valida en el servidor (`validateIdentity`):
  - Nombre de 3 a 80 caracteres, con letras y puntuación normal; sin `< > { } \` ni caracteres de control.
  - Asignatura de la lista cerrada, o «Otra».
  - De 0 a 8 temas de 2 a 60 caracteres, sin repetir.
- Reintenta una vez. Si sigue mal: 422 «No he podido reconocer tu examen. Escribe tú el nombre y la asignatura.». Los límites de uso llegan como 429.
- Guarda el resultado en el borrador: al recargar no se vuelve a pedir.

**Lista de asignaturas:** la misma en el servidor (`exam-identify.mjs`) y en el cliente (`lib/subject-objects.ts`). Una prueba comprueba que coinciden.

## Pocos apuntes: el umbral (§5.4)

Está en un solo sitio, `lib/exam-wizard.ts` › `FEW_NOTES`: **menos de 3.000 caracteres de texto extraído** en total.
- 3.000 caracteres son unas 1,7 páginas normalizadas (1.800 caracteres por página: 30 líneas de 60, la medida editorial española). Es decir, menos de 2 páginas: una hoja manuscrita por las dos caras o el resumen de un solo apartado.
- Por debajo de eso, la IA no tiene material para más de dos o tres unidades y se inventaría el resto.
- Empiezo por debajo de las 2 páginas (3.600) para no molestar con apuntes cortos pero suficientes.
- Las fotos cuentan por el texto que se saca de ellas.

## Decisiones técnicas

- **El paso en la URL** y no solo en memoria: así el botón Atrás, recargar y retomar funcionan sin código aparte. Como `routeKey` (PR 1) ignora `paso`, cambiar de paso no remonta el Shell.
- **QR:** el `<QrPanel>` de #32 se carga con `next/dynamic` solo en escritorio y en este paso. Al desmontarse (al pasar de paso o salir) cierra el código: comprobado que sale `upload_session_close`.
- **Tick dibujado solo con `transform`:** `design:check` (#33) prohíbe animar `stroke-dashoffset`, que usaba #32. `components/drawn-tick.tsx` abre una máscara con `scaleX`, y la página `/subir` de #32 lo usa también. Es el único cambio sobre el código de #32.
- **Sin dependencias nuevas.** No hay `three`: eso es el PR 6.
- **Fuera de esta tanda:**
  - Recortar y enderezar fotos.
  - Modelos 3D reales (PR 6).
  - La pantalla de la ruta: se usa la que ya existe (`/exams/[id]/ruta`) cuando la ruta con IA está activada.

## Tamaño (`next build`)

| Ruta | Antes (PR 2 + #31 + #32) | Después |
|---|---|---|
| `/exams/new` | 10,9 kB · **186 kB** primera carga | 23,8 kB · **182 kB** primera carga |
| QR (panel + generador), carga diferida solo en escritorio | — | 2 chunks: 5,6 + 5,2 kB (2,5 + 2,3 kB comprimidos) |
| Compartido | 108 kB | 108 kB |

La primera carga baja 4 kB, aunque la página tiene más código propio. El asistente anterior usaba componentes que ya no hacen falta (`AttachmentItem`, `Materials`), y el QR va aparte.

## Evidencia

- `antes/*.webp`: el formulario anterior, a 390 y 1280 px, en claro y oscuro.
- `despues/*.webp`, a 390 y 1280 px, en claro y oscuro:
  - Bienvenida, apuntes, subiendo, pocos apuntes, fecha, nota, tu examen, tu examen a mano, listo y salir.
  - Bienvenida, nota y listo, también con movimiento reducido.
- Grabaciones: `../grabaciones/asistente-movil.webm` y `asistente-escritorio.webm`, con el flujo completo (subir, aviso, calendario, ruedecita con rueda del ratón y teclado, revelado, crear ruta y listo).
- Guion: `tests/browser/asistente-capturas.spec.ts` (`CAPTURAS_DIR=…`, `GRABAR=…`).

**No se ha podido comprobar:**
- Un móvil real (cámara, vibración y gesto de la hoja).
- Un lector de pantalla real.
- La IA real de `exam_identify`, que no está desplegada: el flujo se ha probado con dream-api simulada y la acción con pruebas de Deno.
