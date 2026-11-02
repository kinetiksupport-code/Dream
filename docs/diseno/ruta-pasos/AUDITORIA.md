# Ruta de estudio · Entrega 0 (solo rediseño)

Prompt de la ruta, Bloque 0 (0.1 a 0.7 y 0.9). Diseño: Claude Design «Dream ·
Experiencia de estudio» (PantallaRutaEscritorio, PantallaRutaMovil,
PantallaSimulacro*, PantallaTestMovil, Iconos3D y Reglas). Todo va detrás de
`DREAM_STUDY_STEPS_ENABLED` (`lib/study-steps.ts`):

| Dónde | Flag |
| --- | --- |
| Producción | **apagado** (la web se comporta exactamente como hoy) salvo que se ponga `NEXT_PUBLIC_DREAM_STUDY_STEPS_ENABLED=true` |
| Vistas previas de Vercel y local | encendido, para revisarlo (`=false` lo apaga) |

Sin funciones nuevas: los botones hacen lo mismo que hoy (abrir la lección,
crear un test de práctica, ir al simulacro, rehacer la ruta). Sin cambios en
`dream-api`, sin migraciones.

## 1. Inventario de lo que había (antes)

Capturas: `antes/` (móvil 390×844 y escritorio 1440×900, claro y oscuro).

### Ruta (`/exams/[id]/ruta`)

| Elemento | Para qué | Decisión |
| --- | --- | --- |
| «TU RUTA» + título + asignatura y fecha | identificar el examen | se queda, compacto (asignatura + título) |
| Tarjeta «Faltan 14 días» + «3 de 10 unidades» + barra | tiempo y avance | días a la cabecera; avance a la gema de preparación |
| «Vas bien» + frase de minutos | ritmo | se quita de la ruta (sigue en el detalle del examen) |
| «Tu camino» + «Ruta automática» + frase | explicación | se quita |
| 15 nodos en zigzag con tarjeta, tipo, nombre, tema, minutos, estado y anillo «sin datos aún» | el camino | 1 línea por nodo; lo hecho plegado; actual + 3 siguientes + «+N»; minutos, fecha, motivo y dominio a la hoja |
| «Rehacer mi ruta» | regenerar | al menú «⋯» |
| «Comparte tu avance» (tarjeta lateral) | compartir | se quita (Reglas, decisión 4: menú sin Compartir) |
| «Puedes abrir cualquier paso…» + «Volver al examen» | ayuda y vuelta | flecha «Examen» arriba |
| Hoja del nodo | detalle | se queda, con la hoja inferior de Dream (`BottomSheet`) |

### Simulacro (`/exams/[id]/sessions/[sid]`)

Más de 25 elementos (0.1). Lo que se quita: rótulo + título «Pon en práctica lo
que sabes» + subtítulo + rótulo del tema, el panel «Tu simulacro» (cuadrícula,
«0 de 10 respondidas», «Límite», «Respuestas guardadas», enlace), la tarjeta
«Sin pistas, sin presión», «Ocultar tiempo» y el segundo «Respuestas
guardadas». Lo que queda: X (con «¿Salir? Tu progreso se guarda»), barra,
contador (abre la hoja «Preguntas»), reloj en minutos (segundos solo en el
último), tema pequeño, enunciado, respuestas y Anterior/Siguiente. El guardado
es silencioso: solo se avisa si falla.

### Lección (`/exams/[id]/study/[unitId]`)

Se quita el panel lateral («Ahora, una idea tuya», «Tu plan», barra, minutos,
«Ver todas las unidades», «Ver mi ruta», nota) y los cuatro pasos
«Explicación · Ejemplo · Práctica · Comprensión». Queda: X a la ruta, título,
el tutor y dos acciones secundarias («Hacer el test», «He terminado la
lección»). Leer y el test dentro de la lección son la Entrega 2.

## 2. Recuento frente al presupuesto (0.4)

Prueba automática: `tests/browser/ruta-pasos.spec.ts` › «presupuesto de
elementos». Cuenta lo interactivo visible en la ventana (sin la navegación de
la app ni el aviso de IA); un grupo de controles hermanos cuenta 1, como en la
lámina Reglas.

| Pantalla | Antes | Después | Máximo |
| --- | --- | --- | --- |
| Ruta · móvil 390 | ≈ 20 (cabecera, ritmo, 15 nodos con 5 datos cada uno) | ≤ 12 ✓ | 12 |
| Ruta · escritorio 1440 | ≈ 22 | 12 ✓ | 12 |
| Pregunta del simulacro · móvil y escritorio | > 25 | 7 ✓ | 7 |
| Lección | ≈ 14 | 5 + el chat | 6 |

## 3. Mirada de 3 segundos

- **Ruta:** «Pulsa Continuar para hacer lo que toca» (una sola acción rellena).
- **Pregunta del simulacro:** «Elige una respuesta y pulsa Siguiente».
- **Lección:** «Habla con el tutor» (su botón es la única acción rellena).

## 4. Reglas que se aplican

| Pantalla | apple-design | emil-design-eng |
| --- | --- | --- |
| Ruta | `design-principles` › Simplicity; `layout` › jerarquía: solo el nodo actual brilla | Unseen details compound: el detalle va en la hoja, no en la lista |
| Fichas (piezas de Claude Design) | `buttons` › press state: todas con `.press` (scale .97) | Buttons must feel responsive |
| Hoja del nodo | `sheets.md` › «Display only one sheet at a time»; botón «Cerrar» visible | Curva de cajón `--ease-drawer`; cierre por velocidad (ya en `BottomSheet`) |
| Menú «⋯» | `modality` › menú ligero, no modal; Esc lo cierra | Popover desde su botón (`transform-origin: top right`), 200 ms ease-out |
| Pregunta | `progress-indicators.md` › «Display a progress indicator in a consistent location»; respuestas ≥ 44 px | La barra crece con `scaleX`, nunca `width` |
| Salir | `feedback.md` › avisar antes de perder datos; aquí no se pierde: «Tu progreso se guarda» | Modal centrado, «Quedarme» con foco |
| Guardado | `feedback.md` › «they only need to know when it doesn't [succeed]» | — |
| Movimiento | `motion.md` › «Make motion optional» | Un solo bucle en el nodo actual (el halo respira, solo `opacity`); con movimiento reducido, solo fundidos |

Las 24 microinteracciones y su tabla son la Entrega 0b; aquí solo queda lo
mínimo: `.press`, la hoja, el menú, la barra y el halo del nodo actual.

## 5. Decisiones y diferencias con el diseño

- **3 lecciones siguientes, no 4.** El prompt largo dice «el actual y las 4
  siguientes», pero el diseño de Claude Design enseña 3. Con 4, en escritorio
  la ruta llega a 13 elementos (el presupuesto es 12).
- **Sin «Repaso de hoy» ni «Lección» (crear) en la cabecera.** Las tarjetas y
  crear lecciones aún no existen (Entregas 2 y 3); no se pinta nada con datos
  falsos.
- **Dominio** = media de los tests terminados; si no hay, no se pinta.
  **Preparación** (la gema) = parte de la ruta hecha. Son datos distintos
  (Reglas, decisión 3).
- **Fichas 3D en los nodos.** El prompt largo decía «nodos simples; 3D solo en
  la cabecera», pero el diseño final de Claude Design (más reciente) usa fichas
  y el texto corto las pide. Son las piezas SVG del diseño
  (`public/estudio/3d/`). El WebGL es la Entrega 3.
- **Pantalla previa del simulacro («Empezar»):** no se ha hecho aquí. Hoy el
  reloj del servidor arranca al crear la sesión, así que una pantalla previa
  después de crearla gastaría tiempo. Va con la Entrega 4, que cambia la
  creación en el servidor.
- **Progreso:** la pestaña muestra la vista de Progreso que ya existe (de
  todos los exámenes; filtrarla por examen es trabajo de la Entrega 5).
- **«Explícame por qué»** en el test de práctica: aún no; hoy se ve la
  corrección y se sigue. Llega con la Entrega 2.

## 6. Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| Presupuesto de elementos (prueba automática, 390 y 1440) | ✓ |
| Recorrido ruta → «Continuar» → pregunta a pantalla completa (API simulada) | ✓ |
| Hoja del nodo, menú «⋯» sin Compartir ni Duelo, pestaña Progreso | ✓ |
| Movimiento reducido: ninguna animación con `transform` en la ruta | ✓ |
| Con el flag apagado: `study-path`, `exams` y `dream` del navegador (30 pruebas) | ✓ |
| `npm test` (396), `lint`, `typecheck`, `design:check` | ✓ |
| Contraste de lo nuevo: «Ahora» 4,84:1 (claro) y 5,76:1 (oscuro); texto secundario 5,41–7,45:1 | ✓ |
| Grabación de microinteracciones | ✗ (Entrega 0b) |
| Lector de pantalla real, móvil real a 60 fps | ✗ no se ha podido comprobar aquí |
| Capturas de los `.dc.html` al lado | ✗ el lienzo de Claude Design necesita su propio motor para pintarse; se compara con el artefacto abierto |
