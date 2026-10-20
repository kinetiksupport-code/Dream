# Exámenes: evidencia de diseño

**Rama:** `design/examenes` (desde `design/cimientos`). **Rutas:** `/exams`, `/exams/new`, `/exams/[id]`, `/exams/[id]/plan` y `/exams/[id]/study/[unitId]`. La sesión de test y simulacro no se toca (está en `design/test`).

**Referencia:** Claude Design `Examenes.dc.html` (escritorio) y `MovilExamenes.dc.html` (móvil).

**Skills leídas enteras:**
- `emil-design-eng`.
- `apple-design`, con `accessibility`, `layout`, `typography`, `color`, `dark-mode`, `designing-for-ios`, `cross-platform`, `entering-data`, `text-fields`, `lists-and-tables`, `collections`, `loading`, `feedback`, `progress-indicators`, `writing`, `motion` y `buttons`.
- `libraries-dev`: sus `references/` no existen en esta sesión.

## Cambios

| Before | After | Why |
| --- | --- | --- |
| Lista con eyebrow «TU CURIOSIDAD, CON UN PLAN», titular «Prepárate con calma.», tres cifras y una columna lateral | `h1` «Exámenes» de 34 px y botón «Añadir examen». Una columna de 760 px y tarjetas por examen | Claude Design manda. apple `layout.md › Order content by relative importance` |
| Tarjeta estática con el enlace «Ver examen» dentro | Toda la tarjeta es un enlace. Hover: `translateY(-2px)` y sombra en un `::after` que solo anima `opacity`. La flecha se desplaza 4 px. Pulsado: `scale(.97)` a 160 ms. Foco: anillo de 2 px | emil `Only animate transform and opacity`, `Buttons must feel responsive` y `Touch device hover states`. La prueba mide cada estado |
| Entrada de las tarjetas: ninguna | `cardIn` de 8 px y 240 ms con `--ease`, escalonada 40 ms y `fill-mode: backwards`, para que no bloquee el hover | emil `Stagger Animations`: 30–80 ms, sin bloquear la interacción |
| «12 días» en azul, sin más | Chip con icono de calendario, `<b class="num">12</b> días` y «para el examen» oculto para lectores. Con 3 días o menos, ámbar con icono de alarma. Hoy y mañana se dicen con palabras | apple `accessibility.md › Convey information with more than color alone`; cifras tabulares (`.num`) |
| Exámenes sin orden | Próximos ordenados por fecha | apple `layout.md › Order content by relative importance` |
| Pestañas de texto de 40 px | Control segmentado de 36 px, con 44 px de área táctil gracias a `::after` | apple `accessibility.md › Offer sufficiently sized controls` |
| Carga: Orb a pantalla completa | Esqueleto con la forma de la lista (título, botón, segmentado y dos tarjetas). Solo pulso de opacidad, `aria-busy` y estado «Cargando tus exámenes» | apple `loading.md › Show something as soon as possible` |
| Vacío: tarjeta de texto | Ilustración SVG en línea con los tokens de color (se adapta al oscuro), «Aún no tienes exámenes» y botón «Preparar un examen» | apple `writing.md › Provide clear next steps on any blank screens` |
| Detalle con cuenta atrás azul, siguiente unidad, ritmo y materiales en la columna lateral | Jerarquía de Claude Design: bloque con asignatura, fecha, «Basado en…», días (`.num` grande), progreso y «Simulacro de examen». Debajo, «Plan de estudio» en filas de 64 px | Claude Design. La cuenta atrás lima sobre azul se cambia por el número en `--primary-ink` porque Claude Design no tiene ese bloque |
| Filas de unidad en tarjetas grandes | Filas como en Claude Design: etiqueta de 96 px («Hecha» con ✓, «Hoy», «Unidad N»), título, minutos y «Empezar / Seguir / Repasar» con chevron. En móvil, la etiqueta va encima y solo queda el chevron | Claude Design móvil. apple `lists-and-tables.md › Keep item text succinct` |
| Etiquetas «Hoy», «Mañana» y «[Día 3]» de Claude Design | «Hecha», «Hoy» y «Unidad N» | El backend no reparte unidades por días. Poner fechas sería inventarlas |
| Preparando: «Dream está organizando tus temas.» y un botón | Orbe, «Dream está preparando tu plan» (`role=status`, `aria-live`) y tres pasos concretos con los temas reales. Avisa de que puedes salir, comprueba solo cada 6 s (como mucho 20 veces) y ofrece «Comprobar ahora» con `aria-busy` | apple `progress-indicators.md › Avoid vague terms like loading`; `feedback.md` |
| Fallido: texto de `plan_error` y «Retomar preparación» | Bloque en `--danger-surface` con icono, título, causa (`role=alert`) y «Tus datos y materiales siguen guardados». Botones «Reintentar» (`exam_prepare`, `aria-busy`, «Reintentando…») y «Revisar datos» | apple `writing.md › Write clear error messages`; `feedback.md › Show people when a command can't be carried out` |
| Formulario con `required` del navegador y sin mensajes propios | `noValidate` y errores con su causa junto al campo, con icono, `aria-invalid` y `aria-describedby`. El foco va al primer campo con error. La fecha no puede ser pasada. Los temas son obligatorios en el paso 2 | apple `writing.md › Show errors right next to the field`; `entering-data.md › Dynamically validate` |
| Campos sin `id` ni `for`. «Cancelar» con flecha → | Etiquetas visibles unidas al campo, «(opcional)» donde toca y «Quedan N días» bajo la fecha. Campos de 44 px de alto o más. «Cancelar» sin flecha | apple `text-fields.md › include a separate label` |
| «Guardando…» solo con texto | Botón desactivado con `aria-busy="true"`, un spinner de 16 px y «Guardando…» | apple `buttons.md › Mobile: activity indicator` |
| Resumen con la fecha en ISO («2026-10-20») | Fecha en español («20 de octubre de 2026») y aviso «No resuelve el examen por ti» | Regla de producto: Dream nunca da el ejercicio resuelto |
| Estudio: eyebrow «ESTUDIAR / MATEMÁTICAS» y «Ver todas las unidades» con 20 px de alto | «Estudiar · Matemáticas», enlace de 44 px y botones con `.press` y `aria-busy` | apple `writing.md › capitalization`; `accessibility.md` |
| Movimiento reducido: no se trataba | Las tarjetas entran con un fundido, sin desplazamiento ni escala. Sin pulso del esqueleto ni giro del spinner | emil `prefers-reduced-motion` |

## Punto de enganche para `thinking-orbs`

En `components/exams/exam-page.tsx › PreparingState`, el `<Orb>` va dentro de `[data-hook="thinking-orb"]`. Con el OK de Carlos, se cambia por `<ThinkingOrb state="thinking" />` sin tocar nada más. No he instalado ningún paquete.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | 0 errores |
| `npx eslint . --ignore-pattern ".claude/**"` | 0 errores y 0 avisos |
| `npm run test` (incluye `design:check`) | 57/57 |
| `npm run design:check` | 7/7 y contraste AA en claro y oscuro |
| `npm run build` | Correcto. Solo sale el aviso de siempre: «inferred your workspace root», por el worktree |
| `design.spec.ts` + `exams.spec.ts` + `dream.spec.ts` + `examenes-diseno.spec.ts` (puerto 3209) | 56 pasan. Se saltan 41, que son las capturas y la grabación |
| Fluidez: hover por las tarjetas 3 veces, con la CPU ×4 | 191 fotogramas, 0 de más de 50 ms y máximo de 16,8 ms |

**Pruebas nuevas** (`tests/browser/examenes-diseno.spec.ts`):
- Estados de la tarjeta: reposo, hover (−2 px, sombra y flecha +4 px), pulsado (0,97) y foco.
- Movimiento reducido.
- Chip de días: `.num`, icono y ámbar cuando faltan 3 días o menos.
- Esqueleto, estado vacío, errores del formulario y botón cargando.
- Áreas táctiles de 44 px.
- Plan preparándose (con el enganche) y plan fallido con «Reintentar».
- Jerarquía del detalle.
- Sin scroll lateral a 360, 390 y 430 px, y en horizontal a 844 × 390.

**Cambios en `exams.spec.ts`:**
- Textos nuevos: «Exámenes», «Añadir examen» y «Simulacro de examen».
- Arreglo de la carrera del autoguardado: espera a `question_index = 1` antes de recargar (fc05702 de `design/chat`).

## Capturas y grabación

- **Después:** en esta carpeta, `<estado>-<movil|escritorio>-<claro|oscuro>.webp`.
  - Estados: `lista`, `lista-vacia`, `lista-cargando`, `detalle`, `plan`, `nuevo`, `nuevo-errores`, `preparando`, `fallido` y `estudio`.
  - También `examenes-*` y `examen-*`, de `capturas.spec.ts`.
- **Antes:** `../antes/examenes-*` y `../antes/examen-*`. Las de «antes» solo cubren la lista y el detalle. No he generado capturas «antes» del plan, del formulario, del estudio ni de los estados vacío, cargando, preparando y fallido.
- **Grabación:** `../grabaciones/examenes.webm`, de 1280 × 800, unos 15 s y 1,3 MB.
  - Hover por las tarjetas, pulsado y foco con el teclado.
  - Formulario: errores y botón cargando.
  - Plan fallido: «Reintentar» y paso al plan, con hover en una fila.

## Lo que no se ha podido comprobar

- Vibración ni tacto en un móvil real: solo Chromium emulado.
- VoiceOver o TalkBack reales. Lo que sí se comprueba son los roles, `aria-*` y las descripciones accesibles.
- Las capturas usan la fecha en formato `mm/dd/yyyy` porque Chromium va en inglés. En un navegador en español sale `dd/mm/aaaa`.
- La página de estudio sigue con `ExamFrame`. Se ven dos avisos «Dream puede equivocarse», el del chat y el del marco. No he comprobado si ya pasaba antes. No lo cambio para no tocar `ChatExperience`.
