# Microinteracciones y botones «tipo Knowunity» (prompt de la ruta, 0.11 y 0.12)

> **Aviso importante.** El vídeo `referencias-estilo/ruta-estudio/knowunity/video-knowunity-completo.webm` y sus tiras **no están en el repositorio ni en el Dropbox conectado** (búsqueda del 3-nov-2026). No he podido mirarlo ni sacar tiras propias. Esta tabla parte de lo que Carlos midió en el 0.12 (tiempos y duraciones del vídeo), aplicado con las reglas de `emil-design-eng` y `apple-design`. **Falta la comparación lado a lado con el vídeo**: en cuanto el vídeo esté en `referencias-estilo/ruta-estudio/knowunity/`, se sacan las tiras (`ffmpeg … tile=5x6`) y se corrige lo que no se parezca.

Capturas de lo implementado (móvil y escritorio, claro y oscuro): `docs/diseno/ruta-knowunity/`.

| # | Momento | Qué se mueve, de qué a qué | Duración y curva | Dónde | Regla de `emil-design-eng` | Regla de `apple-design` |
|---|---|---|---|---|---|---|
| 1 | Pasar el ratón por una respuesta | El fondo se aclara un tono (`--card` → `--chip-hover`); sin borde nuevo ni escala | 120 ms `ease` (color) | `quiz-question.module.css › .option:hover`, solo con `(hover: hover) and (pointer: fine)` | El hover es una pista, no un evento: corto y solo con ratón | Pointer feedback; en táctil no hay hover, solo `:active` |
| 2 | Elegir una respuesta | La elegida se queda clara y con **contorno de 2 px** (no solo color) y `aria-checked`; elegir otra mueve la selección | 120 ms (color/borde) | `.option[data-picked]`, `role="radio"` | El estado seleccionado no depende de un único canal | Selection state visible; accesibilidad (no solo color) |
| 3 | «Comprobar» se activa | De gris con texto gris (`aria-disabled`, sin hover) a azul relleno | 120-150 ms (color) | `.check:not([data-ready])` | Los estados del botón cambian el color, no la forma | Disabled vs. enabled clearly distinguishable |
| 4 | Pulsar «Comprobar» | «Comprobar» desaparece; la pregunta sube 24 px (`translateY`); correcta → verde oscuro con texto verde claro y ✓; mal elegida → rojo oscuro con texto rosa y ✕, más un saltito de 4 px; el resto a 40 % de opacidad | 180 ms `--ease` (transform); 150 ms (opacity); saltito 160 ms (una vez) | `.question[data-checked]`, `.option[data-right/wrong/dim]`, `@keyframes hop` | Animar solo `transform`/`opacity`; un saltito comunica el error sin castigar | Icono + texto + color; nada de rojo de fondo por una nota |
| 5 | Sube la hoja de corrección | Hoja a todo lo ancho, verde o roja, `translateY(100% → 0)`, con tirador, icono + «¡Genial!»/«Incorrecto», pulgares y dos botones | 400 ms `cubic-bezier(.32,.72,0,1)` (`--ease-drawer`) | `.sheet`, `role="status"` en la cabecera | Las hojas usan la curva de cajón; ≤ 400 ms | Sheets: arrastre visible (tirador), resultado anunciado |
| 6 | Botones de la hoja | «¿Por qué?»: píldora oscura translúcida, texto blanco. «Continuar» (menta) / «Entendido» (coral): píldora gruesa con **labio inferior de 3 px**; al pulsar baja 2 px y el labio se aplasta a 1 px | 80 ms `--ease` (transform); el labio cambia sin animar | `.why`, `.next`, `:active` | El pulsado se siente físico; nada de rebotes largos | Botones ≥ 44 px (aquí 50 px), esquinas completas, foco visible |
| 7 | Siguiente pregunta | La hoja desaparece y la siguiente pregunta entra con un fundido; la barra crece (`scaleX`, origen izquierda); foco al primer botón de respuesta | Fundido 150 ms; barra 250 ms `--ease` | `@keyframes qIn`, `.fill` | Fundido cruzado corto entre pasos | Focus moves to the new content |
| 8 | Panel «¿Por qué?» | Escritorio: panel a la derecha (≈ 1/3) `translateX(100% → 0)` y la lección se aparta a la izquierda con `translateX(-17vw)` (no se anima `width`). Móvil: pantalla completa. Dentro, el chat de Dream con la pregunta ya escrita | 200 ms `--ease` | `why-panel.module.css`, `step-frame.module.css › [data-shifted]` | Nunca animar `width`; mover con `transform` | Panel lateral no modal en escritorio; Esc cierra; el foco vuelve |
| 9 | La Orb «parpadea» | Un pulso de brillo (opacidad 1 → 0,55 → 1) cada 6 s; además respira (`breathing`) | ~240 ms dentro de un bucle de 6 s | `.orb › @keyframes blink` | Bucles lentos y apagables | Se detiene con `prefers-reduced-motion` |
| 10 | Tarjeta «Qué saber» → «Empezar test» | Fundido entre tarjetas; el botón principal **no se mueve**, solo cambia el texto («Continuar» → «Empezar test»); donde estaba «Saltar» aparece la flecha atrás; la barra de progreso aparece al empezar el test | Fundido ~150 ms; barra `opacity` 150 ms | `lesson-flow.tsx` (lectura), `.bar[data-hidden]` | Mantener la posición de la acción principal | Consistencia espacial del botón principal |
| 11 | Pregunta que vuelve: «ERROR ANTERIOR» | Etiqueta roja pequeña con icono encima de la Orb; su hueco está **siempre reservado** (no salta la maquetación) | Fundido 120 ms | `.retry[data-on]` | Sin saltos de maquetación | Icono + texto, no solo color |
| 12 | Resultados | Orb grande, titular, **dos pastillas con borde de color** (aciertos en verde, tiempo en azul; **sin XP**), «Repetir» y «Continuar»; entrada escalonada | 220 ms por elemento, 40 ms de escalón, `opacity` + `translateY(6px)` | `lesson-flow.module.css › .results > *` | Escalonar poco (40 ms) | Jerarquía clara, una acción principal |
| 13 | Volver a la ruta | Cambio de pantalla corto; el camino se desplaza al nodo actual y la siguiente lección se enciende | Fundido de página (200-280 ms, ya existente); `lightUp` 250 ms | `study-route.module.css` (0.8 · 11) | — | — |
| 14 | Estados de nodo en la ruta | Hecho = pieza clara; actual = anillo de progreso coloreado (lo hecho de su sección) que entra girando con un fundido; bloqueado = atenuado; desplazados a izquierda/derecha en curva suave; secciones por tema con barra y separadores | Anillo 280 ms `--ease` (rotate + opacity; el `stroke-dashoffset` es fijo) | `.ring`, `.sectionBar`, `.sep` | El progreso se anima con `transform`, no con propiedades de pintado | Agrupar por secciones con encabezado |
| 15 | Avisos | El aviso de «no aprobado» va en el texto de resultados (`role="status"`), no en un toast flotante | — | `lesson-flow.tsx` | Menos movimiento si el mensaje ya tiene sitio | Status anunciado |

## Reglas comunes (comprobadas con `npm run design:check`)

- Solo `transform` y `opacity` para el movimiento; el color solo en estados de botón y respuesta (100-150 ms). Nunca `width`, `height`, `top` ni `left`.
- 120-250 ms para lo que toca el usuario; hasta 400 ms la hoja inferior.
- Hover solo con `(hover: hover) and (pointer: fine)`; en táctil, `:active`.
- `prefers-reduced-motion`: la hoja pasa a un fundido de 100 ms, sin saltito, sin subir la pregunta y sin parpadeo de la Orb (prueba `leccion.spec.ts › movimiento reducido`).
- Tras «Comprobar» se bloquean las respuestas y el botón, pero la X y el teclado siguen. Teclado: **1-4** eligen, **Intro** comprueba y continúa, **Esc** abre «¿Salir?» (o cierra el panel «¿Por qué?»).
- Un único botón relleno por pantalla (en la hoja, «Continuar»/«Entendido»).

## Pendiente

- **Comparación con el vídeo** (tiras propias al lado de las del vídeo, filas 1-8 y 10-12): necesita el vídeo.
- Selección de texto en el panel «¿Por qué?» con «Pregunta más / Explicar»: no está; hoy el panel es el chat de la unidad con la pregunta ya escrita.
- «¿Por qué?» usa el chat de la unidad, que hoy **sí cuenta** en la ventana de 5 h (`docs/MODOS_IA.md`). El 0.11 · 6 pide que no cuente: hace falta un cambio en dream-api que no he hecho sin tu OK.
