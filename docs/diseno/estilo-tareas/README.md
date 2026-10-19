# Estilo nuevo en Tareas (PR 7, `PROMPT_EXAMEN_ESTILO.md` §2.3, §6 y §10)

Tareas es una lista de trabajo, no una pantalla clave. Por eso queda **sobria, con toques de color**: sin fondo saturado ni titular gigante. Todo el CSS nuevo está en una sección delimitada al final de `components/tasks-view.module.css` (`=== Estilo nuevo · Tareas ===`). No toca `app/globals.css` ni los tokens.

## Qué cambia

| Antes | Después | Por qué |
|---|---|---|
| Panel «Resolver un ejercicio» con radio 24 px | Radio 32 px (`--radius-hero`) y una **pegatina redonda amarilla con un lápiz**, girada 8°, con borde blanco y sombra suave. Entra con `pop-in` (desde 0,9, 250 ms) | Pegatinas y objetos de las referencias, con una sola pegatina en la pantalla. Es decorativa (`aria-hidden`). Lápiz con tinta oscura: 12,15:1 en claro y 9,47:1 en oscuro. En el móvil no se ve, porque allí el panel no existe (solo quedan los botones). |
| «Hacer foto» plano | Con brillo arriba y una base más oscura de 3 px (`--gloss`). Lo mismo en «Preparar un examen» del estado vacío | Botón 3D de las referencias en la acción principal. Sigue con `.press` (0,97). |
| Las filas pendientes aparecían todas a la vez | Suben una tras otra con la clase global `.stagger`: 40 ms entre filas, 8 como máximo y 240 ms cada una | emil-design-eng › Stagger. No bloquea: se puede marcar una tarea mientras entran. Con movimiento reducido, solo fundido. |
| Tick de la casilla con ease-out, 160 ms | Rebote suave (`--ease-spring`, 250 ms) desde 0,9 | El momento de «hecho» merece un poco de vida. Nunca empieza desde `scale(0)`. Con movimiento reducido, solo opacidad. |
| Casillas con radio 6 px | 8 px | Formas más redondas. |
| «Resolver con Dream» con radio 12 px | Píldora | Formas del estilo nuevo, sin mover el texto (la prueba de alineación sigue pasando). |
| «Lo tienes todo al día.» con un tick verde suelto | Pegatina lima pequeña con el tick en tinta oscura (15,62:1 y 12,86:1) | El lima de marca se usa solo para progreso y aciertos. |
| «Aún no tienes tareas» | «tareas» con el subrayado a mano (`.marker`), con el mismo tamaño | Rasgo del estilo nuevo sin letra gigante. El texto no cambia. |

**Marcado:**
- El lápiz es un SVG en línea. Con el icono de `lucide-react`, `/tasks` pasaba de 4,92 a 6,64 kB; así se queda en 5,1 kB.
- La clase `stagger` en la lista de pendientes.
- Un `<span>` para la pegatina lima.
- El `.marker`.

No cambian los textos ni el comportamiento: la ventana de «Deshacer», el guardado y los errores siguen igual.

## Skills aplicadas

- **emil-design-eng:**
  - Pulsación 0,97 (`.press`).
  - Hover solo con puntero fino (sin cambios).
  - Escalonado de 40 ms.
  - Muelle suave solo en el tick.
  - Nada desde `scale(0)`.
  - Solo `transform` y `opacity`.
- **apple-design:**
  - `color.md`: amarillo = acción de resolver y lima = todo al día, siempre junto a su texto.
  - `accessibility.md`: contraste medido y objetivos de 44 px intactos.
  - `branding.md`: una pegatina por pantalla.
  - `dark-mode.md`: los tokens oscuros.
- **libraries-dev:** no hay esperas largas en esta pantalla y no se añade ningún efecto.

## Evidencia

- **Capturas** (390 y 1280 px, claro y oscuro, y reducido): `antes/` y `despues/`.
- **Generador:**
  ```
  CAPTURAS_DIR=<dir> ESTILO_PANTALLAS=tareas npx playwright test tests/browser/estilo-capturas.spec.ts
  ```
- **Pruebas:** `tests/browser/tareas.spec.ts` › «estilo: …»:
  - la pegatina (color, tinta, oculta en el móvil);
  - el escalonado (0, 40 y 80 ms);
  - píldora y anillo de foco;
  - el muelle del tick;
  - la pegatina lima;
  - el fundido con movimiento reducido.
