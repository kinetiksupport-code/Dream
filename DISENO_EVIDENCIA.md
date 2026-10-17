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
| Subida desde el móvil con QR (`/subir#<token>`) | — (pantalla nueva) | `docs/diseno/subir/*` | `subir.webm` | PR 5 |

Todas las grabaciones están en `docs/diseno/grabaciones/`. Cada PR enlaza su `README.md` con la tabla Antes | Después | Por qué. Nada está marcado como terminado sin capturas y pruebas. Lo que no se pudo comprobar (móviles reales, lectores de pantalla) se dice en cada PR.

### Subida desde el móvil con QR (`/subir#<token>`, PR 5)

- **emil-design-eng:** «Buttons must feel responsive» → `.press` (escala 0,97) en «Hacer foto», «Subir archivo/Subir otro» y «Reintentar». «Never animate from scale(0)» → el tick entra desde `scale(0.8)` con opacidad (`upload.module.css`, `@keyframes pop`). Entradas con `--ease` (ease-out fuerte) y `--dur-rise` (240 ms); el trazo del tick se dibuja con `stroke-dashoffset` en `@keyframes draw` (240 ms), nunca en `transition`. «Stagger» corto: titular, texto y botones con `rise`, `rise-1`, `rise-2` (50 ms). Reducido: filas, tick y QR solo con fundido; el trazo aparece ya dibujado (prueba en `tests/browser/subir.spec.ts`).
- **apple-design:** `loading.md › Showing progress` («Clearly communicate that content is loading») → cada archivo dice «Procesando archivo…» con el orbe pulsando, y «En espera…» si va en cola. `feedback.md › Best practices` («Consider integrating status feedback into your interface») → el estado vive en la fila y en el contador «Has subido N archivos de 10» (`role="status"`), sin alertas. «Show people when a command can’t be carried out and help them understand why» → el motivo del rechazo en la fila y «Reintentar». `writing.md › Be action oriented` → botones con verbo. `privacy.md` → la cámara solo se abre al pulsar «Hacer foto» (`capture="environment"`). Botones de 56 px, foco al titular al cambiar de estado.
- **libraries-dev:** espera de más de 2 s (procesar un archivo) → la regla pide un indicador de «pensando»; se usa el orbe de marca con `orb-pulsing` en vez de `thinking-orbs` (no se instala nada sin OK). Sin `border-beam`: la pantalla ya tiene un solo foco y no se apilan efectos.
- Panel QR del ordenador (`components/exams/qr-panel.tsx`): aún sin capturas; no está montado en ninguna pantalla hasta que el asistente nuevo lo integre. `docs/diseno/subir/qr-ejemplo.svg` es un QR de ejemplo generado con `lib/qr.ts` para escanearlo con un móvil real.

