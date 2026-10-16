# Test y simulacro: evidencia de diseño

**Rama:** `design/test` (sale de `design/cimientos`). **Pantallas:** test de práctica (`components/test-experience.tsx`, `app/(dream)/tests/[id]`) y simulacro (`components/exams/exam-session.tsx`).
**Referencia:** Claude Design `Test.dc.html` y `MovilTest.dc.html`.

**Lo que vio Carlos:** el feedback de acierto y error tenía el color correcto, pero aparecía de golpe. No había animación de progreso ni de resultado.

## Skills leídas antes de tocar código

- `anthropic-skills:emil-design-eng` (entera).
- `anthropic-skills:apple-design` (entera), con `motion.md`, `playing-haptics.md`, `feedback.md`, `progress-indicators.md`, `accessibility.md`, `color.md`, `layout.md`, `typography.md` y `writing.md`.
- `anthropic-skills:libraries-dev` (entera). Ninguna espera de esta pantalla supera los 2 s de forma habitual: comprobar una respuesta usa el Orb de marca que ya existe. No se instala `thinking-orbs` ni `border-beam`. **Punto de enganche:** el `aria-busy` del botón «Comprobar respuesta» y de las opciones. Ahí iría `ThinkingOrb` si Carlos da el OK.

## Cambios

| Before | After | Why |
| --- | --- | --- |
| La pregunta nueva aparecía de golpe | Deslizamiento de 14 px y fundido, 220 ms, `--ease`, con WAAPI. Al volver atrás, desde el otro lado | emil `Animation Decision Framework › Spatial consistency` y `Use WAAPI for programmatic CSS animations`. Solo hay entrada, sin salida: un toque rápido sustituye el elemento y cancela la animación, así que nunca bloquea (apple `motion.md › Let people cancel motion`) |
| La transición no tenía versión reducida | Con `prefers-reduced-motion` solo hay fundido, sin `translateX` | apple `accessibility.md`: «Replacing transitions in x-, y-, and z-axes with fades» |
| Barra con `transform` y `--ease` | `scaleX` con `--ease-in-out` (240 ms). «Pregunta N de M» va en `aria-live="polite"` y en `aria-valuetext` | emil `What easing should it use? › moving on screen → ease-in-out`. apple `progress-indicators.md › determinate` |
| Feedback con `rise` de 220 ms. El fallo en el simulacro no tenía icono | Caja con icono y texto siempre («Bien pensado.» o «Todavía no.» más la explicación de la API). Entrada de 180 ms. Al acertar, el icono hace un «pop» (`scale .9 → 1`). Al fallar, el título se sacude 4 px como máximo | apple `accessibility.md › Convey information with more than color alone`. emil `Buttons must feel responsive` y `Never animate from scale(0)` |
| La sacudida no tenía alternativa | Con movimiento reducido: sin pop ni sacudida, solo fundido | emil `Accessibility › prefers-reduced-motion` |
| El resultado aparecía estático | La nota cuenta de 0 al valor final en 600 ms (rAF, ease-out, `.num`). Una tecla o un toque la saltan. Con movimiento reducido sale directa desde el primer fotograma. El lector de pantalla oye el valor final una sola vez | emil `Perceived performance`. apple `motion.md › Let people cancel motion` |
| Desglose sin entrada | Filas, estadísticas y casillas del simulacro entran escalonadas con `--stagger` (40 ms, tope de 8 filas). No bloquea la interacción | emil `Stagger Animations` |
| «Practicar mis errores», sin icono ni estado de carga | «Repasar mis errores» (el mismo nombre que en el simulacro) con icono, `press` y `aria-busy`. Al lado, «Volver a Dream» | apple `writing.md › Build language patterns` |
| «Referencia» o «Respuesta de referencia» salían aunque la API no la mandara («Sin respuesta» o vacío) | Solo se muestran si la API trae `correct_answer` | Regla de producto: Dream nunca da el ejercicio resuelto por su cuenta |
| Temporizador en una píldora que se pierde al hacer scroll | Temporizador fijo (`sticky`) con cifras `.num` | Encargo: siempre visible |
| Sin aviso al final | A 5 minutos: color `--warning` sobre `--warning-surface`, icono de aviso y «Quedan 5 minutos.». A 1 minuto: «Queda 1 minuto.». Cada aviso se anuncia una sola vez con `aria-live="polite"`. Sin parpadeo ni sonido. Si el tiempo estaba oculto, el aviso lo vuelve a mostrar | apple `feedback.md › integrate status feedback into your interface`. apple `accessibility.md › Be cautious with fast-moving and blinking animations` |
| Opciones: solo reposo, hover y `scale(.99)` | Reposo; hover (solo con puntero fino); pulsado `scale(.98)`; foco en toda la fila con `:has(input:focus-visible)`; cargando (`aria-busy`: las demás opciones bajan a 0,55 y el cursor pasa a `progress`); desactivado (al acabarse el tiempo, todas a 0,6) | emil `Buttons must feel responsive`. apple `accessibility.md`: controles de 56 px o más |
| Botones de navegación sin `press` | `press` en todos. Los que esperan al servidor llevan `aria-busy` y su texto («Comprobando…», «Corrigiendo…», «Guardando…»). Hover en «Salir» y en las filas del desglose | emil `Buttons must feel responsive`. CLAUDE.md: hover solo con `(hover: hover)` |
| Sin háptica | `navigator.vibrate?.(10)` al elegir una opción, solo con puntero táctil y nunca con movimiento reducido | apple `playing-haptics.md`: haptic corto, siempre igual, que acompaña a lo visual. Es un toque de selección, no de acierto o error, para no dar dos significados a un mismo patrón |

### Dónde me aparto de Claude Design y por qué

- **Título del feedback:** Claude Design pone «Correcto». Mantengo «Bien pensado.» (ya estaba y lo usan `dream.spec.ts` y `exams.spec.ts`), con el tono que pide el encargo. Para el error uso «Todavía no.», que es cercano sin infantilizar. El texto concreto sigue saliendo de la API. Si Carlos prefiere «Correcto» o «Incorrecto», es un cambio de una línea en `AnswerFeedback`.
- **Opción correcta tras fallar:** Claude Design solo dibuja el acierto. Se mantiene el verde en la opción correcta y el rojo en la elegida, porque la API manda `correct_answer`.

## Fluidez con la CPU ralentizada x4

Se mide con `Emulation.setCPUThrottlingRate: 4`, `PerformanceObserver('long-animation-frame')` y los huecos entre `requestAnimationFrame`. Prueba: `fluidity with the CPU slowed down 4×` en `tests/browser/test-diseno.spec.ts`. Resultados de 4 ejecuciones:

| Interacción | Fotogramas | Fotogramas > 50 ms | Peor fotograma | Long animation frames (LoAF) |
|---|---|---|---|---|
| Cambio de pregunta | 29–31 | **0** | 17–33 ms | 0–1 |
| Cuenta de la nota | 58 | **0** | 17–33 ms | 2 |

Los 2 LoAF de la cuenta coinciden con el render de la pantalla de resultado (llega la respuesta de `test_submit`), no con los fotogramas de la cuenta. Ningún hueco entre fotogramas pasa de 50 ms.

## Capturas (después)

Antes: `../antes/test-*.webp`.

| | Móvil claro | Móvil oscuro | Escritorio claro | Escritorio oscuro |
|---|---|---|---|---|
| Acierto (fixture común) | [móvil claro](test-movil-claro.webp) | [móvil oscuro](test-movil-oscuro.webp) | [escritorio claro](test-escritorio-claro.webp) | [escritorio oscuro](test-escritorio-oscuro.webp) |
| Error | [móvil claro](test-fallo-movil-claro.webp) | [móvil oscuro](test-fallo-movil-oscuro.webp) | [escritorio claro](test-fallo-escritorio-claro.webp) | [escritorio oscuro](test-fallo-escritorio-oscuro.webp) |
| Resultado | [móvil claro](test-resultado-movil-claro.webp) | [móvil oscuro](test-resultado-movil-oscuro.webp) | [escritorio claro](test-resultado-escritorio-claro.webp) | [escritorio oscuro](test-resultado-escritorio-oscuro.webp) |
| Simulacro | [móvil claro](simulacro-movil-claro.webp) | [móvil oscuro](simulacro-movil-oscuro.webp) | [escritorio claro](simulacro-escritorio-claro.webp) | [escritorio oscuro](simulacro-escritorio-oscuro.webp) |
| Aviso de 5 minutos | [móvil claro](simulacro-aviso-5min-movil-claro.webp) | [móvil oscuro](simulacro-aviso-5min-movil-oscuro.webp) | [escritorio claro](simulacro-aviso-5min-escritorio-claro.webp) | [escritorio oscuro](simulacro-aviso-5min-escritorio-oscuro.webp) |
| Aviso de 1 minuto | [móvil claro](simulacro-aviso-1min-movil-claro.webp) | [móvil oscuro](simulacro-aviso-1min-movil-oscuro.webp) | [escritorio claro](simulacro-aviso-1min-escritorio-claro.webp) | [escritorio oscuro](simulacro-aviso-1min-escritorio-oscuro.webp) |

Las capturas de acierto salen de `capturas.spec.ts -g "test (movil|escritorio)"`. Las de error, resultado y simulacro salen de un spec temporal con la misma fixture, que no se incluye en los commits. El aviso se fuerza con `page.clock`.

## Grabaciones

- `../grabaciones/test.webm` (1280×800, 13 s, 1,2 MB).
- `../grabaciones/test-movil.webm` (390×844, 13 s, 1,1 MB).

Contenido: hover y elección de opción, carga al comprobar, error con sacudida, reintento y acierto con pop, transición adelante, atrás y adelante, cuenta de la nota con desglose escalonado y, al final, el simulacro cruzando el aviso de 5 minutos en tiempo real. Están recortadas: 0,5–9,5 s y 15,3–19,4 s del vídeo de Playwright. **No se puede grabar la vibración**: solo se comprueba en un móvil real.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | 0 errores, 0 avisos |
| `npm run test` | 57/57 |
| `npm run design:check` | 7/7 (contraste incluido) |
| `npm run build` | Correcto. Único aviso: «Next.js inferred your workspace root», que sale porque el worktree está dentro del repo principal (dos lockfiles). No viene del código |
| Playwright, puerto 3204: `design.spec.ts`, `dream.spec.ts`, `exams.spec.ts` y `test-diseno.spec.ts` | 48/48 |
| `test-diseno.spec.ts --repeat-each 3` | 24/24, sin fallos intermitentes |

**Pruebas nuevas** (`tests/browser/test-diseno.spec.ts`):
- Transición: dirección, fotogramas clave de ±14 px y 220 ms, y toques rápidos.
- Barra: `transform` con `ease-in-out` y `aria-valuenow`.
- Feedback de acierto y error: icono, texto, `role=status`, pop, sacudida de 4 px como máximo y 180 ms.
- Estados de opciones y botones: reposo, hover, pulsado, foco, cargando y desactivado.
- Cuenta: llega a 7/10, el nombre accesible es final desde el principio, el escalonado va a 0 / 40 / 80 ms y la referencia se oculta si la API no la trae. Se puede saltar.
- Avisos de 5 y 1 minuto con `page.clock`: cada uno se anuncia una sola vez y nada se repite en bucle.
- Movimiento reducido: ninguna animación con `transform` y la nota sale final.
- Fluidez con la CPU a x4.

## Lo que no se ha podido comprobar

- La vibración en un dispositivo real (Chromium de escritorio no vibra).
- VoiceOver o TalkBack reales. Lo que se comprueba es el árbol de accesibilidad: el nombre accesible y las regiones `aria-live`.

## Preguntas para Carlos

1. ¿El título del feedback va como en Claude Design («Correcto») o se queda en «Bien pensado.» / «Todavía no.»?
2. El encargo pide el temporizador «siempre visible». Lo he dejado fijo y he mantenido «Ocultar tiempo», porque había quien lo usaba para estar más tranquilo. En los avisos, el tiempo vuelve a aparecer. ¿Quitamos la opción de ocultarlo?
3. ¿Se instala `thinking-orbs` en «Comprobando…» si la corrección pasa de 2 s? El punto de enganche es el `aria-busy`.
