# Ajustes con el estilo nuevo (PR 8 del encargo de estilo)

Encargo: `PROMPT_EXAMEN_ESTILO.md`, apartados 2, 6 y 10, más las decisiones de Carlos del 17/10:
- Titulares en la cursiva pesada de Inter 800, solo con `.hero-title`.
- Amarillo y naranja siempre con texto oscuro.
- Fondos saturados solo en las pantallas clave.
- Legible en todas partes.

Base: `design/asistente-examen` (PR #35).

## Decisión: pantalla sobria

Ajustes es una pantalla de uso ocasional, con datos de la cuenta, privacidad y acciones que no se pueden deshacer. **No lleva fondo saturado.** Ya tenía bien resueltos varios detalles en el PR #23, y se mantienen igual:
- la píldora del tema;
- el fundido del tema;
- el interruptor;
- los diálogos centrados;
- el aviso.

Este PR añade el titular, una entrada escalonada y dos toques de color.

**No cambia nada de comportamiento ni de texto.** Los diálogos, los botones de privacidad, «Cerrar sesión», el consentimiento de analítica y el límite de uso son los mismos.

## Antes | Después | Por qué

| Antes | Después | Por qué |
|---|---|---|
| `h1.title` «Ajustes» | `.hero-title` (Inter 800 cursiva) con la palabra subrayada a mano, que se dibuja una vez | Decisión de Carlos sobre los titulares; el subrayado es decorativo |
| Las secciones aparecen de golpe | El titular y las secciones suben 8 px con fundido, 40 ms entre cada una y como mucho 8 (240 ms, `--ease`) | §6 «aparición escalonada». Es decorativo y no bloquea nada (emil-design-eng › *Stagger*) |
| Perfil: solo la lista de nombre y correo | Una pegatina redonda amarilla con la inicial (`<Sticker shape="round" tone="yellow">`, tinta oscura) junto a la lista | Toque de color e identidad sin texto nuevo. Va dentro de `aria-hidden`, porque el nombre y el correo ya están al lado |
| Icono del tema elegido en gris | El icono elegido toma su tono: naranja para Claro (`--pop-orange`, 3,39:1 sobre blanco), morado para Oscuro y azul para Sistema. En modo oscuro, los tres van en amarillo (`--pop-yellow`) | El color acompaña, nunca sustituye a la etiqueta (`accessibility.md › Convey information with more than color alone`). Solo funde el color |
| Pulsación, hover y foco | Sin cambios: `.press` a 0,97, hover solo con puntero fino y anillo `:focus-visible` de 2 px. Ya los cubre `ajustes.spec.ts` | emil-design-eng › *Buttons must feel responsive* y *Touch device hover states* |
| Movimiento reducido | Las secciones solo funden (120 ms). El resto ya lo cumplía: la píldora salta y los diálogos funden | `motion.md › Make motion optional` |

**Lo que no toco a propósito:**
- **El porcentaje del límite de uso no lleva número animado.** `modes.spec.ts` lee la etiqueta completa («Normal: 63 % usado») y el encargo solo pide números animados en Progreso. La barra ya se rellena con `scaleX`.
- **`Modal` y `Toast` son componentes compartidos.** Se quedan como están.

## Archivos

- `app/(dream)/settings/page.tsx`: el titular, la pegatina del perfil y una clase por opción de tema.
- `app/(dream)/settings/settings.module.css` (nuevo): todo el estilo de este PR. **No se toca `app/globals.css` ni se añaden tokens.**
- `tests/browser/ajustes-estilo.spec.ts` (nuevo): comprueba
  - la cursiva del titular;
  - el escalonado de 40 ms;
  - que solo se anima `transform` y `opacity`;
  - que la pegatina es decorativa;
  - el color del icono;
  - que con movimiento reducido nada se mueve.
- `tests/browser/ajustes-capturas.spec.ts` y `tests/browser/full-shot.ts`: capturas y grabación (solo con `CAPTURAS_DIR` o `GRABAR`).

## Evidencia

- Antes: `antes/ajustes-{movil,escritorio}-{claro,oscuro}.webp`, `antes/ajustes-dialogo-*.webp` y `antes/ajustes-reducido-*.webp`.
- Después: los mismos nombres en `despues/`.
- Movimiento reducido: `despues/ajustes-reducido-60ms-movil-claro.webp` es una captura a los 60 ms de cargar, con todo ya en su sitio.
- Grabación (1280×800): `../grabaciones/estilo-ajustes.webm`. Muestra la entrada, los tres temas con la píldora y el icono, el interruptor y el diálogo de borrar historial.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| lint (`--max-warnings 0`) | 0 errores, 0 avisos |
| `npm test` | 215 de 215 |
| `npm run design:check` | 13 de 13 y todos los pares de contraste AA |
| `npx next build` | correcto |
| Playwright: `ajustes`, `ajustes-estilo`, `limits`, `modes`, `design`, `transiciones`, `navegacion` | 82 pasan y 7 se saltan porque necesitan `CAPTURAS_DIR`, `GRABACION_DIR` o `GRABAR` |

**Fallo intermitente en `limits.spec.ts`:** a veces falla una de sus 3 pruebas. Esas pruebas usan `/chat` (la cola de mensajes). Pasa igual en la rama de Progreso, que tampoco toca el chat: allí ha fallado en 3 de 4 ejecuciones. Al repetirla sola en esta rama, ha pasado 2 de 3 veces. Es un fallo previo de tiempos, ajeno a este PR.

**Tamaño:** `/settings` pasa de 6,8 kB a 7,66 kB (primera carga de 186 kB a 187 kB) por `<Sticker>`. El JS compartido no cambia (108 kB).

**No comprobado:** un móvil real y un lector de pantalla real.
