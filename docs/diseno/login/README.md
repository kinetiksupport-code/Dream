# Login y registro (rama `design/login`)

**Claude Design no tiene tablero de login ni de registro.** Todo sale de los cimientos (`app/globals.css`: tokens, tipografía, `.press`, foco) y de las skills. Donde decido algo sin tablero, lo digo en la columna «Why».

**Skills leídas enteras:** `emil-design-eng`, `apple-design` (con `accessibility`, `layout`, `typography`, `color`, `dark-mode`, `designing-for-ios`, `cross-platform`, `onboarding`, `managing-accounts`, `privacy`, `entering-data`, `toggles`, `buttons`, `feedback`, `writing`, `motion` y `generative-ai`) y `libraries-dev`.

**libraries-dev:** el login espera menos de 2 s (abrir Google), así que no lleva orbe ni borde de luz («Under 2 s → Nothing»). No hay punto de enganche que preparar en esta pantalla.

## Capturas

**Antes:** `../antes/login-movil-claro.webp`, `../antes/login-movil-oscuro.webp`, `../antes/login-escritorio-claro.webp`, `../antes/login-escritorio-oscuro.webp`.

**Después** (390 px y 1440 px, claro y oscuro):

| Estado | Móvil | Escritorio |
|---|---|---|
| Login | `login-movil-claro.webp` · `login-movil-oscuro.webp` | `login-escritorio-claro.webp` · `login-escritorio-oscuro.webp` |
| Login con error de Google | `login-error-movil-claro.webp` · `login-error-movil-oscuro.webp` | `login-error-escritorio-claro.webp` · `login-error-escritorio-oscuro.webp` |
| Registro vacío | `login-registro-movil-claro.webp` · `login-registro-movil-oscuro.webp` | `login-registro-escritorio-claro.webp` · `login-registro-escritorio-oscuro.webp` |
| Registro, 14 años o más | `login-registro-mayor-movil-claro.webp` · `…-oscuro.webp` | `login-registro-mayor-escritorio-claro.webp` · `…-oscuro.webp` |
| Registro, menor de 14 | `login-registro-menor-movil-claro.webp` · `…-oscuro.webp` | `login-registro-menor-escritorio-claro.webp` · `…-oscuro.webp` |
| Error de casillas | `login-registro-error-movil-claro.webp` · `…-oscuro.webp` | `login-registro-error-escritorio-claro.webp` · `…-oscuro.webp` |
| 360 px | `login-360-claro.webp` · `login-360-oscuro.webp` · `registro-360-claro.webp` · `registro-360-oscuro.webp` | — |
| Móvil en horizontal (844 × 390) | `login-horizontal-claro.webp` · `login-horizontal-oscuro.webp` · `registro-horizontal-claro.webp` · `registro-horizontal-oscuro.webp` | — |

**Grabación:** `../grabaciones/login.webm` (12 s, 611 KB, 390 × 844). Pulsado del botón de Google, estado cargando, error con «Volver a intentarlo», «Empezar» sin nada (errores y foco a la fecha), menor de 14 (aparece la casilla del tutor), marcar tocando el texto, cambio a 16 años (la casilla del tutor desaparece) y entrada al chat con el aviso de IA.

**Nota:** Chromium sin interfaz enseña la fecha como `mm/dd/yyyy`. En un móvil en español sale `dd/mm/aaaa`: es el selector nativo del sistema.

## Before | After | Why

| Before | After | Why |
|---|---|---|
| El `h1` («Entiende lo que estudias.») estaba en el panel de marca, oculto en móvil: en el teléfono la página no tenía `h1` | Un solo `h1` visible en todos los anchos: «Entrar en Dream». El lema pasa a texto | apple `layout.md › Order content by relative importance`; `accessibility.md › Describe your app's interface… for VoiceOver` |
| «Inicia sesión o crea tu cuenta gratis.» | «Entra con tu cuenta de Google. Si es tu primera vez, se crea tu cuenta gratis.» | apple `managing-accounts.md › Always identify the authentication method you offer` y `› Explain the benefits of creating an account` |
| Hover del botón de Google a `--surface` (#F5F7FA), casi igual que el blanco del botón | Hover a `--surface-hover` (#EDF1F8, el `ghost:hover` de Claude Design), fundido de 120 ms con `ease`, solo con `(hover: hover) and (pointer: fine)` | emil `Touch device hover states` y `› Is it a hover/color change? → ease` |
| Pulsado .97 con `.press` | Se mantiene, ahora con prueba que mide `matrix(0.97…)` | emil `Buttons must feel responsive` |
| Cargando: `disabled` + `opacity: .6`. Parecía desactivado y el foco se perdía | `aria-busy="true"` + `aria-disabled`, sin `disabled`: el foco se queda. Anillo girando donde estaba la «G» y «Abriendo Google…» | apple `buttons.md › Mobile: Configure a button to display an activity indicator`; emil `Perceived performance` (giro rápido, 700 ms) |
| Desactivado (antes de estar listo): igual que cargando | `disabled`, opacidad .5, sin sombra y `cursor: not-allowed` | apple `feedback.md`: cada estado distinto y reconocible |
| Movimiento reducido: el anillo seguía girando | El anillo deja de girar y «respira» (opacidad) | emil `Accessibility › prefers-reduced-motion`: menos movimiento, no cero; apple `accessibility.md › Be cautious with fast-moving and blinking animations` |
| Error: solo texto rojo sobre rojo | Icono + texto, entrada con `.rise` y «Volver a intentarlo» de 44 px (arreglo de Google, PR #21) | apple `accessibility.md › Convey information with more than color alone`; `writing.md › Write clear error messages` |
| Sesión caducada pintada como error rojo | Aviso tranquilo con reloj, `role="status"` | apple `feedback.md`: «match the significance of the information to the way it's delivered» |
| Enlaces legales de 17 px de alto | `padding-block` de 14 px: zona de 45 px sin cambiar el interlineado | apple `accessibility.md › Offer sufficiently sized controls` (44 × 44) |
| Móvil en horizontal: la marca y los huecos empujaban el botón | Con `max-height: 500px`, sin la marca y con huecos de 16 px | apple `layout.md › Determine layout based on size classes, not device type or orientation` |
| No había paso de registro ni casillas (la acción `onboarding` se quitó de `dream-api`) | Pantalla «Antes de empezar» tras el primer login, en lugar de chat, apuntes y exámenes. Ajustes sigue abierto | apple `onboarding.md › If your app… needs access to private data… integrate the permission request into your onboarding flow`; `generative-ai.md › Ask permission before using personal information` |
| — | Fecha de nacimiento con su motivo: «Sirve para saber si necesitas el permiso de tu familia. No la usamos para nada más.» Selector nativo (`type="date"`, `autocomplete="bday"`) | apple `privacy.md › Write copy that clearly describes how your app uses… the data`; `entering-data.md › When possible, offer choices instead of requiring text entry` |
| — | Casilla del tutor solo si la edad es menor de 14. Aparece con fundido y 4 px de subida (200 ms, `@starting-style`); con movimiento reducido, solo fundido | emil `Animate enter states with @starting-style` y `Preventing jarring changes`; apple `layout.md › Use progressive disclosure` |
| — | Casillas separadas y **sin marcar**. Si se pasa de 14 a menos, vuelve desmarcada | Política de privacidad §6 y §7 (texto de Carlos, sin tocar) |
| — | Checkbox de 24 px en una zona de 44 × 44; toda la fila es la `<label>`. Estado marcado con relleno + ✓, no solo color | apple `accessibility.md › Offer sufficiently sized controls`; `toggles.md › Make sure the visual differences in a toggle's state are obvious` |
| — | «Empezar» siempre activo. Si falta algo: error junto al campo, con icono y causa, `aria-invalid`, `aria-describedby` y foco al primero. Tras el primer intento, los errores se actualizan al corregir | apple `feedback.md › Show people when a command can't be carried out and help them understand why`; `entering-data.md › Dynamically validate field values`. **Me aparto** de `entering-data.md › …make the button available only after people enter the data`: un botón desactivado no dice qué falta, y el encargo pide el error junto a la casilla |
| — | Enlaces a `/terminos` y `/privacidad` en otra pestaña, para no perder lo escrito | apple `writing.md › Be action oriented` (enlaces descriptivos) |
| — | «Salir» discreto bajo el botón | apple-design SKILL, Lens 4: «Modal views have an obvious way out» |
| Chat: «Dream puede equivocarse. Pregunta, compara y comprende.», oculto en móvil | «Estás hablando con una IA. Puede equivocarse: contrasta lo importante.» Fijo bajo la caja desde el primer mensaje, también en móvil. Mismo diseño que el PR #12 (`.ai-notice`) | apple `generative-ai.md › Communicate where your app uses AI` y `› Raise awareness about… hallucinations`; AI Act art. 50 |

## Fluidez con la CPU 4 veces más lenta

Medido con `Emulation.setCPUThrottlingRate { rate: 4 }` y `requestAnimationFrame`, a 390 × 844:

| Movimiento | Fotogramas | Fotogramas > 50 ms | Peor fotograma |
|---|---|---|---|
| Anillo de carga, 2 s | 121 | 0 | 17 ms |
| Aparición de la casilla del tutor, 600 ms | 37 | 0 | 17 ms |

## Comprobaciones (17/10/2026)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| `npx eslint . --ignore-pattern ".claude/**"` | 0 errores, 0 avisos |
| `npm run test` | 70 de 70 (incluye `consent.test.ts` y `auth-redirect.test.ts`) |
| `npm run design:check` | verde (reglas estáticas y contraste AA) |
| `npm run build` | correcto. Único aviso: «inferred your workspace root», por el `package-lock.json` del repo padre del worktree. No es de este cambio |
| Playwright `design.spec.ts` (puerto 3216) | 36 de 36. Ahora incluye `login-error` y los cuatro estados del registro |
| Playwright `login-google.spec.ts` | 5 de 5 |
| Playwright `login-registro.spec.ts` (nuevo) | 18 de 18 |
| Playwright `dream.spec.ts`, `exams.spec.ts`, `security.spec.ts`, `observability.spec.ts` | 19 de 19 |

## Lo que no se ha podido comprobar

- **Guardar el consentimiento de verdad:** la acción `consent` no existe en `dream-api`. La interfaz está probada con un mock (diseño en `docs/CONSENTIMIENTO.md`).
- **El estado desactivado** del botón de Google dura un instante (hasta leer la sesión local). La prueba fuerza el atributo y comprueba cómo se ve.
- **Selector de fecha en iOS y Android reales** y VoiceOver o TalkBack: no hay dispositivos aquí.
- **`/terminos` y `/privacidad` dan 404 en esta rama:** las páginas están en producción y en el PR #12, no en `design/cimientos`. Los enlaces apuntan a la ruta correcta.
