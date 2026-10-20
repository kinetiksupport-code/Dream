# Progreso con el estilo nuevo (PR 7 del encargo de estilo)

Encargo: `PROMPT_EXAMEN_ESTILO.md`, apartados 2, 6 y 10, más las decisiones de Carlos del 17/10:
- Titulares en la cursiva pesada de Inter 800, solo con `.hero-title`.
- Amarillo `#FFC21A` y naranja `#F05A1E`, siempre con texto oscuro.
- Fondos saturados solo en las pantallas clave.
- Legible en todas partes.

Base: `design/asistente-examen` (PR #35), que ya trae los tokens `--pop-*`, `.tone-*`, `.hero-title`, `.stagger` y `<AnimatedNumber>` del PR #33.

## Decisión: pantalla sobria con toques de color

Progreso es una pantalla de datos que se lee con calma. **No lleva fondo saturado.** El estilo se nota en estos puntos:
- El titular.
- Una franja de color en cada cifra clave.
- Las chapas amarillas de errores frecuentes.
- El movimiento.

Las tarjetas, el texto y las gráficas siguen sobre las superficies de siempre, en claro y en oscuro.

**No cambia nada de comportamiento ni de texto.** Los datos, los cálculos, las pestañas, los enlaces y los mensajes son los mismos.

## Antes | Después | Por qué

| Antes | Después | Por qué |
|---|---|---|
| `h1.title` «Progreso» de 28 px | `.hero-title` (Inter 800 cursiva, `--text-hero`) con la palabra subrayada a mano (`.marker.marker-draw`); el trazo se dibuja una vez | Decisión de Carlos (titulares pesados en cursiva) y §2 «palabra clave subrayada». El subrayado es decorativo y no necesita par de contraste |
| Cifras clave en peso 700, fijas | Peso 800 y `<AnimatedNumber>` que sube desde 0 al aparecer (preparación, temas en el objetivo, días, actividades, previsión, media, mejor, último, cambio, ritmo, unidades pendientes y minutos) | §6 «cambio de números con animación corta». El lector de pantalla lee el valor una sola vez (texto oculto) |
| Anillo dibujado de golpe | El arco entra girando 60° con fundido, 250 ms, `--ease` | Solo `transform` y `opacity`; no se anima `stroke-dasharray` (emil-design-eng › *Only animate transform and opacity*) |
| Barras con `width: N%` | La barra ocupa el 100 % y se escala con `scaleX(N/100)`; al aparecer crece desde la izquierda (240 ms) y, si cambia el valor, se mueve con `--ease-in-out` | §6 «barras que se rellenan con transform». `progress-indicators.md`: «Progress bars include a track that fills from the leading side to the trailing side» |
| Columnas de notas con `height` fija | La misma altura, pero cada columna crece desde el eje (`scaleY`) con 40 ms de escalonado, máximo 8 | §6 «aparición escalonada 30–50 ms, máximo 8» |
| Barras semanales con `width` | `scaleX` con escalonado, máximo 8 | ídem |
| Pestaña elegida con fondo propio que salta | Una píldora que se desliza bajo la pestaña (`translateX`, 200 ms) | emil-design-eng › *Spatial consistency*. `segmented-controls.md`: «clearly show their selection state» |
| Tarjetas de cada pestaña que aparecen de golpe | `.stagger` en las cifras clave y en las tarjetas (40 ms, máximo 8) | §6. Es decorativo y nunca bloquea: los controles se pueden usar desde el primer fotograma (emil-design-eng › *Stagger*) |
| Cifras clave sobre `--bg`, sin color | Franja superior amarilla, naranja y azul (`--pop-yellow`, `--pop-orange`, `--pop-blue`) con `box-shadow` interior | «Toques de color» en una pantalla sobria. Es decorativa: el dato va en texto |
| Chapas de errores frecuentes en gris | Píldora amarilla `--pop-yellow` con tinta `--on-pop-yellow` (12,15:1 en claro y 9,47:1 en oscuro) | Decisión de Carlos: amarillo siempre con texto oscuro. AA medido en `scripts/design/contrast.mjs` |
| Filas de resultados sin pulsación | `.press` (escala 0,97 en `:active`, 160 ms) | emil-design-eng › *Buttons must feel responsive* |
| Hover de pestañas y «¿Cómo se calcula?» sin estado | Cambio de color solo con `@media (hover: hover) and (pointer: fine)` | emil-design-eng › *Touch device hover states* |
| Foco | Se mantiene el anillo global `:focus-visible` (2 px, `--focus`) en las pestañas, las filas y el panel | `accessibility.md`; comprobado en `progreso-estilo.spec.ts` |
| Movimiento reducido: solo se quitaba la transición de las barras | Anillo, barras y columnas solo funden (120 ms); la píldora salta sin deslizarse; los números y las tarjetas funden (`.stagger` y `.num-roll` ya lo hacen) | `motion.md › Make motion optional` y §6 |

## Archivos

- `components/progress/progress-view.tsx`: `CountUp` (envuelve `AnimatedNumber`), la píldora de las pestañas, las barras con `scaleX`, el `--i` del escalonado y `.press` en las filas.
- `components/progress/progress.module.css`: todo el estilo de la pantalla. **No se toca `app/globals.css` ni se añaden tokens.**
- `tests/browser/progress-fixture.ts`: los datos de prueba de Progreso, sacados de `progress.spec.ts` sin cambiarlos, para compartirlos con las capturas.
- `tests/browser/progress.spec.ts`: solo cambian dos selectores. «1 de 3» y «14 días» ahora se buscan en su `<dd>`, porque el número animado tiene una copia oculta para el lector de pantalla y otra visible.
- `tests/browser/progreso-estilo.spec.ts` (nuevo):
  - las barras se rellenan con `transform`, al 95 % exacto;
  - el número llega a «52 %» y se lee una vez;
  - todas las animaciones son de `transform` u `opacity`;
  - el escalonado va de 40 en 40 ms;
  - la píldora queda bajo la pestaña;
  - el foco es visible;
  - con movimiento reducido no se mueve nada.
- `tests/browser/progreso-capturas.spec.ts` y `tests/browser/full-shot.ts`: capturas y grabación (solo con `CAPTURAS_DIR` o `GRABAR`). El scroll de la app vive en `.workspace-main`, así que `fullShot` agranda la ventana para capturar la página entera.

## Evidencia

- Antes: `antes/progreso-{preparacion,simulacros,ritmo}-{movil,escritorio}-{claro,oscuro}.webp`, `antes/progreso-vacio-movil-claro.webp`, `antes/progreso-reducido-*.webp`.
- Después: los mismos nombres en `despues/`.
- Movimiento reducido: `despues/progreso-reducido-60ms-movil-claro.webp` es una captura a los 60 ms de cargar. Todo está ya en su sitio, solo fundido.
- Grabación (1280×800, 9 s): `../grabaciones/estilo-progreso.webm`. Muestra los números, las barras, el escalonado, la píldora y la pulsación de una fila.
- Capturas a 390 px (móvil) y 1280 px (escritorio), WebP de 390 y 720 px de ancho.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| `npx eslint . --ignore-pattern ".claude/**" --max-warnings 0` | 0 errores, 0 avisos |
| `npm test` | 215 de 215 |
| `npm run design:check` | 13 de 13 y todos los pares de contraste AA |
| `npx next build` | correcto |
| Playwright: `progress`, `progreso-estilo`, `design`, `estilo`, `navegacion` | 57 pasan; 12 se saltan porque necesitan `DREAM_STYLE_LAB=1`, `CAPTURAS_DIR` o `GRABAR` |

**Tamaño:** `/progress` pasa de 15,2 kB a 16,1 kB (primera carga de 177 kB a 178 kB) por `AnimatedNumber`. El JS compartido no cambia (108 kB).

**No comprobado:** un móvil real y un lector de pantalla real.
