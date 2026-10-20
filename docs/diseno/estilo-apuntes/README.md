# Estilo nuevo en Apuntes (PR 7, `PROMPT_EXAMEN_ESTILO.md` §2.3, §6 y §10)

Los apuntes se leen durante mucho rato. Por eso las tarjetas siguen sobre superficies sobrias: sin fondo saturado ni titular gigante. El estilo nuevo se nota en el color, los radios, el relieve del botón principal y las microinteracciones.

Todo el CSS nuevo está en una sección delimitada al final de `components/notes-view.module.css` (`=== Estilo nuevo · Apuntes ===`). No toca `app/globals.css` ni los tokens.

## Qué cambia

| Antes | Después | Por qué |
|---|---|---|
| «Listo» en texto verde | **Píldora lima** con el tick y el texto en tinta oscura: 15,62:1 en claro y 12,86:1 en oscuro | Toque de color. El lima de marca se usa solo para progreso y «hecho». Color, icono y texto van juntos (apple-design `color.md`, `accessibility.md`). |
| «Procesando» en texto gris | Píldora neutra sobre `--bg`: 5,81:1 en claro y 7,45:1 en oscuro | La misma forma que «Listo»: el estado se lee igual en todas las tarjetas. El punto de enganche de `thinking-orbs` sigue ahí. |
| El error | Sin cambios (texto rojo con icono) | Es un mensaje largo, no una etiqueta. |
| Tarjetas, esqueleto y anillo de foco con radio 20 px | 24 px (`--radius-panel`) | Formas más redondas. El anillo de foco sigue la tarjeta. |
| «Resumir», «Crear test» y «Volver a subir» con radio 22 px | Píldoras | Formas del estilo nuevo. |
| «Subir apuntes» plano | Con brillo arriba y una base más oscura de 3 px (`--gloss`), en la cabecera y en el estado vacío | Botón 3D de las referencias en la acción principal. Sigue con `.press` (0,97). |
| Zona de arrastre: solo cambiaba de color | Además crece a `scale(1.01)` mientras hay archivos encima (200 ms, `--ease`). Radio de 24 px | Respuesta física al arrastrar (emil-design-eng: solo `transform`). Con movimiento reducido no crece y solo cambia el color. |
| Estado vacío con radio 24 px | 32 px (`--radius-hero`). El círculo de subir de la ilustración lleva el borde blanco de pegatina (`--sticker-ring`) | La pegatina de la pantalla, sin añadir elementos. |
| «Aún no tienes apuntes» | «apuntes» con el subrayado a mano (`.marker`), con el mismo tamaño | Rasgo del estilo nuevo sin letra gigante. El texto no cambia. |

Se mantienen sin cambios:
- La entrada escalonada de las tarjetas (`--i × --stagger`, 7 como máximo).
- El hover, que sube 2 px y mueve la flecha, solo con puntero fino.
- La pulsación 0,97.
- El anillo de foco de toda la tarjeta.

**Marcado:** una clase (`s.upload`) en los dos botones «Subir apuntes» y el `.marker`. No cambian los textos ni el comportamiento.

## Skills aplicadas

- **emil-design-eng:**
  - Solo `transform` y `opacity` (la zona usa `scale`, no tamaño).
  - 200 ms con ease-out.
  - Hover solo con puntero fino.
  - Pulsación 0,97.
  - Reducido: nada se mueve.
- **apple-design:**
  - `color.md`: un color, un significado (lima = listo).
  - `accessibility.md`: contrastes medidos y 44 px intactos.
  - `feedback.md`: el estado vive en la tarjeta.
  - `branding.md`: la marca en un solo detalle por zona.
  - `dark-mode.md`: los tokens oscuros.
- **libraries-dev:** «Procesando» es una espera larga. Sigue el punto de enganche para `thinking-orbs` (pendiente del OK de Carlos). No se añade ningún efecto ni se instala nada.

## Evidencia

- **Capturas** (390 y 1280 px, claro y oscuro, y reducido): `antes/` y `despues/`.
- **Estado vacío:** `*/apuntes-vacio-escritorio-claro.webp` (1280 px, claro, sacado de `notes.spec.ts` con `CAPTURAS_DIR`).
- **Generador:**
  ```
  CAPTURAS_DIR=<dir> ESTILO_PANTALLAS=apuntes npx playwright test tests/browser/estilo-capturas.spec.ts
  ```
- **Pruebas:** `tests/browser/notes.spec.ts` › «estilo: …»:
  - la píldora lima (color, tinta, icono);
  - píldoras con anillo de foco;
  - el relieve y la pulsación 0,97 de «Subir apuntes»;
  - la zona a 1,01 al arrastrar;
  - con movimiento reducido, la zona no se mueve.
