# Auditoría de diseño de Dream

**Fecha:** 15/10/2026.

**Qué se auditó:** el código publicado en www.edudream.es (rama `chore/limpieza-dream`), con datos de ejemplo.

**Capturas:** `docs/diseno/antes/`. Hay 11 pantallas, cada una en móvil (390 px) y escritorio (1440 px), en claro y oscuro. Se generan con `CAPTURAS_DIR=<carpeta> npx playwright test tests/browser/capturas.spec.ts`.

**Referencia:** canvas de Claude Design «Dream – Sistema de diseño y pantallas»:
- 14 pantallas: Inicio, Chat, Tareas, Apuntes, Exámenes, Historial, Test y Ajustes en escritorio, y Inicio, Chat, Tareas, Más, Exámenes y Test en móvil.
- La carpeta `/mnt/project-files/dream/claude-design/` que cita el encargo **no existe en esta sesión**. He leído el canvas publicado, que es la misma fuente.

**Skills aplicadas:** `emil-design-eng`, `apple-design` y `libraries-dev`. Las reglas concretas están en `DISENO_EVIDENCIA.md`.
- `libraries-dev` no trae sus archivos de referencia en esta sesión. He leído las opciones de `thinking-orbs` y `voice-glow` en el README de npm. No hay skill `frontend-design` en la sesión.

## 1. Hallazgos que explican lo que vio Carlos

| # | Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|---|
| 1 | ✅ *Resuelto en cimientos.* **La tipografía Inter nunca se carga.**<br>- `--font-stack` está en `:root` y usa `var(--font-inter)`, pero esa variable solo existe en `<body>`. La variable queda vacía y el navegador usa su letra por defecto: Roboto en Android y Segoe en Windows.<br>- Es la «Roboto genérica» de la grabación. Comprobado: `getComputedStyle(body).fontFamily` = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto…`, sin ninguna fuente cargada. | apple-design `typography.md › Minimize the number of typefaces` y `branding.md › Consider using a custom font` | Clase de `next/font` en `<html>`, pila definida donde existe la variable y prueba que lo comprueba | Crítica |
| 2 | ✅ *Resuelto en cimientos.* **Modo oscuro plano.**<br>- Fondo `#0B0E16` casi negro.<br>- Solo hay dos capas (fondo y `--surface`), sin tarjeta ni tarjeta elevada. Las tarjetas usan el mismo color que el panel lateral.<br>- Profundidad nula: en oscuro las sombras no se ven. | apple-design `dark-mode.md › Mobile`: «two sets of background colors — base and elevated — to enhance the perception of depth» | Capas: fondo `#0E1117`, panel `#141821`, tarjeta `#1A1F2B`, elevada `#222838` y borde `rgba(255,255,255,.08)` (tabla §4) | Alta |
| 3 | 🟡 *En PR #18.* **Inicio sin jerarquía ni contexto:** un titular, la caja y tres botones. No hay saludo, ni tema del día, ni días para el examen. | apple-design `layout.md › Order content by relative importance` y `writing.md › Provide clear next steps` | Saludo con nombre, tema del día y días para el examen; accesos con icono; entrada escalonada | Alta |
| 4 | 🟡 *En PR #24 (estados con texto); orbes y borde de luz pendientes del OK para instalar.* **La espera de la IA es pobre.** Solo un Orb pequeño con «Pensando». No hay estados distintos para cola, reintento o error, ni un indicador fuerte en esperas largas. | apple-design `generative-ai.md › Consider giving specific, reassuring feedback during generation`; libraries-dev (orbes desde 2 s, borde de luz desde 3 s) | Estados reales (pensando, buscando, escribiendo, en cola, reintentando) con orbe y texto. El borde de luz va en la caja si pasan más de 3 s. **Necesita tu OK** para instalar paquetes | Alta |
| 5 | 🟡 *En PR #16.* **Historial lleno de «Nueva conversación».** El título no se genera con la primera pregunta, no hay deshacer al borrar y las acciones no aparecen al pasar el cursor. | apple-design `feedback.md`, `writing.md › Names come from what people control` | Título a partir de la primera pregunta (sin IA), toast «Conversación borrada · Deshacer», acciones al pasar el cursor y filtro suave | Alta |
| 6 | 🟡 *Barra con `scaleX` en cimientos; transición, cuenta de la nota y desglose en PR #17.* **Test: la barra de progreso anima `width`.** Solo deben animarse `transform` y `opacity`. No hay transición entre preguntas ni cuenta animada en el resultado. | emil-design-eng `Performance Rules › Only animate transform and opacity` | `transform: scaleX()`, deslizamiento corto entre preguntas, cuenta de la nota y desglose escalonado | Media |
| 7 | 🟡 *No se reproduce; vigilado por pruebas en cimientos y en PR #23.* **Selector de tema «Claro» con la página oscura.**<br>- **No se reproduce** con el código actual: con el sistema en oscuro, pulsar «Claro» pone `data-theme="light"` y fondo blanco, también tras recargar (`antes/ajustes-tema-claro-con-sistema-oscuro.webp`).<br>- Probablemente era la versión anterior que tenía en caché la app instalada: el service worker sirve los archivos estáticos de la versión vieja hasta que el usuario acepta la actualización. | apple-design `dark-mode.md › Ensure that your app looks good in both appearance modes` | Prueba de navegador que lo vigila; aviso de actualización más visible | Media |
| 8 | 🟡 *Diálogo y aviso en PR #23.* **Borrar historial y Eliminar cuenta «desactivados».** Con el `dream-api` antiguo (stub v22) fallaban. Desde la v24 funcionan, con confirmación. | apple-design `feedback.md › Show people when a command can't be carried out and help them understand why` | Ya resuelto en el PR #8. Falta: toast de confirmación y diálogo con transición | Baja |
| 9 | **«Explicamelo por pasos» sin tilde.** En el código actual ya pone «Explícamelo por pasos» (`components/message.tsx`). La falta venía de la versión anterior. | apple-design `writing.md` | Revisión de tildes: prueba que busca palabras sin tilde frecuentes | Baja |

## 2. Pantalla por pantalla

Las prioridades marcan el orden de trabajo. Con «Claude Design» se indica lo que manda el canvas.

### Navegación (barra lateral y barra inferior)
**Capturas:** todas, por ejemplo `antes/inicio-escritorio-oscuro.webp` y `antes/inicio-movil-claro.webp`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| El indicador activo salta, no se desliza | emil `Animation Decision Framework › Spatial consistency` | Indicador compartido que se desliza con `transform` (200 ms, ease-in-out) | Media |
| Los iconos no reaccionan al pulsar | emil `Buttons must feel responsive` | `scale(.97)` en `:active` (ya está en `.press`), con el icono incluido | Baja |
| El panel lateral oscuro (`#161A24`) apenas se separa del fondo | apple `dark-mode.md › base and elevated` | Panel `#141821` sobre fondo `#0E1117`, más un borde fino | Alta |
| Barra inferior en móvil: ya existe, como en Claude Design (Inicio, Chat, Tareas, Más). Las etiquetas miden 11 px | apple `tab-bars.md › Include tab labels`. El encargo pide un mínimo de 14 px, pero Claude Design usa 11 px y la HIG también lo permite | Se mantienen 11 px (manda Claude Design; diferencia anotada) | — |

### Inicio
**Capturas:** `antes/inicio-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| No hay saludo ni contexto (nombre, tema del día, días para el examen) | apple `layout.md › Order content by relative importance` | Línea de saludo: «Buenas tardes, Alex · Hoy toca Factorización · 12 días para tu examen» | Alta |
| Los tres botones no tienen icono y solo envían texto | apple `generative-ai.md › offer diverse, predefined example inputs`; Duolingo y Knowunity: acciones frecuentes como botones con contexto | Icono y ejemplo útil que rellena la caja; entrada escalonada de 40 ms | Alta |
| La caja no cambia al escribir: el botón de enviar se ve igual vacío que lleno | emil `State indication` | Botón desactivado → activo con transición de color y escala | Media |
| El foco de la caja no se nota | apple `accessibility.md › keyboard` | Anillo de foco en la caja (`:focus-within`) con fundido de opacidad | Media |

### Chat
**Capturas:** `antes/chat-*` y `antes/chat-esperando-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| Los mensajes aparecen de golpe | emil `Preventing jarring changes` | Entrada de 8 px con fundido (200 ms, ease-out); solo el mensaje nuevo, nunca el historial | Media |
| No hay cursor mientras llega el texto | Setproduct 2026 (encargo): cursor parpadeante | Cursor que desaparece al terminar; desactivado con movimiento reducido | Media |
| La tarjeta del test es poco visible | apple `branding.md`: el color en la acción principal | Tarjeta elevada con icono, «Empezar» y flecha que se desplaza al pasar el cursor | Alta |
| El aviso «Dream puede equivocarse» se queda fijo bajo la caja. Está bien, pero el texto del art. 50 va en el PR #12 | Setproduct: un aviso fijo y discreto | Se mantiene un solo aviso | — |
| La cabecera dice «Conversación» en vez del título | apple `writing.md` | Título de la conversación | Media |
| Copiar: ya cambia el icono, pero no dice «Copiado» | emil `State indication` | Texto «Copiado» con fundido y `aria-live` | Baja |

### Tareas
**Capturas:** `antes/tareas-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| En móvil, el título de la tarea se parte en tres líneas por el botón «Resolver con Dream» | apple `layout.md › Adapt gracefully` | Botón debajo en anchos compactos | Alta |
| Las filas no reaccionan al pasar el cursor | emil `Touch device hover states` | Hover con capa del 8 % | Baja |

### Apuntes
**Capturas:** `antes/apuntes-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| La tarjeta ocupa todo el ancho con un solo apunte y no tiene icono de tipo | Claude Design: rejilla `minmax(260px,1fr)` | Rejilla de Claude Design, icono por tipo y elevación al pasar el cursor | Media |
| No hay estado vacío con ilustración | apple `writing.md › Provide clear next steps on any blank screens` | Ilustración sencilla y botón «Subir apuntes» | Media |

### Exámenes y examen
**Capturas:** `antes/examenes-*` y `antes/examen-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| La barra de preparación anima `width` | emil `Only animate transform and opacity` | `scaleX` | Media |
| Las tarjetas de unidad no se elevan al pasar el cursor | emil | Elevación y flecha que se desplaza | Baja |
| Bien resuelto: la cuenta atrás en lima sobre azul (4,20:1 a 64 px, válido para texto grande) | apple `accessibility.md › contrast` | Se mantiene | — |

### Historial
**Capturas:** `antes/historial-*`.

Ver el hallazgo 5. Además:

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| Hay dos iconos por fila (› y ···) siempre visibles | apple `layout.md › progressive disclosure` | ··· solo al pasar el cursor o con foco (en móvil, siempre) | Media |
| La búsqueda filtra sin transición | emil | Fundido de los resultados en 120 ms | Baja |

### Ajustes
**Capturas:** `antes/ajustes-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| En móvil, la barra inferior tapa «Datos de uso» (hay contenido detrás) | apple `layout.md › safe areas` | Margen inferior igual a la altura de la barra | Alta |
| El selector de tema cambia de golpe | emil `Tabs with perfect color transitions` | Indicador que se desliza y cambio de colores con View Transition, sin parpadeo | Media |
| Falta la opción de lectura fácil (Lexend) | Encargo §8 | Interruptor «Texto fácil de leer»: Lexend con más interlineado | Media |
| Choque con la guía: apple `dark-mode.md › Avoid offering an app-specific appearance setting` | — | Claude Design y Carlos piden el selector: se mantiene, con «Sistema» por defecto. Diferencia anotada | — |
| Claude Design muestra «Estilo de ayuda: Respuesta directa», pero va contra la regla de producto | — | No se implementa (regla de producto) | — |

### Test y simulacro
**Capturas:** `antes/test-*`.

Ver el hallazgo 6. Además:

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| El acierto ya lleva icono y texto. El fallo debe llevarlos también, y ninguno tiene animación de feedback | apple `accessibility.md › Convey information with more than color alone`; emil | Icono, texto y entrada breve (180 ms); el fallo con una sacudida de 4 px que se quita con movimiento reducido | Media |
| El temporizador del simulacro no avisa al final | Encargo §2.7 | Aviso suave al quedar 5 minutos, con color, icono y `aria-live` | Media |
| No hay pantalla de resultado animada | Encargo §2.7 | Cuenta de la nota (600 ms, solo números) y desglose escalonado | Media |

### Login
**Capturas:** `antes/login-*`.

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| Correcto y sobrio. Falta reservar espacio para las casillas legales (PR #12, Parte D) | apple `onboarding.md › delay sign-in` | Hueco bajo el botón para las dos casillas | Baja |
| Pide la cuenta antes de probar | Duolingo: primero juega, luego regístrate | Propuesta para Carlos: una pregunta de prueba sin cuenta, respetando las casillas de la Parte D | Pregunta |

## 3. Global

| Problema | Skill y regla | Arreglo | Prioridad |
|---|---|---|---|
| No hay transición entre pantallas | emil `Spatial consistency` | Fundido de 160 ms al cambiar de ruta (`template.tsx`), sin mover el scroll | Media |
| Toasts sin acción de deshacer o reintentar | apple `feedback.md` | Toast con acción y `aria-live` | Media |
| Hay esqueletos en algunas listas, pero los estados vacíos no tienen ilustración | apple `loading.md › Show something as soon as possible` | Ilustración SVG por pantalla y botón claro | Media |
| `font-feature-settings: "tnum"` en todo el texto | Encargo §8 | Cifras tabulares solo en notas, temporizador, porcentajes y tablas (`.num`) | Baja |
| No hay comprobación automática de las normas | — | `npm run design:check` y `tests/browser/design.spec.ts` (§5) | Alta |

## 4. Tokens de color

**Medición:** `node scripts/design/contrast.mjs` (WCAG 2.x). En claro mandan los valores de Claude Design. En oscuro, Claude Design no tiene pantallas, así que aplico los valores de partida del encargo, todos medidos.

| Token | Claro | Oscuro | Contraste (oscuro) |
|---|---|---|---|
| `--bg` (fondo) | `#FFFFFF` | `#0E1117` | texto 15,96:1 · secundario 7,45:1 |
| `--surface` (panel) | `#F5F7FA` | `#141821` | texto 15,00:1 · secundario 7,00:1 |
| `--card` (tarjeta) | `#FFFFFF` + borde | `#1A1F2B` | texto 13,91:1 · secundario 6,50:1 · enlace 5,71:1 |
| `--elevated` (elevada) | `#FFFFFF` + sombra | `#222838` | texto 12,41:1 · secundario 5,80:1 |
| `--border` | `#E4E8EF` | `rgba(255,255,255,.08)` | decorativo |
| `--text` | `#080B14` | `#E8ECF4` | ver arriba |
| `--text-secondary` | `#5B6678` (5,81:1 sobre blanco) | `#9AA3B5` | ver arriba |
| `--primary` (botones) | `#155BFF` | `#155BFF` | blanco encima 5,29:1 |
| `--primary-ink` (enlaces) | `#155BFF` | `#6E93FF` | 6,55:1 sobre el fondo |
| `--accent` (lima) | `#C8F560` | `#C8F560` | solo progreso, aciertos destacados y detalles |
| `--success` | `#17692F` | `#6FD08C` | 9,97:1 sobre el fondo |
| `--danger` | `#B42318` | `#FF8F84` | 8,56:1 sobre el fondo |
| `--warning` | `#8A5A00` sobre `#FFF4DC` (5,43:1) | `#F5C451` sobre `#2B2410` (9,47:1) | nuevo |
| Capas de estado | `rgba(8,11,20,.05/.08/.12)` | `rgba(255,255,255,.08/.10/.12)` | hover, foco y pulsado |

## 5. Tipografía

- **Claude Design manda:** pila del sistema (SF Pro en Apple) con Inter en el resto, pesos 400, 500, 600 y 700, cuerpo de 17 px y titulares de 44 y 34 px con `-0.025em`. El fallo del hallazgo 1 hace que hoy no se cumpla.
- **Comparación de titulares que pide el encargo:** `docs/diseno/referencias/inicio-inter.webp`, `inicio-plus-jakarta.webp` e `inicio-bricolage.webp`.
  - **Plus Jakarta Sans:** más carácter, buena en tamaños grandes y conserva la legibilidad.
  - **Bricolage Grotesque:** más personalidad, pero la «¿» y la «Q» llaman demasiado la atención en un producto de estudio.
  - **Decisión: Inter**, porque Claude Design manda. **Propuesta para Carlos:** Plus Jakarta Sans en los titulares si actualiza Claude Design.
- **Lectura fácil:** Lexend en Ajustes, con interlineado de 1,7 y espaciado de +0,02 em.
- **Carga:** `next/font/google` (servida desde el propio dominio), subconjuntos `latin` y `latin-ext`, `display: swap`.

## 6. Apps de referencia

Capturas en `docs/diseno/referencias/`. Son solo las páginas públicas. Las apps con sesión (ChatGPT, Claude, Knowunity, Astra AI) no se pueden capturar desde aquí: ChatGPT y Claude muestran un control antibots y astra-ai.com no carga. Lo que sigue sale de la investigación del encargo y de lo visible:

| App | Qué se copia | Qué no |
|---|---|---|
| Linear (`linear.webp`) | Oscuro por capas, bordes finos semitransparentes, foco y estados muy claros | Densidad y jerga de producto |
| Vercel (`vercel.webp`) | Contraste alto y movimientos cortos | Negro puro |
| Knowunity (`knowunity.webp`) | Asignaturas con icono como accesos rápidos | Mayúsculas gigantes y mascota |
| Duolingo (`duolingo.webp`) | Feedback con personalidad, progreso visible y probar antes de registrarse | Rachas, ligas y duelos (prohibidos o pendientes de Carlos) |
| ChatGPT y Claude | Estados del mensaje, botón de parar siempre visible, «Ir al último mensaje» y aviso único | — |
| Astra AI | Atajos con contexto (ya en el PR #14) | — |

## 7. Lo que necesita decisión de Carlos

1. **Instalar paquetes:**
   - Comando: `npm install --save-exact thinking-orbs@0.3.2 border-beam@1.4.1`.
   - ¿Prefieres `ThinkingOrb` para los estados de la IA o el Orb SVG de marca? Propuesta: el Orb de marca como avatar y `ThinkingOrb` de 20 px en la línea de estado.
2. **Titulares:** ¿Inter, como en Claude Design, o Plus Jakarta Sans?
3. **Hook de parada:** avisaría si hay cambios de interfaz sin actualizar `DISENO_EVIDENCIA.md`. Es opcional.
4. **Racha de estudio diaria y «primero prueba, luego regístrate»:** ¿se hacen?

## 8. Estilo nuevo y transiciones (17/10/2026)

La auditoría de `app/globals.css` y `components/shell.tsx` está en `docs/diseno/estilo/README.md`. Incluye qué había, qué faltaba y qué cambia. Hallazgos nuevos:

- Los tokens oscuros están duplicados en dos bloques. Ahora una prueba comprueba que coinciden.
- Al volver con Atrás no se restauraba el scroll de `.workspace-main`. Ya está resuelto.
- El anillo de foco azul no se ve sobre los fondos saturados. Ahora usa el color del texto de cada fondo.

### Exámenes, historial (19/10/2026, PR 2)

- Resuelto: los exámenes con la fecha pasada salían primeros en «Próximos». Ahora van en «Anteriores».
- Resuelto: no se podía borrar ni marcar como hecho desde la lista. Ahora hay una hoja con las dos acciones y Deshacer.
- Resuelto: el estado era una frase gris; ahora es una pegatina con color y texto.
- Pendiente de Carlos: desplegar `exam_delete` (ver `docs/diseno/examenes-historial/README.md`).

### Asistente de crear examen (19/10/2026, PR 3)

- Resuelto: el formulario largo (nombre, asignatura, temas, dificultades, minutos) pasa a ser un asistente de una pregunta por pantalla; la IA pone nombre, asignatura y temas.
- Resuelto: `/exams/new` es pantalla completa, sin menú ni barra.
- Resuelto: la fecha usaba `input type=date` nativo; ahora es un calendario propio accesible.
- Encontrado y arreglado en la migración: `exam_route_regenerate` no estaba admitida por `dream_admit`.
- Pendiente: recortar y enderezar fotos; modelos 3D (PR 6).

## Rediseño «Dream design» (3-nov-2026): qué cambia por pantalla

| Pantalla | Cambio |
| --- | --- |
| Landing | Nueva composición: hero azul de marca con titular en mayúsculas y la Orb, tira de chips, carrusel de tarjetas de cristal, bandas de texto en perspectiva (único momento atrevido), cifras reales, QR + «Instalar Dream», FAQ en acordeón, pie verde lima con «Dream» gigante. Cabecera flotante con menú circular. |
| Login y bienvenida | Fondo oscuro, botón de Google en píldora blanca con relieve, panel de marca azul plano (sin cuadrícula). |
| App (shell) | Sidebar oscuro con «Crear» blanco (lleva a crear examen), ítem activo en píldora; barra inferior de cristal en móvil; modales de cristal sobre fondo desenfocado. |
| Inicio, Chat, Tareas, Apuntes, Exámenes, Historial | Tokens nuevos: superficies oscuras, burbuja del alumno en azul de marca, progreso en verde lima. |
| Ajustes | Sin selector de tema (solo oscuro); grupos en tarjetas oscuras; «Cerrar sesión» en rojo en su grupo. |
| Ruta, lección, test, simulacro | Mismo flujo; hoja verde/roja con icono y texto; colores de marca. |
| Legales, 404, mantenimiento, sin conexión, error | Oscuras con los mismos tokens y botón con relieve. |
| Blog (/blog) | Hereda los tokens de Dream. |
