# Objetos 3D reales en escritorio (PR 6, §5.8)

En escritorio con ratón o trackpad (1024 px o más), sin movimiento reducido, sin ahorro de datos, en un equipo con más de 4 núcleos y más de 4 GB, y con WebGL 2 por hardware, el objeto de la asignatura deja de ser un icono y pasa a ser un modelo 3D que gira despacio (una vuelta cada ~22 s) y se inclina un poco hacia el puntero. En los demás casos se queda el icono de Fluent Emoji 3D de siempre, y el código 3D ni se descarga.

Dónde: paso «Tu examen» del asistente, pantalla «Tu examen está listo» y el título del detalle del examen. Las tarjetas del historial siguen con el icono estático.

| Antes | Después | Por qué |
| --- | --- | --- |
| `antes/6-tu-examen-escritorio-claro.webp` (icono de ábaco) | `despues/6-tu-examen-escritorio-claro.webp` (calculadora 3D) | El encargo pide calculadora; Fluent no tiene, el modelo propio sí |
| `antes/6-tu-examen-escritorio-oscuro.webp` | `despues/6-tu-examen-escritorio-oscuro.webp` | Mismo modelo; la pantalla del asistente es azul en los dos modos |
| `antes/7-listo-escritorio-claro.webp` | `despues/7-listo-escritorio-claro.webp` | El objeto de la celebración gira junto al orbe |
| `antes/7-listo-escritorio-oscuro.webp` | `despues/7-listo-escritorio-oscuro.webp` | |
| — (icono estático, ver `docs/diseno/examenes-historial`) | `despues/detalle-escritorio-claro.webp`, `despues/detalle-escritorio-oscuro.webp` | Matraz 3D de 56 px junto al título |
| — | `despues/modelos-claro.webp`, `despues/modelos-oscuro.webp` | Los 15 modelos, uno por objeto del mapa |
| — | `despues/6-tu-examen-movil-claro.webp` | Móvil: icono estático, sin trozo 3D |
| — | `despues/6-tu-examen-escritorio-claro-reducido.webp` | Movimiento reducido: icono estático, sin trozo 3D |

Grabación: `docs/diseno/grabaciones/objetos-3d.webm` (el puntero rodea el objeto y este lo sigue; cambio de asignatura; pantalla «listo»).

Cómo se generan: `CAPTURAS_DIR=<carpeta> GRABAR=<carpeta> npx playwright test tests/browser/objetos-3d-capturas.spec.ts` (Chromium con WebGL por software; la prueba simula un equipo de 8 núcleos).

## Cómo funciona

- `components/subject-object-live.tsx`: pinta el icono (mismo tamaño fijo, no mueve nada). Si `lib/subject-3d.ts` dice que sí, monta un lienzo invisible encima y pide con `import()` `components/subject-3d/scene.ts`. Con el primer fotograma, icono y lienzo se cruzan con un fundido de 200 ms (solo opacidad).
- `components/subject-3d/models.ts`: los 15 modelos, hechos con formas de three y un plástico con barniz (clearcoat). Colores de los tokens `--pop-*`.
- Se para con la pestaña oculta o el objeto fuera de pantalla (IntersectionObserver). Al salir libera geometrías, materiales y el contexto WebGL.
- Vuelve al icono si WebGL falla o se pierde, si el trozo no carga o si el navegador marca WebGL como lento (por software).

## Tamaño

- Trozo 3D (solo escritorio capaz, carga diferida): three 127,5 KB + escena y modelos 4,1 KB = **131,6 KB con gzip** (límite 150 KB).
- JS inicial: igual en todas las rutas salvo `/exams/new` y `/exams/[id]`, que suben unos 0,9 KB con gzip (1,6 KB sin comprimir): el componente que decide si cargar el 3D.
