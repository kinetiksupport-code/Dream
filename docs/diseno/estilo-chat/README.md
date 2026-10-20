# Estilo nuevo en el chat (PR 7, `PROMPT_EXAMEN_ESTILO.md` §2.3, §6 y §10)

Decisión de Carlos: en el chat se estudia durante horas. Por eso aquí **no hay fondo saturado ni titulares enormes**. El texto sigue sobre las superficies claras u oscuras de siempre. El estilo nuevo se nota en el color, los radios, una pegatina y las microinteracciones.

Todo el CSS nuevo está en `components/chat-estilo.module.css`. Una sola clase (`.estilo`) se pone en la vista de conversación (`.chat-view`). Inicio y el resto de `app/globals.css` no cambian.

## Qué cambia

| Antes | Después | Por qué |
|---|---|---|
| Icono del test generado en un cuadrado azul claro | Pegatina redonda **amarilla** (práctica) o **naranja** (examen), con tinta oscura, borde blanco, sombra suave y girada −6° | La pegatina del estilo nuevo, una sola por pantalla. Tinta oscura sobre amarillo (12,15:1) y naranja (5,79:1). La etiqueta «Práctica»/«Examen» dice lo mismo, así que no depende solo del color (apple-design `color.md`, `accessibility.md`). |
| «Empezar» plano | Píldora con brillo arriba y una base más oscura de 3 px (`--gloss`) | Relieve 3D de las referencias, sin cambiar tamaño ni texto. |
| La tarjeta del test aparecía con la entrada del mensaje | Además entra desde `scale(0.96)` con el muelle suave (`--dur-spring`, 250 ms), con `backwards` | emil-design-eng: «Never animate from scale(0)». Con `backwards`, al terminar vuelven a funcionar el hover (sube 2 px) y la pulsación (0,98). |
| Acciones de la respuesta (paso a paso, copiar, regenerar) aparecían a la vez | En las respuestas nuevas entran una tras otra, 40 ms entre ellas (3 como máximo), 200 ms con `--ease`. El historial nunca se anima | emil-design-eng › Stagger (30–80 ms, sin bloquear). Solo `transform` y `opacity`. |
| Chips, «Regenerar», «Reintentar», «Ver mensajes anteriores» y archivos con radio 22 px | Píldoras (`--radius-pill`) | Formas muy redondeadas del estilo nuevo. |
| Chip «Explícamelo por pasos» con hover gris | Con puntero fino, se calienta hacia amarillo (28 % sobre la superficie): 16,15:1 en claro y 7,79:1 en oscuro | Toque de color. Hover solo en `@media (hover: hover) and (pointer: fine)`. |
| Burbuja del alumno 22 px | 24 px con la esquina de cola de 8 px | Radios generosos, sin cambiar el color. |
| Caja del mensaje 24 px | 28 px (y su anillo de foco, 31 px) | Igual. El anillo de foco sigue apareciendo con fundido. |
| Botón de enviar plano | Con brillo cuando está activo | Relieve, sin animación nueva. |
| «Una idea cada vez.» (conversación de estudio vacía) | La palabra «idea» lleva el subrayado a mano (`.marker`), con el mismo tamaño y peso | El rasgo del estilo nuevo sin letra gigante. El texto no cambia. |
| Aviso de error 16 px | 24 px | Coherente con las tarjetas. |

Se mantienen sin cambios: la escala 0,97 al pulsar (`.press`), el anillo de foco global, el hover detrás de la media query, la entrada de 8 px de los mensajes nuevos, el cursor y el revelado suave.

**Una excepción:** la tarjeta del test sigue escalando a **0,98** al pulsar, no a 0,97. Es una superficie grande, y la regla ya usada para filas grandes (Más) es 0,98. Las pruebas existentes lo comprueban.

## Movimiento reducido

- La tarjeta y las acciones solo hacen un fundido (`fade-only`), sin retraso ni desplazamiento.
- Los botones no escalan al pulsar.
- Captura: `despues/chat-movil-reducido.webp`.
- Prueba: `tests/browser/chat-diseno.spec.ts` › «estilo: reduced motion…».

## Skills aplicadas

- **emil-design-eng:**
  - Pulsación 0,97.
  - Entradas con ease-out, nunca desde `scale(0)`.
  - Escalonado de 40 ms.
  - `backwards` para no bloquear el hover.
  - Hover solo con puntero fino.
  - Nada se anima con el teclado.
- **apple-design:**
  - `color.md`: un color, un significado (amarillo = práctica, naranja = examen, siempre con su texto).
  - `accessibility.md`: contraste AA medido y objetivos de 44 px intactos.
  - `dark-mode.md`: los tokens oscuros de PR 1.
  - `branding.md`: la marca vive en un elemento (la pegatina) y el contenido manda.
- **libraries-dev:**
  - Sin efectos nuevos. Las esperas de la IA siguen con el orbe (regla «menos de 2 s, nada»).
  - No se apila nada sobre la caja de texto. `thinking-orbs` y `border-beam` siguen pendientes del OK de Carlos.

## Evidencia

- **Capturas** (390 y 1280 px, claro y oscuro, y reducido):
  - Antes: `antes/`.
  - Después: `despues/`.
  - Pantallas: `chat` (conversación con test) y `chat-esperando` (estado de la IA).
- **Cómo se generan:**
  ```
  CAPTURAS_DIR=<dir> ESTILO_PANTALLAS=chat,chat-esperando npx playwright test tests/browser/estilo-capturas.spec.ts
  ```
- **Sin capturar:** la conversación de estudio vacía (con el subrayado), porque la fixture no tiene una unidad sin mensajes.
