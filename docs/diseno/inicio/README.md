# Inicio (`/chat` sin conversación)

**Rama:** `design/inicio`, sobre `design/cimientos`.
**Archivos:** `components/chat-home.tsx`, `components/composer.tsx` (variante hero), `components/chat-experience.tsx` (solo el paso de Inicio al chat y el foco de las sugerencias), `components/icons.tsx` (tres iconos nuevos), `lib/home-context.ts` (nuevo), `app/globals.css` (tokens `--home-halo` y la sección `/* === Inicio === */`), `scripts/design/contrast.mjs` (dos pares nuevos).
**Manda Claude Design:** `Main.dc.html` y `MovilInicio.dc.html`.

## Lo que vio Carlos

Un titular y una caja sobre un fondo plano. Tres botones pequeños, sin jerarquía, sin contexto y sin nada que invite a empezar.

## Cambios

| Before | After | Why |
| --- | --- | --- |
| Solo el titular «¿Qué quieres entender hoy?» | Encima del titular, un saludo con nombre y franja horaria: «Buenas tardes, Alex.» (días antes de las 13:00, tardes antes de las 20:00, noches después) | apple-design `layout.md › Visual hierarchy`: «Order content by relative importance… place the most important items near the top» |
| Sin contexto de estudio | «Hoy toca **Ecuaciones de primer grado** · 12 días para tu examen.» Sale del examen más cercano (`exams` y, si tiene unidades, `exam_get`). Sin IA. Sin examen no hay línea. Sin nombre, saludo sin nombre | apple-design `layout.md › Order content by relative importance`; `DISENO_AUDITORIA.md` §2 Inicio |
| La línea de contexto no existía | Carga sin bloquear: titular y caja salen al instante. La línea llega con un fundido de opacidad de 200 ms y se anuncia con `aria-live="polite"` | apple-design `loading.md › Show something as soon as possible`; emil `Should this animate at all?` (opacidad, no desplazamiento) |
| — | Si la línea tarda, esqueleto de una línea. Es invisible los primeros 300 ms (una respuesta rápida no lo enseña) y luego late en opacidad. Con movimiento reducido no late | apple-design `loading.md › Show something as soon as possible`; emil `Accessibility › prefers-reduced-motion` |
| Botones sin icono que solo ponían «Quiero practicar ejercicios de » | Tres sugerencias con icono (subir, lápiz, lista). Al pulsar rellenan la caja con un ejemplo útil, ponen el cursor al final y **no envían**: «Quiero practicar ejercicios de Ecuaciones de primer grado. Dame pistas, no la solución.» y «Hazme un test de 5 preguntas sobre Ecuaciones de primer grado.». Sin tema, la frase queda abierta. «Subir apuntes» abre el selector de archivos como antes | apple-design `buttons.md › Content` (icono + texto); `generative-ai.md` (ejemplos de entrada predefinidos); regla de producto: nunca dar la solución |
| Los tres botones entraban juntos (`rise-2`) | Entrada escalonada: `calc(100ms + i × var(--stagger))`, 240 ms con `--ease`. Relleno `backwards`, así la animación no bloquea el `:active` | emil `Stagger Animations` (30-80 ms, sin bloquear la interacción) |
| Hover solo de fondo | Hover (fondo + icono en `--primary-ink`, solo con `hover: hover`), pulsado `scale(.97)` y fondo `--chip-hover`, foco visible de 2 px | emil `Buttons must feel responsive`; apple-design `buttons.md › Always include a press state` |
| El botón enviar se veía igual vacío que lleno (azul con opacidad .4) | Dormido: fondo `--state-press`, icono `--text-secondary` y `scale(.9)`. Con texto: azul y `scale(1)`. Transición de 160 ms con `--ease` (vía `.press`) | emil `What is the purpose? › State indication` |
| Al enviar, la portada desaparecía de golpe | El botón se encoge (`scale(.9)`) y la portada hace un fundido de salida de 160 ms (`opacity` + `translateY(-8px) scale(.98)`) hacia el chat. La petición sale en el acto; solo el cambio de vista espera 160 ms. La caja conserva el texto mientras se funde | emil `Asymmetric enter/exit timing` (salida más rápida que la entrada); apple-design `motion.md › Let people cancel motion` |
| Altura ajustada en JS en cada tecla | `field-sizing: content` donde existe (máx. 180 px); en el resto, el ajuste en JS de siempre. Nunca se anima `height` | emil `Performance Rules › Only animate transform and opacity` |
| Anillo de foco de cimientos | Revisado: 2 px `--focus` en `::after` con fundido de opacidad; contraste 3,0:1 o más en claro y oscuro (`contrast.mjs`). Sin cambios | apple-design `accessibility.md › Let people use the keyboard alone` |
| Fondo plano | Claro: blanco como Claude Design, caja `--elevated` con sombra y sugerencias en `--surface`. Oscuro: capas `--bg` → `--surface` → `--elevated` y un halo radial **estático** detrás del titular (`--home-halo`, azul al 8 %). Medido en su centro: titular 14,46:1 y saludo 6,75:1 (antes 15,96 y 7,45) | apple-design `dark-mode.md › Mobile` (base y elevado); craft: nada de gradientes llamativos |
| Móvil: sugerencias de una en una al tener icono | Móvil: saludo en su línea, contexto debajo a 15 px, sugerencias en dos filas como en `MovilInicio.dc.html` | apple-design `layout.md › Adaptability` |

## Desvíos de Claude Design

- **Entrada de 240 ms, no 280 ms.** Uso el token `--dur-rise` de cimientos. La norma del repo pide entre 120 y 250 ms.
- **Saludo y contexto.** No están en el canvas. Los pide el encargo y la auditoría (§1 hallazgo 3 y §2 Inicio).
- **Iconos en las sugerencias.** El canvas no los tiene. Los pide el encargo.
- **Botón enviar gris cuando la caja está vacía.** El canvas lo dibuja siempre azul. El encargo pide el cambio de estado.

## Lo que no se ha tocado

- La caja del chat (variante `dock`) mantiene su botón. Los estilos nuevos van con `.composer-hero`, salvo `field-sizing`, que vale para las dos.
- No se usan `thinking-orbs` ni `border-beam`, a la espera del OK de Carlos. Punto de enganche: el `.composer.is-sending` de la caja hero. Ahí iría el borde de luz si la espera supera 3 s, pero aquí la portada se va en 160 ms. El sitio natural es la caja del chat.
- Los cinco atajos de `feat/atajos-chat` no se han incluido. Solo se ha reutilizado la idea de `upcomingExam` (`lib/home-context.ts`).

## Evidencia

**Capturas antes:** `../antes/inicio-escritorio-claro.webp`, `../antes/inicio-escritorio-oscuro.webp`, `../antes/inicio-movil-claro.webp`, `../antes/inicio-movil-oscuro.webp`.

**Capturas después:**

| | Claro | Oscuro |
|---|---|---|
| Escritorio | ![](inicio-escritorio-claro.webp) | ![](inicio-escritorio-oscuro.webp) |
| Móvil | ![](inicio-movil-claro.webp) | ![](inicio-movil-oscuro.webp) |

Estados: `inicio-cargando-escritorio-claro.webp` (esqueleto de la línea de contexto) e `inicio-sugerencia-escritorio-claro.webp` («Practicar ejercicios» ha rellenado la caja; el botón enviar está activo y el anillo de foco, visible).

**Grabación:** `../grabaciones/inicio.webm` (1280×800, 14 s, 506 KB). Se ve el esqueleto, el fundido de la línea de contexto, el hover y el pulsado de las sugerencias, cómo rellenan la caja, el botón enviar que pasa de dormido a activo al escribir, el foco con teclado y el envío con fundido hacia el chat.

## Comprobaciones

- `npm run typecheck`: sin errores.
- `npm run lint`: 0 errores y 0 avisos.
- `npm run test`: 61 de 61 (incluye `tests/home-context.test.ts`, 4 nuevas, y `design.test.ts`).
- `npm run design:check`: 7 de 7, más el contraste, con los dos pares nuevos del halo en verde.
- `npm run build`: sin avisos nuevos. El único aviso es el de la raíz del espacio de trabajo, que sale por el worktree (hay dos `package-lock.json`).
- Playwright (puerto 3202): `inicio.spec.ts` (16 nuevas), `design.spec.ts`, `dream.spec.ts`, `exams.spec.ts`, `observability.spec.ts` y `security.spec.ts`. Resultado: 61 de 61.
  - Qué prueba `inicio.spec.ts`:
    - Saludo según la hora, con `page.clock` (9, 12, 13, 19, 20 y 23 h).
    - Línea de contexto con examen, sin examen y lenta (esqueleto y fundido).
    - Las sugerencias rellenan la caja con el cursor al final y no hacen ninguna petición `chat`, `test_generate` ni `conversation_create`.
    - Hover, pulsado y foco con teclado.
    - Botón enviar desactivado (gris, `scale(.9)`) y activo (azul, `scale(1)`).
    - La caja crece sin animar la altura.
    - Envío: botón encogido, portada fundida y petición `chat` ya en marcha.
    - Movimiento reducido: nada se desplaza, el esqueleto no late y el botón no cambia de tamaño.
- Fluidez con la CPU 4 veces más lenta: esqueleto, fundido de la línea, pulsado de una sugerencia y escritura. 178 fotogramas, 0 por encima de 34 ms y máximo de 33 ms.
