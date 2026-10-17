# Ajustes

Rama `design/ajustes`, sobre `design/cimientos`. Puerto de pruebas: 3206.

**Referencias leídas:**
- `emil-design-eng` entera.
- `apple-design` entera, con `accessibility`, `layout`, `typography`, `color`, `dark-mode`, `motion`, `feedback`, `settings`, `toggles`, `modality`, `alerts` y `cross-platform`.
- `libraries-dev`: aquí no aplica. Ajustes no tiene esperas de IA, así que no lleva orbes ni borde de luz.
- `CLAUDE.md`, `DISENO_AUDITORIA.md` (§1 a §5 y «Ajustes»), `DISENO_EVIDENCIA.md` y Claude Design `Ajustes.dc.html`.

## Cambios

| Before | After | Why |
| --- | --- | --- |
| El tema cambiaba de golpe | La página funde en 200 ms con una View Transition. Solo cambia la opacidad, con `ease` | emil › *Use blur to mask imperfect transitions* y *What easing should it use?* (cambio de color → `ease`); apple `motion.md › Aim for brevity and precision` |
| La opción elegida del tema solo cambiaba de color | Una píldora se desliza bajo la opción con `transform` (200 ms, `--ease-in-out`). El control sale del fundido de la página (`view-transition-name`) y se ve en vivo | emil › *What easing should it use?* (se mueve en pantalla → ease-in-out); auditoría «Ajustes»: «Indicador que se desliza» |
| La píldora podía deslizarse al cargar, al leer el tema guardado | Solo se anima después de dos fotogramas (`data-settled`) | emil › *Should this animate at all?* |
| Fallo «Claro marcado con la página oscura» | No se reproduce. Lo vigilan dos pruebas: con el sistema en oscuro, «Claro» deja fondo blanco y `data-theme="light"`, también tras recargar (`ajustes.spec.ts` y `design.spec.ts`) | apple `dark-mode.md › Ensure that your app looks good in both appearance modes`; auditoría hallazgo 7 |
| No había lectura fácil | Interruptor «Lectura fácil»: Lexend, interlineado de 1,7 y +0,02 em. Pone `data-reading="easy"` en `<html>` antes de pintar | Encargo §8; auditoría §5 |
| — | Solo se guarda la preferencia `dream-reading=easy`, nunca contenido. La prueba comprueba que en `localStorage` solo hay `dream-reading`, `dream-theme` y el aviso de almacenamiento | CLAUDE.md › *No se guarda contenido personal en localStorage* |
| Interruptor apagado `--border` (1,1:1 sobre el panel) y estado solo por color | Pista apagada `--switch-off` (3,03:1 en claro y 3,18:1 en oscuro). Encendida, `--primary` (4,93:1 y 3,12:1). Al encenderse, el pomo se mueve y lleva una marca ✓ | apple `toggles.md › Make sure the visual differences in a toggle's state are obvious` y `accessibility.md › Convey information with more than color alone` |
| El interruptor no tenía foco visible ni respuesta al pulsar | `role="switch"` y `aria-checked`. Anillo de foco de 2 px. Al pulsarlo, el pomo baja a `scale(0.94)`. Área táctil de 45 px | apple `accessibility.md › Offer sufficiently sized controls`; emil › *Buttons must feel responsive* |
| Los diálogos de confirmación eran hojas inferiores en móvil, con `role="dialog"` | Variante `alert`: centrada, `role="alertdialog"` y `aria-describedby`. Entra desde `scale(0.95)` y opacidad 0 en 200 ms (`--ease`). Sale con un fundido de 120 ms | emil › *Never animate from scale(0)* y *Make popovers origin-aware* (los modales, centrados); *Asymmetric enter/exit timing* |
| El foco no siempre volvía al botón que abrió el diálogo, porque el `autoFocus` lo movía antes | `Modal` guarda el botón que lo abrió en el primer render. Al cerrar con Escape, Cancelar o tras borrar, el foco vuelve a ese botón | apple `modality.md › Always give people an obvious way to dismiss a modal view`; `accessibility.md › keyboard` |
| «Historial borrado.» era un párrafo que aparecía de golpe | Aviso en una región `aria-live="polite"` que siempre está en la página. Tiene botón «Cerrar aviso», dura 6 s y sale con un fundido de 120 ms | apple `feedback.md › When it makes sense, confirm that a significant action or task has completed` |
| «Borrar historial» y «Eliminar mi cuenta» no explicaban nada cuando no se podían usar | Sin conexión, los dos botones se atenúan. Debajo aparece «Sin conexión. Podrás borrar el historial o eliminar tu cuenta cuando vuelvas a tener internet.», con icono y en `--text-secondary` (AA). Sin conversaciones, «No tienes conversaciones guardadas. No hay historial que borrar.» | apple `feedback.md › Show people when a command can't be carried out and help them understand why` |
| — | Usan `aria-disabled` y no `disabled`. Siguen recibiendo el foco y el lector de pantalla lee el motivo (`aria-describedby`) | apple `accessibility.md › Let people use the keyboard alone` |
| En móvil, la barra inferior tapaba «Datos de uso» y «Cuenta» | `.page-settings` reserva abajo la altura de la barra, más 32 px. Probado a 360, 390, 430 y 844×390: quedan al menos 16 px libres | apple `layout.md › Guides and safe areas` |
| Con movimiento reducido | El tema y los diálogos solo funden. La píldora y el pomo saltan sin deslizarse. Los colores siguen fundiéndose | emil › *prefers-reduced-motion*; apple `accessibility.md › Replacing transitions … with fades` |
| Orden de la página | Perfil, Apariencia, Privacidad, Datos de uso, Instalar y Cuenta. Sigue el orden de Claude Design (Perfil → Privacidad) | Claude Design `Ajustes.dc.html` |

## Diferencias con Claude Design

- **«Cómo te ayuda Dream» / «Respuesta directa»: no se implementa.** Dream nunca da el ejercicio resuelto (regla de producto). Sin «Respuesta directa» solo quedaría «Con pistas», y un ajuste con una sola opción no se puede elegir. Por eso tampoco sale la sección (apple `settings.md › Minimize the number of settings you offer`). `dream.spec.ts` ya comprobaba que no aparece.
- **«Nombre» y «Nivel» editables: no se tocan.** Vienen de la cuenta de Google y se muestran como datos. Cambiarlos necesita `dream-api`. **Pregunta para Carlos.**
- **Apariencia y Lectura fácil** no salen en Claude Design. Las pide el encargo. El selector de tema choca con apple `dark-mode.md › Avoid offering an app-specific appearance setting`. Se mantiene porque Carlos lo pide, con «Sistema» por defecto (ya anotado en la auditoría).
- **«Cerrar sesión» sin diálogo.** El agente anterior había añadido una confirmación. La he quitado: no está en Claude Design, y cerrar sesión no destruye datos (apple `alerts.md › Avoid displaying alerts for common, undoable actions`).

## Evidencia

**Antes:** `../antes/ajustes-*.webp` y `../antes/ajustes-tema-claro-con-sistema-oscuro.webp`.

**Después** (móvil a 390 px y escritorio a 720 px, claro y oscuro):

| Qué | Móvil claro | Móvil oscuro | Escritorio claro | Escritorio oscuro |
| --- | --- | --- | --- | --- |
| Página | [ver](ajustes-movil-claro.webp) | [ver](ajustes-movil-oscuro.webp) | [ver](ajustes-escritorio-claro.webp) | [ver](ajustes-escritorio-oscuro.webp) |
| Final de la página sobre la barra | [ver](ajustes-final-movil-claro.webp) | [ver](ajustes-final-movil-oscuro.webp) | [ver](ajustes-final-escritorio-claro.webp) | [ver](ajustes-final-escritorio-oscuro.webp) |
| Diálogo centrado | [ver](ajustes-dialogo-movil-claro.webp) | [ver](ajustes-dialogo-movil-oscuro.webp) | [ver](ajustes-dialogo-escritorio-claro.webp) | [ver](ajustes-dialogo-escritorio-oscuro.webp) |
| Lectura fácil activada y aviso | [ver](ajustes-lectura-facil-movil-claro.webp) | [ver](ajustes-lectura-facil-movil-oscuro.webp) | [ver](ajustes-lectura-facil-escritorio-claro.webp) | [ver](ajustes-lectura-facil-escritorio-oscuro.webp) |
| Interruptor con foco de teclado | [ver](ajustes-interruptor-foco-movil-claro.webp) | [ver](ajustes-interruptor-foco-movil-oscuro.webp) | [ver](ajustes-interruptor-foco-escritorio-claro.webp) | [ver](ajustes-interruptor-foco-escritorio-oscuro.webp) |
| Sin conexión: acciones explicadas | [ver](ajustes-sin-conexion-movil-claro.webp) | [ver](ajustes-sin-conexion-movil-oscuro.webp) | [ver](ajustes-sin-conexion-escritorio-claro.webp) | [ver](ajustes-sin-conexion-escritorio-oscuro.webp) |

**Grabación:** [`../grabaciones/ajustes.webm`](../grabaciones/ajustes.webm). Dura 12,5 s, a 1280×800, y pesa 1,2 MB. Muestra:
- El cambio de tema Oscuro → Claro → Sistema, con fundido y la píldora deslizándose.
- La lectura fácil, encendida y apagada.
- El foco de teclado en el interruptor.
- El diálogo «Eliminar mi cuenta», que se abre y se cierra con Escape.
- El diálogo «Borrar historial», confirmado, y el aviso con su cierre.

En los fotogramas del fundido no hay ningún destello blanco ni negro.

**Cómo regenerarla:**
- Capturas de la fixture común: `CAPTURAS_DIR=<dir> … capturas.spec.ts -g ajustes`.
- Capturas extra: `CAPTURAS_DIR=<dir> … ajustes.spec.ts -g "capturas de Ajustes"`.
- Grabación: `GRABACION_DIR=<dir> … ajustes.spec.ts -g "grabación"`.

## Comprobaciones

- `npm run typecheck`: sin errores.
- `npx eslint . --ignore-pattern ".claude/**"`: 0 errores y 0 avisos.
- `npm run test`: 57/57.
- `npm run design:check`: 7/7, y todos los pares de contraste en verde. Incluye «Interruptor apagado» y «Interruptor encendido».
- `npm run build`: correcto. Sale el aviso de siempre, «inferred your workspace root», porque el worktree está dentro del repositorio. No hay avisos nuevos.
- Playwright en el puerto 3206 con `design.spec.ts` entero, `dream.spec.ts`, `observability.spec.ts` y `ajustes.spec.ts`:
  - Pasa todo, salvo `observability.spec.ts › PostHog SDK…`, que es inestable.
  - Esa prueba ya fallaba en `design/cimientos` sin estos cambios: 1 de 5 repeticiones allí y 2 de 5 aquí. Un lote de PostHog que estaba en cola se envía después de retirar el consentimiento. No tiene que ver con Ajustes.
- Fluidez con la CPU ralentizada: no medida. Ajustes no tiene movimiento continuo, solo transiciones cortas.
