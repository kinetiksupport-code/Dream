# Navegación: barra lateral, barra inferior y «Más»

Rama `design/navegacion`. Archivos: `components/nav-indicator.tsx` (nuevo), `components/shell.tsx`, la sección `/* === Navegación === */` y las filas de «Más» en `app/globals.css`, `scripts/design/contrast.mjs` y `tests/browser/navegacion.spec.ts` (nuevo).

**Skills leídas enteras antes de tocar código:** `emil-design-eng`, `apple-design` (con `tab-bars.md`, `sidebars.md`, `accessibility.md`, `layout.md`, `motion.md`, `designing-for-ios.md`, `typography.md`, `color.md` y `dark-mode.md`) y `libraries-dev`. `libraries-dev` no aplica aquí: la navegación no tiene esperas. No se usa ni `thinking-orbs` ni `border-beam`.

**Claude Design:** `Main.dc.html` (barra lateral de 264 px, ítems de 44 px, radio 12 y activo `rgba(21,91,255,.10)` con texto azul) y `MovilMas.dc.html` / `MovilChat.dc.html` (barra inferior con Inicio, Chat, Tareas y Más, y etiquetas de 11 px).

## Cambios

| Before | After | Why |
| --- | --- | --- |
| El fondo activo salta de un ítem a otro | Una sola píldora (`.nav-indicator`) se desliza con `transform: translateY` en 200 ms y `--ease-in-out`. Las medidas se escriben en el propio elemento | emil › *Animation Decision Framework* (movimiento en pantalla → ease-in-out; continuidad espacial) y *Performance Rules › CSS variables are inheritable* |
| — | En la primera carga, al redimensionar y al girar el móvil la píldora se coloca sin animarse | emil › *Should this animate at all?*: solo se anima el cambio de sección |
| — | Si cambias de sección con Intro o Espacio, no hay deslizamiento | emil › *Never animate keyboard-initiated actions* |
| — | Con movimiento reducido cambia de sitio al instante, sin desplazarse | emil › *Accessibility › prefers-reduced-motion*; apple `accessibility.md` › *Replacing transitions in x-, y-, and z-axes with fades* |
| El ítem activo tenía su propio fondo | Cuando la píldora está colocada, el enlace activo queda transparente: no hay doble relleno. `aria-current="page"` sigue en el enlace y la píldora es `aria-hidden` | apple `accessibility.md` › *Convey information with more than color alone* (forma, color y peso 600) |
| Barra inferior: el activo solo cambiaba de color | Una píldora (`--nav-active`) se desliza con `translateX` detrás de la pestaña activa | Lo pide el encargo. **Se aparta de Claude Design** (MovilMas no tiene píldora): uso el mismo tinte que la barra lateral para que las dos navegaciones hablen igual |
| Pestaña activa en `--primary-ink` | Pestaña activa en `--primary-ink-tint` sobre la píldora (5,65:1 en claro y 7,29:1 en oscuro) | apple `accessibility.md`: 4,5:1 hasta 17 pt (las etiquetas miden 11 px) |
| Iconos de la barra inferior a 22 px por un fallo (`className === "tab"` nunca se cumplía) | 24 px, como en Claude Design | Claude Design `MovilMas.dc.html` |
| Pulsar: solo `scale(.97)` | `scale(.97)` en el ítem, el icono baja 1 px y aparece la capa `--state-press` en los inactivos | emil › *Buttons must feel responsive* (icono ≤ 2 px según el encargo) |
| Pestañas sin hover | El color de la pestaña inactiva pasa a `--text`, solo con puntero fino | emil › *Touch device hover states* |
| **Ajustes y Tareas en móvil: lo último quedaba debajo de la barra** | Hay un espaciador `.route-view::after` con la altura de la barra y el área segura (`--tabbar-space`). **Antes:** el botón final de Ajustes acababa en 812 px y la barra empieza en 756 px, así que quedaban 56 px tapados. **Después:** acaba en 724 px, con 32 px de aire (medido a 390×844) | apple `layout.md` › *Guides and safe areas*. Causa: `.route-view` se encoge al alto del contenedor de scroll (el chat lo necesita), así que el `padding-bottom` de `.workspace-main` quedaba detrás del contenido desbordado y no debajo |
| Barra lateral en móvil horizontal (844×390): unos 468 px de alto (calculado) en 390 px, con scroll | Con poca altura (≤ 480 px) se ajustan los márgenes y se quita el logo (repite Inicio). Ahora cabe sin scroll | apple `layout.md` › *Layout follows available space*; `sidebars.md` › *Avoid putting critical … at the bottom* (Ajustes quedaba fuera) |
| La barra lateral y la inferior ignoraban el área segura lateral (`viewport-fit=cover`) | `--safe-left` y `--safe-right` en el padding de la barra lateral, el raíl y la barra inferior | apple `layout.md` › *Guides and safe areas* |
| `--translucent` claro al 88 % (Claude Design) | Al 90 %. Peor caso, con texto oscuro justo debajo de la barra (sin contar el desenfoque): la pestaña inactiva pasa de 4,47:1 a 4,68:1 y la activa de 4,41:1 a 4,60:1. **Se aparta de Claude Design** por accesibilidad | apple `accessibility.md` › *color contrast minimum* |
| «Más»: filas con hover y `scale(.97)` | Pulsado con `scale(.98)`, como en Claude Design MovilMas (en una fila ancha, .97 la despega de los bordes del grupo), más la capa `--state-press` | emil › *Buttons must feel responsive* (0,95-0,98); Claude Design manda |
| «Más»: la flecha no reaccionaba | La flecha se desplaza 2 px con el hover (120 ms, `--ease`). No ocurre con movimiento reducido ni en pantallas táctiles | emil › *Touch device hover states*, *prefers-reduced-motion* |
| «Más»: el anillo de foco quedaba recortado por `overflow: hidden` del grupo | Anillo hacia dentro (`outline-offset: -2px`) y redondeado | apple `accessibility.md`: foco visible |
| `contrast.mjs` no medía la navegación | Pares nuevos: inactivo sobre el panel, activo sobre la píldora encima del panel, y pestaña inactiva y activa sobre la barra translúcida. Hay un quinto campo opcional, la capa base | Regla del encargo: revisar el contraste con el script |

**Estados por ítem:**
- **Reposo:** Claude Design.
- **Hover:** `--nav-hover`, fundido de 160 ms, solo con puntero fino.
- **Pulsado:** `scale(.97)`, icono +1 px y `--state-press`.
- **Foco:** anillo de 2 px, sin animación.
- **Activo:** píldora, color tintado, peso 600 y `aria-current`.
- **Desactivado:** no aplica. La navegación nunca se desactiva (apple `tab-bars.md` › *Don't disable or hide tab bar buttons*).

## Contraste (`node scripts/design/contrast.mjs`)

| Par | Claro | Oscuro |
| --- | --- | --- |
| Inactivo (`--text`) sobre el panel | 18,32:1 | 15,00:1 |
| Activo (`--primary-ink-tint`) sobre la píldora y el panel | 5,29:1 | 6,74:1 |
| Pestaña inactiva (`--text-secondary`) sobre la barra translúcida | 5,81:1 | 7,45:1 |
| Pestaña activa sobre la píldora y la barra | 5,65:1 | 7,29:1 |
| Peor caso de la barra, con texto debajo y sin desenfoque (calculado aparte) | 4,68:1 y 4,60:1 | 5,24:1 y 5,02:1 |

## Evidencia

**Capturas después** (390 px en móvil y 720 px en escritorio, claro y oscuro). Las de antes están en `../antes/`.
- `inicio-*`, `tareas-*`, `ajustes-*` y `mas-*` (`mas` es una pantalla nueva en `design-fixture.ts`).
- Estados de la barra lateral: `escritorio-hover.webp`, `escritorio-pulsado.webp` y `escritorio-foco.webp`.
- Estados de «Más»: `mas-hover.webp`, con la flecha desplazada.
- Final del scroll de Ajustes: `ajustes-movil-final-scroll.webp` (390×844), `ajustes-final-360x740.webp`, `ajustes-final-430x932.webp` y `ajustes-final-844x390.webp`. «Cerrar sesión» queda siempre por encima de la barra.

**Grabaciones:**
- `../grabaciones/navegacion.webm` (1280×800, 0,9 MB): hover, pulsado y deslizamiento entre seis secciones; foco con teclado e Intro sin deslizamiento; flecha de «Más».
- `../grabaciones/navegacion-movil.webm` (390×844, 0,6 MB): toques en la barra inferior con la píldora en X, «Más» → Ajustes y scroll hasta el final.

**Fluidez:** con la CPU ralentizada ×4 y cuatro cambios de sección en la barra lateral hubo 137 fotogramas, ninguno de más de 34 ms (el máximo fue 33,4 ms). `long-animation-frame` dio 2 fotogramas de más de 50 ms: es el render de la página nueva, no la píldora, que va por el compositor.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | sin errores |
| `npm run lint` | 0 errores, 0 avisos |
| `npm run test` (incluye `design.test.ts`) | 57/57 |
| `npm run design:check` | 7/7 y contraste todo «ok» |
| `npm run build` | correcto. Solo sale el aviso de siempre «inferred your workspace root», que viene del worktree con dos `package-lock.json` y no es nuevo |
| Playwright `design.spec.ts` + `navegacion.spec.ts` | 39/39 |
| Playwright `dream.spec.ts` + `exams.spec.ts` | 14/14 |
| Playwright `observability.spec.ts` + `security.spec.ts` | 5/5 |

**`navegacion.spec.ts` (11 pruebas):**
- La píldora no se anima en la primera carga.
- Se desliza al cambiar de sección: arranca una transición de `transform` y el valor cambia.
- No hay saltos de diseño: las cajas de los ítems no se mueven.
- El activo no tiene doble fondo.
- Con movimiento reducido no hay transición de `transform`.
- Con teclado: el foco mide 2 px sólido e Intro navega sin deslizar.
- Estados de un ítem: hover, pulsado (`scale(.97)` e icono +1 px) y activo.
- Barra inferior: se desliza en X, no en Y, y no se anima al cargar.
- «Más» queda activa dentro de Ajustes.
- Filas de «Más»: la flecha se desplaza 2 px, el pulsado es `.98` y el foco va hacia dentro; con movimiento reducido no hay desplazamiento.
- A 360, 390, 430 y 844×390, el último elemento de Ajustes y Tareas queda por encima de la barra. Además, las pestañas miden al menos 44×44 con etiquetas de 11 px, y la barra lateral horizontal cabe sin scroll.

## Lo que no se pudo comprobar

- **Área segura real en un iPhone.** Playwright no emula `env(safe-area-inset-*)`. La fórmula se ha revisado a mano: con 34 px de inset abajo, la barra mide 88 px y el espaciador `max(88px, 60px + inset)` la cubre.
- **El desenfoque de fondo en Safari.** Solo se ha probado en Chromium.
