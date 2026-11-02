# Ruta de estudio · Entrega 0b: microinteracciones

Prompt de la ruta, 0.8, y lámina «Microinteracciones · las 24» de Claude Design.
Todo va detrás de `DREAM_STUDY_STEPS_ENABLED`, sobre la Entrega 0.

Grabaciones (Playwright, 390×844 y 1440×900, claro y oscuro):
`grabaciones/movil-claro.webm`, `movil-oscuro.webm`, `escritorio-claro.webm` y
`escritorio-oscuro.webm`. Cada una recorre, por orden: vuelta a la ruta, ficha,
hoja, pestañas, menú, ↓, gema, pregunta y salir.

Reglas comunes:
- Solo se animan `transform` y `opacity`. El diseño dibujaba el anillo de la
  gema con `stroke-dashoffset`, pero `design:check` no lo admite: entra girando
  60° con un fundido.
- Duraciones de 100 a 400 ms; `ease-out` fuerte (`--ease`).
- Nunca `scale(0)`; el hover va solo con ratón.
- Con movimiento reducido, quedan solo los fundidos (hay una prueba que lo
  comprueba).

## Tabla (0.8)

| # | Microinteracción | Disparador | Propiedad | Duración | Curva | Con movimiento reducido | emil-design-eng | apple-design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pulsar un botón | `:active` | `transform: scale(.97)` | 160 ms | `--ease` | sin escala | «Buttons must feel responsive» | `buttons.md` › press state |
| 2 | «Continuar» pasa a cargando en su sitio | pulsar mientras se crea el test | `opacity` del texto y del indicador; «Elige otra» a `.45` | 120 ms | `--ease` | el indicador late en vez de girar | Asymmetric timing; el botón no cambia de tamaño | `progress-indicators.md` › «Keep progress indicators moving» |
| 3 | Hoja inferior / diálogo / menú «⋯» | abrir | `transform` + `opacity`; el menú sale de su botón | 200 ms (cierre más rápido) | `--ease-drawer` / `--ease` | fundido | Popovers origin-aware; modales centrados | `sheets.md` › una hoja cada vez |
| 4 | «Preparando» con la Orb | — | — | — | — | — | — | Entrega 2 (generación de la lección) |
| 5 | Responder una pregunta | elegir respuesta | botones bloqueados mientras guarda | — | — | igual | Never animate keyboard-initiated actions | `feedback.md` |
| 6 | Aparece la corrección | comprobar (test de práctica) | `opacity` | 200 ms | `--ease` | fundido | Sin saltos de layout | `color.md` › nunca solo color (icono y texto) |
| 7 | Cambiar de pregunta | Siguiente/Anterior | tarjeta `translateX(±14px)` + `opacity`; barra `scaleX`; contador `opacity` | 220 / 250 / 150 ms | `--ease` | fundido; la barra salta sin animar | scaleX, nunca width | `progress-indicators.md` › consistent location |
| 8 | «Explícame por qué» | — | — | — | — | — | — | Entrega 2 |
| 9 | Salir a mitad | X | diálogo: `opacity` + `transform` | 200 ms | `--ease` | fundido | Modales centrados | `modality.md`: el progreso se guarda, así que solo se recuerda |
| 10 | Resultados | — | contador que ya existe | 600 ms, se puede saltar | — | valor final | — | Entregas 2 y 4 |
| 11 | Volver a la ruta | `?hecho=` | desplazamiento hasta la actual; la actual se enciende (`opacity` .35 → 1) | 250 ms | `--ease` | desplazamiento instantáneo, fundido | Explanation: muestra qué cambió | `layout.md` › sitio actual visible |
| 12 | Nodo actual | siempre | halo: solo `opacity` | bucle de 2,4 s | ease-in-out | sin bucle | Un único bucle; solo opacity | `motion.md` › Make motion optional |
| 13 | ↓ «Ir a la lección actual» | la actual sale de la vista | `opacity` + `translateY(8px)` | 150 ms | `--ease` | fundido | Nada aparece de la nada | `buttons.md` › 52 px |
| 14 | «A continuación» cambia | nueva lección actual | texto: `opacity` + `translateY(6px)` | 200 ms | `--ease` | fundido | «Continuar» no se mueve | — |
| 15 | Giro de tarjeta | — | — | — | — | — | — | Entrega 3 |
| 16 (lámina) | Ficha 3D al pulsar | `:active` | ficha `translateY(3px)`; al soltar, rebote | 100 ms / 280 ms | `--ease` / `cubic-bezier(.34,1.35,.64,1)` | sin hundimiento | Muelle con rebote suave (0,1–0,3) | `buttons.md` › press state |
| 17 (lámina) | Recorrer el camino | entrar en la ruta o desplegar | `opacity` + `translateY(8px)`, 40 ms entre nodos (máx. 4) | 260 ms | `--ease` | fundido | Escalonado de 30–80 ms | `motion.md` › brief |
| 18 (lámina) | Llegar a la gema | la gema entra en la vista | gema `scale(.94→1)` + `opacity`; anillo `rotate(-150°→-90°)` + `opacity` | 300 + 400 ms | `--ease` | fundido | Lo que no cambia no se anima; aquí explica que la preparación «se llena» | Delight ≠ decoración |
| 24 (lámina) | Pestañas Ruta / Progreso | cambiar de pestaña | fondo `translateX(100%)` | 220 ms | `--ease` | sin desplazamiento | Transición que se desliza | `segmented-controls` › estado claro |

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `ruta-pasos.spec.ts` (9): presupuesto, recorrido, hoja, menú, Progreso, movimiento reducido, botón que carga sin cambiar de tamaño (con anuncio), ↓ que aparece y trae la actual con el foco, pestaña que se desliza, gema que se dibuja | ✓ |
| Grabaciones de móvil y escritorio, en claro y oscuro | ✓ |
| 60 fps en un móvil modesto de verdad | ✗ no se ha podido comprobar aquí (solo Chromium de escritorio) |
| Lector de pantalla real | ✗ no comprobado; sí hay `role="status"` y `aria-busy` |
