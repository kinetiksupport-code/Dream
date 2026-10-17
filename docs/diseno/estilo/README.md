# Estilo nuevo y transiciones entre páginas (PR 1)

Encargo: `PROMPT_EXAMEN_ESTILO.md` de Carlos (17/10/2026), apartados 0, 2, 3, 6 y 12.1. Este PR deja la **base**: tokens, primitivas de movimiento y transiciones entre páginas. **No rediseña ninguna pantalla.** Las capturas de Inicio, Tareas, Exámenes y Ajustes salen idénticas píxel a píxel (solo cambia el saludo, que depende de la hora). El estilo nuevo se ve en el laboratorio `/estilo`.

## Referencias de estilo

Carlos pasó dos fotos de Threads. Son capturas de App Store de otro diseñador, vistas en la pantalla de un portátil. **No las subo al repositorio** porque son trabajo de otra persona. Tomo el estilo, no los personajes, textos ni composiciones.

- **Foto 1, azul:**
  - Fondo azul eléctrico casi plano, entre `#2B4FE0` y `#1E40D8`.
  - Titulares blancos enormes, en cursiva muy pesada, con una palabra subrayada a mano en amarillo.
  - Píldoras de asignatura apiladas, cada una de su color, con sombra inferior 3D y brillo.
  - Chapas escalopadas grandes con texto blanco pesado, en amarillo y en rojo.
  - Objetos 3D brillantes: un cerebro, un matraz, una pizarra.
- **Foto 2, amarilla y naranja:**
  - Fondos amarillo `#FFC21A` y naranja `#F05A1E` con una cuadrícula fina.
  - Titulares negros extra pesados.
  - Píldoras negras con un icono 3D a la izquierda.
  - Un lápiz 3D, un «+» azul en 3D y una mascota en una pegatina redonda con borde blanco grueso. En Dream, la mascota es el orbe.
  - Una tarjeta blanca de reproductor.

**Qué paso a Dream y cómo:**

| En la foto | En Dream | Dónde |
|---|---|---|
| Fondo saturado y plano por pantalla | Superficie `.pop` con un tono (`.tone-*`) | `app/globals.css` › Estilo nuevo |
| Cuadrícula fina | `.pop-grid` (`--grid-line`, `--grid-size`) | ídem |
| Titular enorme y pesado | `.hero-title` (`--text-hero` 40→72 px, Inter 800 en cursiva real) | ídem |
| Palabra subrayada a mano | `.marker` (trazo SVG en máscara, `--marker`); `.marker-draw` lo dibuja una vez | ídem |
| Chapas escalopadas o redondas con borde blanco y sombra | `<Sticker>` (`scalloped`, `round`, `pill`) | `components/sticker.tsx` |
| Píldoras 3D con sombra inferior y brillo | `.button-3d` + `.button-3d-face` | `app/globals.css` |
| Mascota | `<Orb breathing reaction>` (sin cambiar la forma ni los colores) | `components/orb.tsx` |
| Objetos 3D | **PR 2 y PR 6** (iconos y modelos) | — |

**Lo que no copio:**
- ~~La cursiva~~ **Actualizado el 17/10 (decisión de Carlos): los titulares `.hero-title` van en la cursiva real de Inter, peso 800** (`app/layout.tsx` › `interHero`, `next/font` con `latin` y `latin-ext`, `preload: false`). Solo se descarga en las páginas que pintan un `.hero-title`: 25,9 KB (woff2, latín básico, que cubre el español) y 39,2 KB más solo si aparece algún carácter de `latin-ext`. Nunca se sintetiza (`font-synthesis: none`). Con «Lectura fácil» (Lexend) el titular vuelve a ir recto.
- El texto blanco sobre amarillo o naranja: no pasa el contraste AA (1,62:1 y 3,39:1). Ahí el texto va en tinta oscura.

## Comprobación: View Transitions en Next.js

- `node_modules/next` es la versión **15.5.27**.
- `experimental.viewTransition` sigue siendo **experimental** (`config-shared.d.ts`: «Enables view transitions by using the unstable_ViewTransition Component»).
- `lib/needs-experimental-react.js` cambia toda la app a **React experimental** si se activa.
- El React estable que trae Next (`dist/compiled/react`) no exporta `ViewTransition`.

**Decisión:** un envoltorio propio sobre `document.startViewTransition`, con detección de soporte y una alternativa en CSS que solo usa `opacity` y `transform`.

## Auditoría previa (apartado 0.2)

### `app/globals.css` (3.703 líneas)

**Qué hay:**
- Tokens de color en claro y oscuro: `--primary #155BFF` y lima `--accent #C8F560`.
- Radios, sombras, tipografía y movimiento: `--ease`, `--ease-in-out`, `--ease-drawer`, `--dur-fast/press/base/rise`, `--stagger`.
- Primitivas `.press`, `.rise` y `.orb-pulsing`.
- El cambio de ruta era un fundido de 160 ms en `.route-view`.
- La View Transition del cambio de tema en Ajustes.

**Qué faltaba:**
- Paleta saturada.
- Titular enorme y subrayado a mano.
- Pegatinas.
- Botón 3D.
- Número animado.
- Hoja inferior que se arrastra.
- Estados del orbe: respirar, éxito y error.
- Transición con dirección.

**Problemas encontrados:**
- Los tokens oscuros están **duplicados** en `[data-theme=dark]` y en `prefers-color-scheme`. Ahora hay una prueba que comprueba que coinciden.
- Nada comprobaba qué propiedades animan los `@keyframes` ni el movimiento hecho desde scripts.

**Qué cambio:**
- Amplío los tokens, sin duplicar los que ya existían.
- Añado una sección «Estilo nuevo» al final del archivo.
- `.route-view` recibe `data-enter`.
- Las reglas de la View Transition de páginas solo actúan con `:root[data-page-transition]`, así que la del tema queda intacta. Durante una transición de página se le quita el nombre a `.segmented-theme`.

### `components/shell.tsx` (432 líneas)

**Qué hay:**
- Barra lateral, carril y barra de pestañas con `NavIndicator`.
- El contenido va en `.route-view` con `key={pathname}`, que hace el fundido.
- El scroll está en `.workspace-main`, no en la ventana.

**Qué faltaba:**
- La dirección de la transición.
- Restaurar el scroll al volver. Antes, al pulsar Atrás, la página quedaba arriba del todo (comprobado: 400 px → 0).

**Qué cambio:**
- Una llamada a `usePageTransitions(pathname, search)`.
- El atributo `data-enter` en `.route-view`.
- Nada más: `Link`, `replace`, `scroll` y el prefetch siguen igual.

## Transiciones entre páginas

Archivos: `lib/page-transition.ts` (reglas puras y probadas), `components/page-transitions.ts` (navegador) y `app/globals.css` › «Transiciones entre páginas».

- **Al pulsar un enlace interno dentro del Shell**, empieza una View Transition, solo en la zona de página (`view-transition-name: page`). La barra lateral y la de pestañas no se mueven.
  - Se espera a que llegue la ruta nueva, como mucho `VT_MAX_WAIT_MS` = 300 ms. Si tarda más, se salta la animación y la página entra con CSS.
  - No se llama a `preventDefault`: navega `next/link`, como siempre.
- **Dirección:**
  - `forward`: entrar en un detalle, de Más a una sección o de Inicio a una conversación. La página entra desde la derecha, 24 px.
  - `back`: lo contrario. Entra desde la izquierda.
  - `lateral`: pestañas y secciones hermanas. Sube 8 px y funde.
  - Con el botón Atrás del navegador, la dirección siempre se invierte (Navigation API; sin ella, se asume Atrás).
- **Tiempos:** entrada de 240 ms con `--ease`; salida de 160 ms. Solo `transform` y `opacity`, y `mix-blend-mode: normal` para que no haya destellos en oscuro.
- **Atrás y Adelante del navegador:** nunca esperan. La página nueva entra con la animación CSS en la dirección correcta. Si el navegador ya anima el gesto de volver (`hasUAVisualTransition`), no se añade nada.
- **Scroll:** se guarda la posición de `.workspace-main` por entrada del historial, solo en memoria, y se restaura al volver. Antes no se restauraba.
- **Sin View Transitions:** se usa la misma animación CSS al montar la página.
- **Movimiento reducido:** solo un fundido de 120 ms.
- **Excluir un enlace:** `data-transition="off"`. Sirve para enlaces que abren una confirmación en vez de navegar.

**Rendimiento** (Chromium con la CPU ralentizada 4×, como un móvil medio, a 390 px):
- Atrás con CSS: 84 fotogramas y ninguno de más de 34 ms.
- Con View Transition: un solo hueco de 133–167 ms. Es la pausa de pintado mientras llega la ruta nueva (como mucho 300 ms). Después, la animación va fluida.

## Tokens nuevos (`app/globals.css`, claro + los dos bloques oscuros)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--pop-blue` / `--on-pop-blue` | `#1e40d8` / `#fff` (7,55:1) | `#1a37b8` / `#fff` (9,20:1) | Fondo azul eléctrico |
| `--pop-yellow` / `--on-pop-yellow` | `#ffc21a` / `#080b14` (12,15:1) | `#e8a90c` / `#080b14` (9,47:1) | Amarillo, tinta oscura |
| `--pop-orange` / `--on-pop-orange` | `#f05a1e` / `#080b14` (5,79:1) | `#d9501a` / `#080b14` (4,79:1) | Naranja, tinta oscura |
| `--pop-red` / `--on-pop-red` | `#d42a1f` / `#fff` (5,06:1) | `#b3261e` / `#fff` (6,54:1) | Rojo |
| `--pop-purple` / `--on-pop-purple` | `#6d3ae0` / `#fff` (6,30:1) | `#5b2fc4` / `#fff` (7,93:1) | Morado |
| `--pop-green` / `--on-pop-green` | `#17803f` / `#fff` (5,00:1) | `#146c35` / `#fff` (6,51:1) | Verde |
| `--pop-lime` / `--on-pop-lime` | `#c8f560` / `#080b14` (15,62:1) | `#b5e04f` / `#080b14` (12,86:1) | Lima de marca como relleno |
| `--marker` | `#ffc21a` | `#f5b800` | Subrayado a mano (decorativo) |
| `--sticker-ring`, `--shadow-sticker` | `#fff`, sombra suave | `#e8ecf4`, sombra más densa | Pegatinas |
| `--gloss`, `--depth-3d` (4px) | brillo interior | brillo más tenue | Botón 3D |
| `--grid-line`, `--grid-size` (24px) | 7 % tinta | 7 % blanco | Cuadrícula |
| `--radius-hero` (32px), `--radius-pill` (999px) | | | Radios |
| `--text-hero`, `--weight-hero` (800), `--leading-hero` (1.02), `--tracking-hero` (−0,035em) | | | Titular enorme |
| `--dur-page` 240ms, `--dur-page-out` 160ms, `--dur-page-reduced` 120ms, `--page-shift` 24px, `--page-rise` 8px | | | Transiciones de página |
| `--dur-number` 200ms, `--dur-spring` 250ms, `--dur-breathe` 4.8s, `--ease-spring` (`linear()`, ~6 % de rebote) | | | Números, rebote suave, orbe |

Se reutilizan sin duplicar: `--ease`, `--ease-in-out`, `--ease-drawer`, `--dur-fast/press/base/rise`, `--stagger`, `--primary` y `--accent`.

**Foco sobre los fondos `.pop`:** el anillo usa el color del texto de ese fondo (`--focus: var(--on-tone)`), que ya pasa 4,5:1. Con el anillo azul global, el foco no se vería sobre azul ni sobre amarillo en oscuro (1,20:1).

## Primitivas nuevas

| Nombre | Archivo | Uso |
|---|---|---|
| `.tone-{blue,yellow,orange,red,purple,green,lime}` | `app/globals.css` | Define `--tone` y `--on-tone`; lo leen `.pop`, `.sticker` y `.button-3d` |
| `.pop`, `.pop-grid` | ídem | Pantalla o panel saturado y cuadrícula |
| `.hero-title`, `.marker`, `.marker-draw` | ídem | Titular enorme con una palabra subrayada a mano |
| `.button-3d` > `.button-3d-face` | ídem | Botón píldora con relieve; al pulsar, la cara baja 3 px |
| `.stagger` | ídem | Hijos que entran escalonados (`--stagger`, máximo 8). Para filas que llegan después sigue estando `staggerDelay()` (`components/test-experience.tsx`) |
| `.pop-in` | ídem | Entrada de pegatinas y chips desde 0,9 con el muelle suave |
| `.press` (ya existía) | ídem | Escala a 0,97 al pulsar |
| `.progress-track > i` (ya existía) | ídem | Barra de progreso con `scaleX` |
| `<Sticker tone shape size tilt animate>` | `components/sticker.tsx` | Pegatina escalopada, redonda o píldora |
| `<AnimatedNumber value decimals format label>` | `components/animated-number.tsx` | Número que sube o baja (cuenta atrás, nota, porcentajes) y que el lector de pantalla lee una sola vez |
| `<BottomSheet labelledBy onClose>` | `components/bottom-sheet.tsx` | Hoja inferior sobre `Modal`. En móvil sube con la curva del cajón y se cierra al arrastrarla o con un golpe rápido (velocidad > 0,11 px/ms). En escritorio es el diálogo centrado de siempre |
| `<Orb breathing reaction reactionKey>` | `components/orb.tsx` | Respira en reposo, salta con un acierto y tiembla con un fallo. Solo `transform`; `pulsing` sigue igual |
| `usePageTransitions()` | `components/page-transitions.ts` | Lo usa el Shell; los pasos del asistente (PR 3) pueden usar los mismos `data-enter` y keyframes `page-enter-*` |
| `routeDirection`, `routeKey`, `linkTarget`, `VT_MAX_WAIT_MS` | `lib/page-transition.ts` | Reglas de dirección (puras) |
| `formatNumber`, `rollDirection`, `shouldDismiss`, `dragOffset`, `scallopPath`, `DISMISS_VELOCITY` | `lib/motion.ts` | Lógica pura de las primitivas |
| `Modal` › `className` | `components/modal.tsx` | Nueva prop opcional |

**Laboratorio:** `app/estilo/page.tsx` y `components/style-lab.tsx`.
- Solo existe si el servidor arranca con `DREAM_STYLE_LAB=1`. En producción devuelve 404 y lleva `noindex`.
- Ninguna parte de la app enlaza a él.

## Comprobaciones automáticas nuevas

- **`tests/design.test.ts`:**
  - Los `@keyframes` solo animan `transform` y `opacity`.
  - Todo `animation-name` usado existe.
  - Ningún script anima `all` ni propiedades de layout, ni en estilos en línea ni con `element.animate()`.
  - Los tokens oscuros coinciden en los dos bloques.
  - Existen los tokens nuevos.
  - Las páginas entran en 200–280 ms, salen más rápido y con movimiento reducido tardan 150 ms o menos.
  - He comprobado que fallan si se introduce una infracción.
- **`scripts/design/contrast.mjs`:** 7 pares nuevos de texto sobre fondo pop, más blanco sobre azul. En total, 66 pares que pasan en claro y oscuro.
- **`tests/page-transition.test.ts` y `tests/motion.test.ts`:** la lógica pura.
- **`tests/browser/transiciones.spec.ts`:**
  - La View Transition corta de un enlace.
  - El detalle entra desde la derecha y Atrás invierte la dirección.
  - El botón Atrás funciona y el scroll se restaura.
  - Con movimiento reducido solo hay fundido.
  - Sin View Transitions, la animación CSS.
  - Con `GRABAR=<carpeta>`, la grabación.
- **`tests/browser/estilo.spec.ts`:** el número animado, el orbe, la hoja (gesto de cerrar y vuelta a su sitio), el movimiento reducido, las capturas y la grabación.

## Evidencia

| Qué | Antes | Después |
|---|---|---|
| Inicio, Tareas, Exámenes, Ajustes (390 y 1440 px, claro y oscuro) | `antes/*.webp` | `despues/*.webp` (idénticas salvo el saludo por la hora) |
| Laboratorio de estilo (390 y 1280 px, claro y oscuro, reducido, hoja) | — | `despues/estilo-*.webp` |
| Navegación entre páginas | `../grabaciones/transiciones-antes-{escritorio,movil}.webm` | `../grabaciones/transiciones-{escritorio,movil}.webm` |
| Primitivas (número, orbe, botón 3D, lista, hoja) | — | `../grabaciones/estilo-primitivas.webm` |

**No se ha podido comprobar:**
- Un móvil real. La vibración, el gesto de volver de iOS y Safari se han simulado con Chromium.
- Un lector de pantalla real. Sí se comprueba el texto oculto del número.

## Para Carlos

1. ~~¿Titulares en cursiva pesada?~~ Decidido: sí (17/10). Hecho en este PR, ver «Lo que no copio».
2. Paleta: ¿te valen el amarillo `#FFC21A` y el naranja `#F05A1E` con texto oscuro? El texto blanco sobre ellos no pasa AA.
3. ¿Qué color de fondo dominante quieres en cada pantalla clave? Por ejemplo: Exámenes en azul, el asistente en amarillo y «listo» en morado. Lo aplico en los PR siguientes.
