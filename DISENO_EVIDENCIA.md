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
| Estilo nuevo y transiciones entre páginas (PR 1 del encargo de exámenes) | `docs/diseno/estilo/antes/*` | `docs/diseno/estilo/despues/*` | `transiciones-escritorio.webm`, `transiciones-movil.webm` (y `transiciones-antes-*`), `estilo-primitivas.webm` | este PR |

Todas las grabaciones están en `docs/diseno/grabaciones/`. Cada PR enlaza su `README.md` con la tabla Antes | Después | Por qué. Nada está marcado como terminado sin capturas y pruebas. Lo que no se pudo comprobar (móviles reales, lectores de pantalla) se dice en cada PR.
