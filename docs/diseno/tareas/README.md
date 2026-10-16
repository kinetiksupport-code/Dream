# Tareas: evidencia de diseño

**Rama:** `design/tareas` (sobre `design/cimientos`).
**Referencia:** Claude Design `Tareas.dc.html` (escritorio) y `MovilTareas.dc.html` (móvil).
**Skills leídas:** `emil-design-eng`, `apple-design` (con `accessibility`, `layout`, `lists-and-tables`, `loading`, `feedback`, `motion`, `writing`, `dark-mode` y `designing-for-ios`) y `libraries-dev`.

## Cambios

| Before | After | Why |
| --- | --- | --- |
| Filas sin agrupar visualmente; títulos de sección iguales en móvil y escritorio | «Pendientes» y «Hechas» a 20 px en escritorio; en móvil, 15 px en gris secundario, como en Claude Design | Claude Design `Tareas` y `MovilTareas`; apple `layout.md › Group related items` |
| En móvil, «Resolver con Dream» comprimía el título a tres líneas | En menos de 640 px la acción baja bajo el título, alineada con él; el título usa todo el ancho y envuelve entre palabras (`overflow-wrap`, `hyphens: auto`, `text-wrap: pretty`) | apple `layout.md › Design a layout that adapts gracefully`; prueba a 360, 390 y 430 px sin scroll lateral |
| El dato «Asignatura · Examen el 27 nov» se partía por la mitad | Cada parte pasa entera a la línea siguiente | apple `lists-and-tables.md › Consider ways to preserve readability of text that might otherwise get clipped` |
| Botón móvil «Hacer foto» igual que en escritorio | En móvil: «Hacer foto del ejercicio», 48 px y ancho completo (la acción principal de la pantalla) | Claude Design `MovilTareas` |
| Filas sin respuesta al cursor | Capa `--state-hover` solo con `@media (hover: hover) and (pointer: fine)` | emil `Touch device hover states` |
| Sin estado de pulsado | `.press`: `scale(.97)` en `:active`, 160 ms con `--ease`; capa `--state-press` | emil `Buttons must feel responsive` |
| Casilla nativa sin foco claro | Casilla propia de 22 px dentro de un área de 44 px; anillo de foco de 2 px (`--focus`) | apple `accessibility.md › Offer sufficiently sized controls`; CLAUDE.md «Foco visible» |
| No se podía marcar una tarea como hecha | Casilla que guarda con `exam_unit_complete` (acción ya existente en `dream-api`) | encargo |
| — | Hecha = icono de check + texto «Hecha» + tachado, nunca solo color | apple `accessibility.md › Convey information with more than color alone` |
| — | Toast «Tarea hecha.» con «Deshacer» (5 s) dentro de una región `aria-live="polite"`; se guarda al cerrar, al marcar otra, al ocultar la pestaña o al salir | apple `feedback.md`; `dream-api` no tiene deshacer, así que se espera antes de guardar |
| — | Si falla al guardar: la tarea vuelve a pendientes y sale un aviso `role="alert"` con «Reintentar». Avisos apilados en un solo contenedor, sin solaparse | apple `writing.md › Write clear error messages` |
| Esqueleto genérico de tres barras | Esqueleto con la forma de la lista: título de sección, casilla, dos líneas y acción; fundido de opacidad en bucle con escalonado de 40 ms; con movimiento reducido, estático | apple `loading.md › Show something as soon as possible`; emil `Stagger Animations` |
| Estado vacío solo con texto | Ilustración SVG en línea (colores del tema, `aria-hidden`), «Aún no tienes tareas», una frase y un botón: «Preparar un examen» | apple `writing.md › Provide clear next steps on any blank screens` |
| La tarea recién hecha aparecía de golpe en «Hechas» | Entrada `.rise` (8 px + opacidad, 240 ms, ease-out); con movimiento reducido, solo fundido | emil `Preventing jarring changes` |
| — | Al guardar con el teclado, el foco pasa al título «Hechas»; al deshacer, vuelve a la casilla | apple `accessibility.md` (uso con teclado) |

## Diferencias con Claude Design

- **«Añadir tarea»** (botón en la cabecera y «+» en móvil): no se implementa. Las tareas salen de las unidades de los exámenes (`tasksSource.canCreate = false`) y no hay función para crearlas a mano. La acción clara del estado vacío es «Preparar un examen».
- **«Resolver con Dream» en móvil:** Claude Design no lo pone en las filas móviles. Se mantiene, debajo del título, para no quitar en móvil una función que existe en escritorio (apple `layout.md`: mismas funciones a cualquier tamaño). La auditoría también lo pedía así.
- **«Tarjetas con hover» del encargo:** Claude Design dibuja filas con separador, no tarjetas. Se siguen las filas, con capa de hover.
- **Línea de datos:** Claude Design pone «Matemáticas · Mañana»; aquí es «Asignatura · Examen el 27 nov», que es el dato real de la unidad.

## Capturas

**Antes:** `../antes/tareas-movil-claro.webp`, `../antes/tareas-movil-oscuro.webp`, `../antes/tareas-escritorio-claro.webp`, `../antes/tareas-escritorio-oscuro.webp`.

| Estado | Móvil claro | Móvil oscuro | Escritorio claro | Escritorio oscuro |
| --- | --- | --- | --- | --- |
| Lista | [movil-claro](tareas-movil-claro.webp) | [movil-oscuro](tareas-movil-oscuro.webp) | [escritorio-claro](tareas-escritorio-claro.webp) | [escritorio-oscuro](tareas-escritorio-oscuro.webp) |
| Hecha (con título largo y toast) | [hecha-movil-claro](tareas-hecha-movil-claro.webp) | [hecha-movil-oscuro](tareas-hecha-movil-oscuro.webp) | [hecha-escritorio-claro](tareas-hecha-escritorio-claro.webp) | [hecha-escritorio-oscuro](tareas-hecha-escritorio-oscuro.webp) |
| Cargando | [cargando-movil-claro](tareas-cargando-movil-claro.webp) | [cargando-movil-oscuro](tareas-cargando-movil-oscuro.webp) | [cargando-escritorio-claro](tareas-cargando-escritorio-claro.webp) | [cargando-escritorio-oscuro](tareas-cargando-escritorio-oscuro.webp) |
| Vacío | [vacio-movil-claro](tareas-vacio-movil-claro.webp) | [vacio-movil-oscuro](tareas-vacio-movil-oscuro.webp) | [vacio-escritorio-claro](tareas-vacio-escritorio-claro.webp) | [vacio-escritorio-oscuro](tareas-vacio-escritorio-oscuro.webp) |

Se generan con `CAPTURAS_DIR=<carpeta> npx playwright test capturas.spec.ts tareas-evidencia.spec.ts -g "tareas|grabación"` y se pasan a WebP (390 px móvil, 720 px escritorio, calidad 72).

## Grabación

`../grabaciones/tareas.webm` (1280×800, 9 s, 586 KB): hover sobre dos filas, pulsado sin marcar, anillo de foco con el teclado, marcar como hecha (icono + «Hecha» + toast), «Deshacer», marcar otra vez y cerrar el aviso: la tarea entra en «Hechas».

No se graba en un móvil real: el hover no existe allí y el pulsado se comprueba con la prueba de `scale(.97)`.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | sin errores |
| `npx eslint . --ignore-pattern ".claude/**"` | 0 errores, 0 avisos |
| `npm run test` | 57/57 |
| `npm run design:check` | 7/7 y contraste AA en verde |
| `npm run build` | correcto; solo el aviso ya existente de `outputFileTracingRoot` (dos lockfiles por el worktree) |
| `tests/browser/tareas.spec.ts` | 11/11 |
| `tests/browser/design.spec.ts` (entero) | 26/26 |
| `tests/browser/dream.spec.ts` | 11/11 |
| `tests/browser/exams.spec.ts` | 3/3 |
| Fluidez con CPU ×4 (rAF, 390 y 1280 px) | esqueleto 3 s: 0 fotogramas > 50 ms (máx. 33 y 17 ms); marcar y deshacer 2 s: 0 fotogramas > 50 ms (máx. 17 y 50 ms) |

## Pendiente

- `thinking-orbs` y `border-beam` no aplican aquí: cargar la lista es una espera corta (< 2 s, libraries-dev › Decision rules). No hay punto de enganche.
- El botón secundario «Subir archivo» en oscuro usa el estilo global `.secondary` de cimientos (fondo casi negro sin borde visible sobre el panel). No se toca aquí.
