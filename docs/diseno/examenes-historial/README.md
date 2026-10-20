# Pantalla Exámenes: historial y «Crear examen» (PR 2)

Encargo: `PROMPT_EXAMEN_ESTILO.md` de Carlos (17/10/2026), apartados 4 y 5.8 (objeto en icono, sin modelos 3D) y 12.2. Base: PR #33 (`design/estilo-transiciones`), con la cursiva de los titulares ya unida.

## Auditoría previa (apartado 0.2) de `components/exams/exam-index.tsx`

**Qué había:** título «Exámenes» de 34 px con el botón azul «Añadir examen», un control segmentado «Próximos / Completados» y tarjetas grises con asignatura, título, fecha, días, línea de estado y barra de porcentaje del plan. Estado vacío con un dibujo de calendario. Esqueleto y error con reintentar.

**Problemas:**
- Los exámenes con la fecha ya pasada salían **los primeros** en «Próximos» (los días negativos ordenaban antes): ver `antes/lista-escritorio-claro.webp`, «Present perfect · Fecha pasada» arriba del todo.
- No había forma de borrar un examen ni de marcarlo como hecho desde la lista (solo desde el detalle).
- El estado era una frase gris con icono; el «preparando» y el «borrador» apenas se distinguían.
- Nada del estilo nuevo: ni color, ni titular, ni objeto de la asignatura.

**Qué cambio:** la pantalla entera (cabecera, secciones, tarjeta, acciones, vacío y esqueleto). El detalle solo recibe el objeto junto a su título, para la transición compartida.

## Qué hay ahora

| Antes | Después | Por qué |
|---|---|---|
| Título de 34 px y botón azul «Añadir examen» | Cabecera **azul eléctrico** (`.pop tone-blue pop-grid`, decisión de Carlos del 17/10) con «Exámenes» en `.hero-title` (Inter 800 cursiva real), una frase y **«Crear examen»** en botón 3D amarillo (`.button-3d tone-yellow` + `.press`: la cara baja 3 px y el botón escala a 0,97 en 120 ms) | §4.1; estilo de las fotos de referencia sin copiar su composición: dos objetos 3D flotando a la derecha (birrete y globo) |
| Pestañas «Próximos / Completados» | Secciones **Próximos** (por fecha; los borradores sin fecha al final) y **Anteriores** (fecha pasada o hechos; el más reciente primero), con su número | §4.2; arregla el orden de los pasados |
| Línea de estado gris | **Pegatina** con color **y** texto: Sin terminar (amarillo), Preparando (morado), Listo (verde), Algo falló (rojo), Hecho (azul) | §4.2; `accessibility.md › Convey information with more than color alone` |
| «12 días» en una chapa | «Faltan 12 días · 29 oct 2026», en ámbar con 3 días o menos; «Es hoy», «Es mañana», «Pasó hace 6 días», «Sin fecha» | §4.2 |
| Barra de porcentaje del plan | Barra de **unidades completadas** con «2 de 4 unidades» (`role=progressbar`, `aria-valuetext`) | §4.2; `progress-indicators.md`: determinada |
| Sin objeto | **Objeto 3D de la asignatura** (icono Fluent Emoji 3D, 56 px, tamaño fijo) en cada tarjeta | §4.2, §5.8 |
| Sin acciones | Botón «⋯» (44 px, «Más opciones de …») que abre una **hoja inferior** con «Marcar como hecho» y «Borrar examen»; borrar pide confirmación y deja **Deshacer** 5 s | §4.5; `action-sheets.md` |
| Dibujo de calendario | El **orbe** respirando, «Aún no tienes ningún examen» y «Crear examen» | §4.3; `writing.md › Provide clear next steps on any blank screens` |
| Esqueleto de dos tarjetas | Esqueleto con la cabecera y tres tarjetas con el hueco del objeto | `loading.md › Show something as soon as possible` |
| La tarjeta abre el detalle con la transición de página | Además, el **objeto viaja** de la tarjeta al título del detalle (View Transition `exam-object`) | §4.4, §3.3 |

Un borrador (`draft`) abre `/exams/new?id=…` (el asistente donde se quedó, PR 3); un examen fallido o listo abre su detalle.

## Decisiones técnicas

- **Borrar con Deshacer:** la tarjeta desaparece al momento y `exam_delete` se llama cuando acaba el aviso (5 s, se pausa con el puntero encima, con el foco o con la pestaña oculta: el `Toast` de siempre). Si borras otro antes, el primero se borra ya. Si sales de la página, también. Si falla, la tarjeta vuelve y el aviso ofrece «Reintentar». Es el mismo patrón que las conversaciones del Shell.
- **Confirmación y Deshacer a la vez:** `alerts.md` dice que no hace falta alerta para borrados que se pueden deshacer, pero el encargo pide confirmar (§4.5) porque se borran apuntes y simulacros. La confirmación va en la misma hoja, sin una alerta encima.
- **Transición compartida:** al pulsar la tarjeta, solo su objeto recibe `view-transition-name: exam-object`. El esqueleto del detalle ya pinta ese objeto en su sitio (la asignatura se guarda en una variable de módulo, solo en memoria), así que la transición lo encuentra aunque el examen aún se esté cargando. 240 ms con `--ease`; con movimiento reducido no se mueve.
- **Objeto en icono:** Fluent Emoji 3D (MIT, comprobada el 17/10; `docs/ASSETS_LICENCIAS.md`). WebP de 96 y 192 px (131 KB los 30 archivos; el mayor 12,9 KB) con `srcset` y tamaño fijo. Flota con `transform` en bucle (3,6 s); en las tarjetas está quieto (la lista se mira muchas veces: `emil-design-eng › Should this animate at all?`). **Matemáticas lleva un ábaco**: Fluent no tiene calculadora porque no existe ese emoji. El mapa está en `lib/subject-objects.ts` (único sitio) con pruebas.
- **Sin dependencias nuevas.** `three` no se usa aquí (PR 6).

## Backend (necesita el OK de Carlos para desplegar)

- **Acción nueva `exam_delete { exam_id }` en `dream-api`** (`supabase/functions/dream-api/exams.ts`): borra el examen del dueño (unidades, materiales y simulacros van en cascada) y su conversación de subida, que guarda el texto de los apuntes. Las conversaciones de estudio de cada unidad se quedan en el Historial. No necesita migración. Hasta desplegarla, borrar desde la lista da «No se pudo borrar el examen» y la tarjeta vuelve.

## Tamaño

`next build` (las mismas variables públicas de CI):

| Ruta | Antes (PR #33) | Después |
|---|---|---|
| `/exams` | 4,5 kB · 173 kB primera carga | 5,97 kB · 179 kB |
| `/exams/[id]` | 177 kB | 178 kB |
| Compartido por todas | 108 kB | 108 kB |

Los +6 kB de `/exams` son la hoja inferior, la pegatina y el aviso, que antes no cargaba esta página. Imágenes: cada tarjeta pide un WebP de 3–13 KB.

## Evidencia

- `antes/*.webp` y `despues/*.webp`: lista, vacía, cargando y error, a 390 y 1280 px, claro y oscuro, y la lista con movimiento reducido. `despues/acciones-movil-claro.webp`, `borrar-movil-claro.webp`, `deshacer-movil-claro.webp`: la hoja, la confirmación y el aviso con Deshacer. Las capturas «antes» usan los mismos datos, salvo el borrador sin fecha, que la versión anterior no admitía (con él se rompía).
- Grabaciones: `../grabaciones/examenes-historial-escritorio.webm` (hover de tarjetas, hoja, borrar, deshacer, pulsado del botón 3D, apertura del detalle con el objeto) y `examenes-historial-movil.webm`.
- Guion: `tests/browser/examenes-historial-capturas.spec.ts` (`CAPTURAS_DIR=…`, `ANTES=1`, `GRABAR=…`).

**No se ha podido comprobar:** un móvil real ni un lector de pantalla real.
