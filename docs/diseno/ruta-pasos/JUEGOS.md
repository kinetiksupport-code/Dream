# Ruta de estudio · Entrega 0c: «Juega mientras esperas»

Prompt de la ruta, 0.10, y lámina «Minijuegos de espera · portadas» de Claude
Design. Va detrás de `DREAM_STUDY_STEPS_ENABLED`.

## Qué hace

- **Dónde:** de momento, en la única espera larga que ya existe, que es
  cuando Dream prepara las preguntas de un test o de un simulacro. La
  generación de lecciones (Entrega 2), el plano y la corrección del simulacro
  (Entrega 4) y la cola de la IA se enganchan con el mismo componente
  (`components/games/play-while-waiting.tsx`).
- **Siempre opcional:**
  - un botón secundario «Juega mientras esperas» debajo del estado de la
    espera;
  - nunca arranca solo;
  - solo se ofrece si la espera prevista pasa de 5 s.
- **Los cinco juegos**, de implementación propia y con los colores de Dream:
  - **Torre:** suelta cada bloque justo encima del anterior.
  - **Snake:** come estrellas sin chocarte contigo.
  - **Pong:** contra Orb.
  - **Koi:** sin final, para relajarse.
  - **Revienta el orbe:** sin vidas; si se escapa uno, se acaba.
- **Récord** en el dispositivo (`localStorage`, `dream-juego-<id>`, con
  `try/catch`). Es un número y no contiene nada personal. No hay ranking,
  servidor, cuenta, premios ni vidas.
- **Cuando la espera termina** (las preguntas se comprueban solas cada 5 s),
  la partida sigue: aparece «Tu test está listo · Empezar», y «Cerrar juego»
  está siempre a la vista.
- **Accesibilidad:**
  - teclado (flechas, Espacio, Intro) y toque;
  - botones de 44 px;
  - sin sonido y sin destellos;
  - se pausa al perder el foco o al ocultar la pestaña;
  - el estado de la espera se sigue anunciando (`role="status"`).
- **Rendimiento:** cada juego es un archivo que se descarga solo al pulsarlo,
  sin dependencias nuevas, sin red y sin anuncios. Pesan entre 1,5 y 2 KB
  comprimidos (el máximo era 30 KB).

## Comprobaciones (`tests/browser/juegos.spec.ts`)

| Comprobación | Resultado |
| --- | --- |
| Antes de pulsar no se descarga ningún juego; al pulsar, sí, y cada juego trae su propio archivo | ✓ |
| Con teclado (Espacio en Torre), pausa al perder el foco, «Seguir», fin de partida y récord guardado | ✓ |
| Cuando llegan las preguntas, «Tu test está listo · Empezar» sin cortar la partida; «Empezar» abre la pregunta | ✓ |
| Sin audio; «Cerrar juego» vuelve a ofrecer el botón | ✓ |
| Capturas de la espera y de un juego (móvil y escritorio, claro y oscuro) en `despues/espera-*` y `despues/juego-*` | ✓ |
| Probarlo en un móvil real (toque y rendimiento) | ✗ no se ha podido comprobar aquí |
