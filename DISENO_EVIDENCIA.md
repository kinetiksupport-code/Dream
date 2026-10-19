# Evidencia de diseño

## Skills leídas el 15/10/2026 y la regla que aplico de cada una

- **`anthropic-skills:emil-design-eng`** (leída entera): solo animo `transform` y `opacity`, entre 120 y 250 ms. Uso `ease-out` fuerte (`cubic-bezier(0.23, 1, 0.32, 1)`) para lo que entra y nunca `ease-in` ni `scale(0)`. Todo lo pulsable se encoge a `scale(0.97)` en `:active`. Los popovers salen desde su botón, y las acciones de teclado frecuentes no se animan.
- **`anthropic-skills:apple-design`** (leída entera, con las referencias `accessibility`, `typography`, `color`, `dark-mode`, `layout`, `motion`, `loading`, `feedback`, `tab-bars`, `sidebars`, `generative-ai`, `writing`, `toggles`, `branding`, `designing-for-ios` y `cross-platform`): en oscuro, la profundidad sale de capas base y elevadas (`dark-mode.md › Mobile`). El contraste es de al menos 4,5:1 y la información nunca va solo por color (`accessibility.md`). Los controles miden 44 px. Durante la generación, el estado es concreto y tranquilizador (`generative-ai.md › Consider giving specific, reassuring feedback`).
- **`anthropic-skills:libraries-dev`** (leído el SKILL.md entero; sus archivos `references/` no existen en esta sesión, así que las opciones salen del README de npm de cada paquete):
  - Nada si la espera dura menos de 2 s.
  - Orbes de pensamiento a partir de 2 s.
  - Borde de luz en el elemento que trabaja si pasan 3 s.
  - Nunca dos efectos en el mismo elemento ni en elementos vecinos.
  - Antes de instalar, enseño el comando y espero el OK.
- **`frontend-design` o similares**: no están disponibles en esta sesión. Aplico el resumen de reglas del encargo.

## Estilo nuevo y transiciones (17/10/2026, `PROMPT_EXAMEN_ESTILO.md`, PR 1)

Skills releídas el 17/10/2026. Detalle completo en `docs/diseno/estilo/README.md`.

- **`emil-design-eng`:**
  - *Only animate transform and opacity*: las páginas, el número, el orbe, la hoja y el botón 3D solo usan `transform` y `opacity`. Nuevas pruebas sobre `@keyframes` y `element.animate()`.
  - *ease-out para lo que entra* (`--ease`): las páginas entran en 240 ms y salen en 160 ms; la salida es más rápida que la entrada (*Asymmetric enter/exit*).
  - *Never animate from scale(0)*: `.pop-in` parte de 0,9.
  - *Buttons must feel responsive*: `.press` (0,97) y la cara de `.button-3d`, que baja 3 px en `--dur-fast`.
  - *Momentum-based dismissal* (0,11 px/ms), *Damping at boundaries*, *Pointer capture* y *Multi-touch protection* en `components/bottom-sheet.tsx`.
  - *CSS variables are inheritable*: al arrastrar, `transform` va en el propio elemento.
  - *Stagger 30–80 ms* (`--stagger` 40 ms, máximo 8): `.stagger`.
  - *Springs only for playful bits*: `--ease-spring` solo en `.pop-in` (en el PR 3, también en la ruedecita).
  - *prefers-reduced-motion*: solo quedan fundidos de 120 ms.
- **`apple-design`:**
  - `motion.md › Let people cancel motion`: la navegación nunca espera a una animación. La View Transition espera como mucho 300 ms, y Atrás no espera nunca.
  - `motion.md › Make motion optional`: el número animado lleva su valor en texto para el lector de pantalla.
  - `color.md › Make sure all your app's colors work well in light, dark…`: los tonos pop tienen versión oscura; 66 pares AA en claro y oscuro.
  - `color.md › Avoid using similar colors in control labels if your app has a colorful background`: sobre los fondos pop, el foco usa el color del texto de ese fondo.
  - `accessibility.md`: el asa de la hoja mide 44 px; la hoja también se cierra con Escape y con sus botones (*sheets: a way out besides swipe*).
  - `branding.md`: la identidad va en el color, el tipo y los momentos; la navegación sigue siendo la de siempre.
- **`libraries-dev`:**
  - El orbe de pensamiento sigue siendo el `orb-pulsing` propio. No instalo `thinking-orbs` ni ningún otro paquete.
  - Las transiciones de página no llevan efectos: son esperas de menos de 2 s, y la regla es «nada si dura menos de 2 s».

## Pantalla Exámenes: historial (19/10/2026, PR 2 del encargo de exámenes)

Skills releídas. Detalle en `docs/diseno/examenes-historial/README.md`.

- **`emil-design-eng`:**
  - *Buttons must feel responsive*: tarjeta, «⋯» y «Crear examen» escalan a 0,97 al pulsar (120 ms); la cara del botón 3D baja.
  - *Should this animate at all?*: el objeto de la tarjeta no flota (pantalla que se ve a menudo); solo flotan los dos de la cabecera.
  - *Stagger 30–80 ms*: las tarjetas entran con `--stagger` (40 ms, máximo 8).
  - *Hover solo con puntero fino*: la tarjeta sube 2 px y gana sombra (opacidad de un pseudo-elemento, sin animar `box-shadow`).
  - *Asymmetric enter/exit* y *Sonner principles*: el aviso de Deshacer pausa su cuenta atrás con puntero, foco o pestaña oculta.
  - *prefers-reduced-motion*: sin desplazamientos, sin flotar ni viajar el objeto; las tarjetas solo funden.
- **`apple-design`:**
  - `accessibility.md › Convey information with more than color alone`: pegatinas de estado con texto; cuenta atrás con palabras e icono.
  - `action-sheets.md`: las acciones de la tarjeta van en una hoja; «Borrar examen» en rojo, con «Cancelar» en la confirmación (`alerts.md › include a Cancel button`).
  - `alerts.md › Avoid displaying alerts for common, undoable actions`: la confirmación va dentro de la hoja (no es una alerta más) y además hay Deshacer.
  - `writing.md › Provide clear next steps on any blank screens`: vacío con el orbe y «Crear examen».
  - `loading.md › Show something as soon as possible`: esqueleto con la forma real.
  - `progress-indicators.md`: barra determinada de unidades con su texto.
  - Áreas táctiles de 44 px comprobadas a 360, 390 y 1280 px.
- **`libraries-dev`:** nada que añadir: cargar la lista dura menos de 2 s, así que ni orbes ni haces de luz. No instalo paquetes.

## Asistente de crear examen (19/10/2026, PR 3 del encargo de exámenes)

Skills releídas. Detalle en `docs/diseno/asistente/README.md`.

- **`emil-design-eng`:**
  - *Only animate transform and opacity*: pasos (`page-enter-*`), barra de progreso (`scaleX`), ruedecita (escala y opacidad por fila, escritas en el propio elemento: *CSS variables are inheritable*), tick (máscara con `scaleX`), chispas y fondos (capas con opacidad).
  - *Springs for playful bits*: `--ease-spring` solo en el asentado de la ruedecita, el objeto que entra y las etiquetas (`.pop-in`).
  - *Buttons must feel responsive*: botón 3D y `.press` en todo lo pulsable; días del calendario a 0,94.
  - *Never animate keyboard-initiated actions* en exceso: con teclado la ruedecita salta con `scrollTo` suave, y es instantáneo con movimiento reducido.
  - *Stagger*: bienvenida (orbe, titular, frase) con `--stagger` 40 ms.
  - *Asymmetric enter/exit*: los pasos entran en 240 ms y la hoja sale con su gesto.
  - *Perceived performance*: «Estoy leyendo tus apuntes…» dura al menos 1,4 s para que no parpadee, nunca más que la llamada real.
- **`apple-design`:**
  - `pickers.md`: calendario propio con días completos en la etiqueta y teclado, y la ruedecita como `slider` con `aria-valuetext`.
  - `sheets.md › For complex or prolonged user flows, consider alternatives to sheets` (pantalla completa para tareas de varios pasos): por eso el asistente es una ruta a pantalla completa y no una hoja. `onboarding.md › design a brief, enjoyable experience`: una pregunta por pantalla con el progreso visible.
  - `sheets.md › Display only one sheet at a time` y `› Provide an alternative to the Done button`: una sola hoja cada vez y siempre con salida («Seguir con mi examen», «Cancelar»), además del gesto y de Escape.
  - `generative-ai.md › Keep people in control` (lo que pone la IA se puede corregir: nombre, temas y asignatura) y `› Ensure a great experience even when generative features aren’t available` (nombre y asignatura a mano si la IA falla o se agota).
  - `feedback.md › Consider integrating status feedback into your interface`: estados en la fila (subiendo, procesando, listo), sin alertas.
  - `accessibility.md`: foco al título del paso, región viva «Paso N de 5», 44 px, color y texto siempre juntos, contraste AA sobre azul, amarillo y naranja.
  - `privacy.md`: la cámara solo se abre al pulsar «Hacer foto», y la línea «No subas datos de otras personas».
- **`libraries-dev`:** esperas de más de 2 s (leer apuntes, IA, crear la ruta) → orbe de marca con `orb-pulsing`, en vez de `thinking-orbs`, que no se instala sin OK. Sin `border-beam`: un solo foco por pantalla.

## Ajustes con el estilo nuevo (19/10/2026, PR 8 del encargo de estilo)

Skills releídas. Detalle en `docs/diseno/estilo-ajustes/README.md`. Pantalla sobria, sin fondo saturado.

- **`emil-design-eng`:**
  - *Stagger 30–80 ms*: el titular y las secciones entran con `--stagger` (40 ms, máximo 8). Solo `transform` y `opacity`.
  - *Should this animate at all?*: Ajustes se abre de vez en cuando, así que una entrada corta vale. Los cambios frecuentes (interruptor y tema) siguen siendo inmediatos.
  - *Is it a hover/color change? → ease*: el icono del tema elegido solo funde su color.
  - *prefers-reduced-motion*: las secciones solo funden.
- **`apple-design`:**
  - `settings.md`: los ajustes siguen agrupados y sobrios, sin adornos que distraigan.
  - `accessibility.md › Convey information with more than color alone`: el color del icono acompaña a la etiqueta; la pegatina de la inicial es decorativa (`aria-hidden`).
  - `branding.md`: la identidad va en el titular y en un toque de color; los controles son los de siempre.
- **`libraries-dev`:** nada que añadir. No hay esperas largas y no se instalan paquetes.

## Criterio sobre «solo transform y opacity»

emil-design-eng permite cambios de color en hover («Is it a hover/color change? → ease»). Por eso `design:check` hace esto:
- Prohíbe animar el tamaño o la posición (`width`, `height`, `top`, `margin`…), `all`, `ease-in`, `scale(0)` y más de 400 ms.
- Permite fundidos de color (`background-color`, `color`, `border-color`), que no recalculan la página.
- Con `prefers-reduced-motion` solo quedan opacidad y color.

## Cómo se genera la evidencia

- **Capturas:** `CAPTURAS_DIR=<carpeta> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test tests/browser/capturas.spec.ts`. Cada pantalla se captura a 390 y 1440 px, en claro y oscuro. Se guardan en WebP en `docs/diseno/antes/` y `docs/diseno/despues/`.
- **Grabaciones:** vídeo de Playwright (`video: "on"`) de las microinteracciones de cada PR, guardado en `docs/diseno/grabaciones/`. Si una interacción no se puede grabar (por ejemplo, la vibración en un móvil real), se indica.
- **Normas automáticas:** `npm run design:check` y `tests/browser/design.spec.ts`.

## Registro por pantalla

| Pantalla | Antes | Después | Grabación | PR |
|---|---|---|---|---|
| Cimientos (tokens, tipografía, movimiento) | `docs/diseno/antes/*` | `docs/diseno/cimientos/*` | `docs/diseno/grabaciones/cimientos.webm`: pulsado de la navegación y de los botones, anillo de foco de la caja y cambio de pantalla con fundido | #15 |
| Navegación | `docs/diseno/antes/*` | `docs/diseno/navegacion/*` | `navegacion.webm`, `navegacion-movil.webm` | #19 |
| Inicio | `antes/inicio-*` | `docs/diseno/inicio/*` | `inicio.webm` | #18 |
| Chat y estados de la IA | `antes/chat-*` | `docs/diseno/chat/*` | `chat.webm` | #24 |
| Aparición suave de respuestas (Parte I) | `docs/diseno/chat/*` | `docs/diseno/revelado/*` | `revelado.webm` (antes y después) | #25 |
| Test y simulacro | `antes/test-*` | `docs/diseno/test/*` | `test.webm`, `test-movil.webm` | #17 |
| Historial | `antes/historial-*` | `docs/diseno/historial/*` | `historial.webm` | #16 |
| Ajustes | `antes/ajustes-*` | `docs/diseno/ajustes/*` | `ajustes.webm` | #23 |
| Tareas | `antes/tareas-*` | `docs/diseno/tareas/*` | `tareas.webm` | #22 |
| Apuntes | `antes/apuntes-*` | `docs/diseno/apuntes/*` | `apuntes.webm` | #27 |
| Exámenes | `antes/examenes-*`, `antes/examen-*` | `docs/diseno/examenes/*` | `examenes.webm` | #26 |
| Login y registro (Parte D) | `antes/login-*` | `docs/diseno/login/*` | `login.webm` | #30 |
| Estilo nuevo y transiciones entre páginas (PR 1 del encargo de exámenes) | `docs/diseno/estilo/antes/*` | `docs/diseno/estilo/despues/*` | `transiciones-escritorio.webm`, `transiciones-movil.webm` (y `transiciones-antes-*`), `estilo-primitivas.webm` | #33 |
| Exámenes: historial y «Crear examen» (PR 2) | `docs/diseno/examenes-historial/antes/*` | `docs/diseno/examenes-historial/despues/*` | `examenes-historial-escritorio.webm`, `examenes-historial-movil.webm` | #34 |
| Asistente de crear examen a pantalla completa (PR 3) | `docs/diseno/asistente/antes/*` | `docs/diseno/asistente/despues/*` | `asistente-movil.webm`, `asistente-escritorio.webm` | este PR |
| Subida desde el móvil con QR (`/subir#<token>`) | — (pantalla nueva) | `docs/diseno/subir/*` | `subir.webm` | PR 5 |
| Ajustes con el estilo nuevo (PR 8) | `docs/diseno/estilo-ajustes/antes/*` | `docs/diseno/estilo-ajustes/despues/*` | `estilo-ajustes.webm` | este PR |

Todas las grabaciones están en `docs/diseno/grabaciones/`. Cada PR enlaza su `README.md` con la tabla Antes | Después | Por qué. Nada está marcado como terminado sin capturas y pruebas. Lo que no se pudo comprobar (móviles reales, lectores de pantalla) se dice en cada PR.

### Subida desde el móvil con QR (`/subir#<token>`, PR 5)

- **emil-design-eng:** «Buttons must feel responsive» → `.press` (escala 0,97) en «Hacer foto», «Subir archivo/Subir otro» y «Reintentar». «Never animate from scale(0)» → el tick entra desde `scale(0.8)` con opacidad (`upload.module.css`, `@keyframes pop`). Entradas con `--ease` (ease-out fuerte) y `--dur-rise` (240 ms); el trazo del tick se dibuja con `stroke-dashoffset` en `@keyframes draw` (240 ms), nunca en `transition`. «Stagger» corto: titular, texto y botones con `rise`, `rise-1`, `rise-2` (50 ms). Reducido: filas, tick y QR solo con fundido; el trazo aparece ya dibujado (prueba en `tests/browser/subir.spec.ts`).
- **apple-design:** `loading.md › Showing progress` («Clearly communicate that content is loading») → cada archivo dice «Procesando archivo…» con el orbe pulsando, y «En espera…» si va en cola. `feedback.md › Best practices` («Consider integrating status feedback into your interface») → el estado vive en la fila y en el contador «Has subido N archivos de 10» (`role="status"`), sin alertas. «Show people when a command can’t be carried out and help them understand why» → el motivo del rechazo en la fila y «Reintentar». `writing.md › Be action oriented` → botones con verbo. `privacy.md` → la cámara solo se abre al pulsar «Hacer foto» (`capture="environment"`). Botones de 56 px, foco al titular al cambiar de estado.
- **libraries-dev:** espera de más de 2 s (procesar un archivo) → la regla pide un indicador de «pensando»; se usa el orbe de marca con `orb-pulsing` en vez de `thinking-orbs` (no se instala nada sin OK). Sin `border-beam`: la pantalla ya tiene un solo foco y no se apilan efectos.
- Panel QR del ordenador (`components/exams/qr-panel.tsx`): aún sin capturas; no está montado en ninguna pantalla hasta que el asistente nuevo lo integre. `docs/diseno/subir/qr-ejemplo.svg` es un QR de ejemplo generado con `lib/qr.ts` para escanearlo con un móvil real.

